// ============================================================
// PARTE 3A — src/review/campaignReview.ts
// ============================================================
// Diagnóstico y refactorización del código del compañero.
//
// PROBLEMAS IDENTIFICADOS (explicados en README):
//
// PROBLEMA 1 — Sin manejo de errores en fetchCampaignData():
//   El código original hace await axios.get() sin try/catch.
//   Si la red falla, el error no capturado burbujea hasta el
//   caller y puede romper toda la ejecución de processCampaigns().
//   Un solo ID fallido detiene el procesamiento de todos los demás.
//
// PROBLEMA 2 — División por cero en el cálculo de CTR:
//   ctr: data.clicks / data.impressions
//   Si impressions === 0 (campaña recién creada o dato corrupto),
//   el resultado es Infinity o NaN. Estos valores no son detectables
//   por los umbrales del sistema (NaN < 2.5 === false).
//
// PROBLEMA 3 — Sin tipado de la respuesta de axios:
//   axios.get() sin genérico retorna AxiosResponse<any>.
//   Esto hace que data.clicks sea any implícito, perdiendo
//   todos los beneficios de TypeScript en tiempo de compilación.
//
// PROBLEMA 4 — processCampaigns() es secuencial innecesariamente:
//   El loop for...of con await dentro procesa una campaña a la vez.
//   Para N=100 campañas con 500ms de latencia = 50 segundos mínimo.
//   Con concurrencia controlada de 3 → ~17 segundos.
// ============================================================

import axios from 'axios';

// ── Tipos explícitos para la respuesta de la API ─────────────
// CORRECCIÓN del Problema 3: axios.get tipado con genérico.

type RawCampaignApiResponse = {
  id: string;
  clicks: number;
  impressions: number;
};

type CampaignData = {
  id: string;
  clicks: number;
  impressions: number;
  ctr: number;
};

type LowCtrCampaign = CampaignData & { ctr: number };

// ── fetchCampaignData REFACTORIZADA ─────────────────────────
// CORRECCIONES:
//   [P1] try/catch con error tipado — errores de red capturados
//   [P2] Guard para impressions === 0 — evita NaN/Infinity
//   [P3] axios.get<RawCampaignApiResponse> — tipado explícito

async function fetchCampaignData(campaignId: string): Promise<CampaignData | null> {
  try {
    // [P3] Genérico en axios.get — data es RawCampaignApiResponse, no any
    const response = await axios.get<RawCampaignApiResponse>(
      `https://api.example.com/campaigns/${campaignId}`
    );
    const data = response.data;

    // [P2] Guard de división por cero
    if (!data.impressions || data.impressions === 0) {
      console.warn(`[WARN] Campaña ${campaignId} tiene impressions=0, CTR no calculable.`);
      return null;
    }

    return {
      id: data.id,
      clicks: data.clicks,
      impressions: data.impressions,
      ctr: data.clicks / data.impressions,
    };
  } catch (err) {
    // [P1] Error de red capturado — no burbujea al caller
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ERROR] fetchCampaignData(${campaignId}): ${message}`);
    return null;  // Retornamos null para que el caller decida cómo manejarlo
  }
}

// ── processCampaigns CON CONCURRENCIA CONTROLADA ─────────────
// DIFERENCIAL OPCIONAL: reemplaza el loop secuencial por un pool
// de concurrencia máxima configurable.
//
// MECANISMO:
//   1. Divide el array de IDs en chunks de tamaño MAX_CONCURRENCY
//   2. Procesa cada chunk en paralelo con Promise.all()
//   3. Los chunks se procesan secuencialmente entre sí
//
// Resultado: máximo MAX_CONCURRENCY requests simultáneas en todo momento.
// Más predecible y throttle-friendly que p-limit para esta escala.

const MAX_CONCURRENCY = 3;

async function processCampaigns(ids: string[]): Promise<CampaignData[]> {
  const results: CampaignData[] = [];

  // Dividir en chunks de MAX_CONCURRENCY
  for (let i = 0; i < ids.length; i += MAX_CONCURRENCY) {
    const chunk = ids.slice(i, i + MAX_CONCURRENCY);

    // Procesamos el chunk en paralelo
    const chunkResults = await Promise.all(
      chunk.map((id) => fetchCampaignData(id))
    );

    // Filtramos los nulls (errores o impressions=0)
    const validResults = chunkResults.filter(
      (r): r is CampaignData => r !== null
    );

    results.push(...validResults);
  }

  return results;
}

// ── NUEVA FUNCIÓN: filtrar campañas con CTR bajo ──────────────
// Requerimiento de la prueba: retornar campañas con ctr < 0.02,
// ordenadas de menor a mayor CTR.
//
// Nota: ctr aquí es el ratio crudo (clicks/impressions), no porcentaje.
// 0.02 = 2% de CTR — umbral alto, detectará la mayoría de campañas display.

const CTR_LOW_THRESHOLD = 0.02;

function filterLowCtrCampaigns(campaigns: CampaignData[]): LowCtrCampaign[] {
  return campaigns
    .filter((c) => c.ctr < CTR_LOW_THRESHOLD)
    .sort((a, b) => a.ctr - b.ctr); // ascendente: el peor CTR primero
}

// ── Exportaciones ─────────────────────────────────────────────
export {
  fetchCampaignData,
  processCampaigns,
  filterLowCtrCampaigns,
  CampaignData,
  LowCtrCampaign,
};
