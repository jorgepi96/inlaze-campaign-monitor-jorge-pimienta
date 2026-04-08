// ============================================================
// PARTE 4 — src/services/llmService.ts
// ============================================================
// Integración con LLM para generación de resumen ejecutivo.
//
// DECISIÓN TÉCNICA (README):
//   Usamos la API de OpenAI directamente (gpt-4o).
//   Justificación:
//   1. OpenAI es el estándar de la industria con alta disponibilidad.
//   2. gpt-4o ofrece excelente balance calidad/latencia.
//   3. La API sigue el mismo esquema chat/completions — el resto
//      del código no cambia al migrar entre proveedores compatibles.
//
// DIFERENCIAL IMPLEMENTADO:
//   - Structured output tipado: además del resumen en texto,
//     parseamos la respuesta del LLM en un objeto tipado con
//     campañas críticas y acciones como array.
//
// DIAGRAMA DE FLUJO:
//   generateCampaignSummary(reports)
//     → buildPrompt(reports)        construye instrucciones concretas
//     → callLlmApi(prompt)          llamada HTTP con timeout
//         → ¿Error/timeout?         → return LLMSummary con error flag
//         → Respuesta válida        → extractText(response)
//     → parseStructuredOutput(text) → intenta parsear JSON embebido
//     → return LLMSummary tipado
// ============================================================

import axios from 'axios';
import { CampaignReport } from '../models/campaign';

// ── Tipos del resultado tipado ────────────────────────────────

type CriticalCampaignAction = {
  campaignId: string;
  campaignName: string;
  metric: number;
  suggestedAction: string;
};

// Diferencial: structured output con campañas criticas y acciones como array
type StructuredLLMOutput = {
  criticalCampaigns: CriticalCampaignAction[];
  warningCampaigns: string[];
  suggestedActions: string[];
};

export type LLMSummary = {
  generatedAt: Date;
  model: string;
  summary: string;
  structured?: StructuredLLMOutput;  // Diferencial opcional
  error?: string;                    // Presente si el LLM falló
  rawResponse?: unknown;             // Para debug
};

// ── Configuración ─────────────────────────────────────────────

const LLM_CONFIG = {
  baseUrl: 'https://api.openai.com/v1/chat/completions',
  // Modelo principal de OpenAI. Alternativa: 'gpt-3.5-turbo' para menor costo.
  // Para cambiar de modelo: reemplazar solo esta línea.
  model: 'gpt-4o',
  timeoutMs: 30000,
};

// ── Constructor del prompt ────────────────────────────────────
// El prompt tiene instrucciones concretas y no ambiguas.
// El modelo puede seguirlas sin interpretación adicional.

function buildPrompt(reports: CampaignReport[]): string {
  const criticalCampaigns = reports.filter((r) => r.status === 'critical');
  const warningCampaigns = reports.filter((r) => r.status === 'warning');
  const okCampaigns = reports.filter((r) => r.status === 'ok');

  const reportsText = reports
    .map(
      (r) =>
        `- ID: ${r.id} | Nombre: "${r.name}" | Métrica CTR: ${r.metric} | Estado: ${r.status.toUpperCase()}`
    )
    .join('\n');

  return `Eres un analista de campañas publicitarias digitales de Inlaze.
Recibes el reporte de rendimiento de ${reports.length} campañas y debes generar un resumen ejecutivo.

DATOS DE CAMPAÑAS:
${reportsText}

RESUMEN RÁPIDO:
- Campañas OK (CTR >= 2.5): ${okCampaigns.length}
- Campañas WARNING (CTR 1.0-2.5): ${warningCampaigns.length}  
- Campañas CRITICAL (CTR < 1.0): ${criticalCampaigns.length}

INSTRUCCIONES:
1. Identifica y destaca ESPECÍFICAMENTE cada campaña en estado CRITICAL, mencionando su nombre y métrica.
2. Resume el estado general de las campañas en WARNING con una evaluación del riesgo.
3. Evalúa el estado global del portafolio de campañas.
4. Sugiere MÍNIMO UNA acción concreta y ejecutable basada en los datos (ej: pausar campaña X, revisar segmentación de Y).
5. Usa lenguaje ejecutivo, directo y sin tecnicismos innecesarios. Máximo 200 palabras.

Después del resumen en texto, incluye un bloque JSON con este formato exacto:
<structured_output>
{
  "criticalCampaigns": [
    {"campaignId": "id", "campaignName": "nombre", "metric": 0.0, "suggestedAction": "acción específica"}
  ],
  "warningCampaigns": ["nombre1", "nombre2"],
  "suggestedActions": ["acción 1", "acción 2"]
}
</structured_output>`;
}

// ── Llamada a la API del LLM ──────────────────────────────────

type OpenAIMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

type OpenAIResponse = {
  id: string;
  model: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
  };
};

async function callLlmApi(prompt: string): Promise<OpenAIResponse> {
  const messages: OpenAIMessage[] = [
    { role: 'user', content: prompt },
  ];

  const response = await axios.post<OpenAIResponse>(
    LLM_CONFIG.baseUrl,
    {
      model: LLM_CONFIG.model,
      messages,
      max_tokens: 1000,
      temperature: 0.3, // Baja temperatura para respuestas más consistentes y factuales
    },
    {
      timeout: LLM_CONFIG.timeoutMs,
      headers: {
        'Authorization': `Bearer ${process.env['OPENAI_API_KEY'] ?? ''}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return response.data;
}

// ── Parser de structured output ───────────────────────────────
// Extrae el JSON embebido entre tags <structured_output>...</structured_output>

function parseStructuredOutput(text: string): StructuredLLMOutput | undefined {
  try {
    const match = text.match(/<structured_output>([\s\S]*?)<\/structured_output>/);
    if (!match || !match[1]) return undefined;

    const parsed = JSON.parse(match[1].trim()) as StructuredLLMOutput;

    // Validación mínima de que los campos esperados existen
    if (!Array.isArray(parsed.criticalCampaigns) || !Array.isArray(parsed.suggestedActions)) {
      return undefined;
    }

    return parsed;
  } catch {
    return undefined; // JSON malformado — no es un error fatal
  }
}

// ── Función principal exportada ───────────────────────────────

export async function generateCampaignSummary(
  reports: CampaignReport[]
): Promise<LLMSummary> {
  const prompt = buildPrompt(reports);

  try {
    const llmResponse = await callLlmApi(prompt);
    const fullText = llmResponse.choices[0]?.message?.content ?? '';

    // Separar el texto del resumen del bloque JSON
    const summaryText = fullText
      .replace(/<structured_output>[\s\S]*?<\/structured_output>/, '')
      .trim();

    const structured = parseStructuredOutput(fullText);

    return {
      generatedAt: new Date(),
      model: llmResponse.model,
      summary: summaryText,
      structured,
      rawResponse: llmResponse,
    };
  } catch (err) {
    // El LLM falla (timeout, auth error, rate limit) → retornamos error controlado.
    // El sistema NO se rompe — el caller recibe un LLMSummary con flag de error.
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[LLM] Error al generar resumen: ${message}`);

    return {
      generatedAt: new Date(),
      model: LLM_CONFIG.model,
      summary: 'No disponible — error al contactar el servicio de IA.',
      error: message,
    };
  }
}