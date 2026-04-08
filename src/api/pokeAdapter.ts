// ============================================================
// API ADAPTER — src/api/pokeAdapter.ts
// ============================================================
// Adaptador que simula una fuente de datos de campañas.
//
// DECISIÓN TÉCNICA (README):
//   En el entorno de CI/sandbox, las APIs externas están bloqueadas.
//   El mock implementado aquí replica fielmente el comportamiento
//   de una API real: latencia variable, errores ocasionales, y
//   datos con distribución realista de métricas.
//   Para conectar a PokeAPI o Google Ads API real, solo se reemplaza
//   la función callExternalApi(). El resto del sistema no cambia.
//
// DIAGRAMA DE FLUJO:
//   fetchCampaign(id)
//     → callExternalApi(id)
//         → ¿Error de red simulado? → retry con backoff exponencial
//         → ¿Campaña no existe?    → throw 404-equivalent
//         → Respuesta válida       → transformToCampaignReport()
//     → evaluateThreshold(metric)
//     → return CampaignReport
// ============================================================

import { CampaignReport, CampaignStatus } from '../models/campaign';
import { withRetry } from '../utils/retry';

// ── Shape de la respuesta cruda de la API ────────────────────
// En producción: definir según el contrato real de la API externa.

type RawApiCampaign = {
  id: string;
  campaign_name: string;
  clicks: number;
  impressions: number;
  spend_usd: number;
};

// ── Dataset de campañas simuladas ───────────────────────────
// Distribuidas en los tres rangos de métrica (ok, warning, critical)
// para que la demo sea ilustrativa.
//
// Métrica = (clicks / impressions) * 1000 → escala 0-10
// Umbrales: < 1.0 critical | < 2.5 warning | >= 2.5 ok

const MOCK_CAMPAIGNS: Record<string, RawApiCampaign> = {
  'camp-001': { id: 'camp-001', campaign_name: 'Black Friday LATAM',     clicks: 4800, impressions: 96000,  spend_usd: 1200 },
  'camp-002': { id: 'camp-002', campaign_name: 'Retargeting Mexico',     clicks: 320,  impressions: 160000, spend_usd: 800  },
  'camp-003': { id: 'camp-003', campaign_name: 'Brand Awareness Q2',     clicks: 90,   impressions: 900000, spend_usd: 2000 },
  'camp-004': { id: 'camp-004', campaign_name: 'Conversion App Install', clicks: 2100, impressions: 70000,  spend_usd: 650  },
  'camp-005': { id: 'camp-005', campaign_name: 'Prospecting Colombia',   clicks: 180,  impressions: 360000, spend_usd: 500  },
  'camp-006': { id: 'camp-006', campaign_name: 'Video Views Chile',      clicks: 5500, impressions: 110000, spend_usd: 900  },
};

export const AVAILABLE_CAMPAIGN_IDS = Object.keys(MOCK_CAMPAIGNS);

// ── Simulador de llamada HTTP ────────────────────────────────
// En producción, reemplazar el cuerpo de esta función por:
//   const response = await axios.get<RawApiCampaign>(
//     `https://api.example.com/campaigns/${campaignId}`,
//     { timeout: 8000 }
//   );
//   return response.data;

async function callExternalApi(campaignId: string): Promise<RawApiCampaign> {
  // Simular latencia de red (80-250ms)
  await new Promise<void>((res) => setTimeout(res, 80 + Math.random() * 170));

  // Simular fallo de red en camp-005 con probabilidad 15%
  // Demuestra que el retry con backoff funciona en accion
  if (campaignId === 'camp-005' && Math.random() < 0.15) {
    throw new Error('ECONNRESET: Connection reset by peer');
  }

  const campaign = MOCK_CAMPAIGNS[campaignId];
  if (!campaign) {
    throw new Error(`Campaign not found: ${campaignId} (HTTP 404)`);
  }

  return campaign;
}

// ── Evaluador de umbrales ────────────────────────────────────
// Separado para ser testeable de forma aislada.
// Los umbrales son los definidos en la prueba tecnica.

export function evaluateThreshold(metric: number): CampaignStatus {
  if (metric < 1.0) return 'critical';
  if (metric < 2.5) return 'warning';
  return 'ok';
}

// ── Transformador de formato ─────────────────────────────────
// Convierte RawApiCampaign → CampaignReport tipado.
// Metrica = (clicks / impressions) * 1000

function transformToCampaignReport(raw: RawApiCampaign): CampaignReport {
  const metric = parseFloat(((raw.clicks / raw.impressions) * 1000).toFixed(2));
  const status = evaluateThreshold(metric);

  return {
    id: raw.id,
    name: raw.campaign_name,
    metric,
    status,
    evaluatedAt: new Date(),
  };
}

// ── Fetch individual con retry ───────────────────────────────
// Reintenta hasta 3 veces con backoff exponencial en caso de
// errores de red. Errores 404 fallan inmediatamente.

export async function fetchCampaign(campaignId: string): Promise<CampaignReport> {
  const rawData = await withRetry(
    () => callExternalApi(campaignId),
    {
      maxAttempts: 3,
      baseDelayMs: 1000,
      onRetry: (attempt, error) => {
        console.warn(`  [RETRY] Intento ${attempt} para ${campaignId}: ${error.message}`);
      },
    }
  );

  return transformToCampaignReport(rawData);
}

// ── Fetch en lote ────────────────────────────────────────────
// Un error individual no detiene el procesamiento del resto.

export async function fetchAllCampaigns(
  campaignIds: string[]
): Promise<CampaignReport[]> {
  const results: CampaignReport[] = [];

  for (const id of campaignIds) {
    try {
      const report = await fetchCampaign(id);
      results.push(report);
      console.log(
        `  [OK] ${report.name.padEnd(32)} metric: ${String(report.metric).padStart(5)} → ${report.status.toUpperCase()}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  [ERROR] Campania ${id}: ${message}`);
    }
  }

  return results;
}
