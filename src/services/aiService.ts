import { OpenAI } from 'openai';
import { CampaignReport } from '../models/campaign';

// Tipado estricto
export interface CriticalCampaignAction {
  campaignId: string;
  campaignName: string;
  metric: number;
  suggestedAction: string;
}

export interface StructuredLLMOutput {
  criticalCampaigns: CriticalCampaignAction[];
  warningCampaigns: string[];
  suggestedActions: string[];
}

export interface LLMSummary {
  generatedAt: Date;
  model: string;
  summary: string;
  structured?: StructuredLLMOutput;
  error?: string;
  rawResponse?: unknown;
}

// Se instancia el cliente usando la clave desde las variables de entorno
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
  timeout: 30000,
});

export async function generateCampaignSummary(reports: CampaignReport[]): Promise<LLMSummary> {
  const model = 'gpt-4o';
  const criticalCampaigns = reports.filter((r) => r.status === 'critical');
  const warningCampaigns = reports.filter((r) => r.status === 'warning');
  const okCampaigns = reports.filter((r) => r.status === 'ok');

  const reportsText = reports
    .map((r) => `- ID: ${r.id} | Nombre: "${r.name}" | Métrica: ${r.metric} | Estado: ${r.status.toUpperCase()}`)
    .join('\n');

  const prompt = `Eres un analista de campañas publicitarias digitales de Inlaze.
Recibes el reporte de rendimiento de ${reports.length} campañas y debes generar un resumen ejecutivo.

DATOS DE CAMPAÑAS:
${reportsText}

RESUMEN RÁPIDO:
- Campañas OK: ${okCampaigns.length}
- Campañas WARNING: ${warningCampaigns.length}  
- Campañas CRITICAL: ${criticalCampaigns.length}

INSTRUCCIONES:
1. Identifica y destaca ESPECÍFICAMENTE cada campaña en estado CRITICAL, mencionando su nombre y métrica.
2. Resume el estado general de las campañas en WARNING con una evaluación del riesgo.
3. Evalúa el estado global del portafolio.
4. Sugiere MÍNIMO UNA acción concreta (ej: pausar campaña X).
5. Usa lenguaje ejecutivo, directo. Máximo 200 palabras.

Después del resumen en texto, incluye un bloque JSON válido con este formato exacto:
<structured_output>
{
  "criticalCampaigns": [
    {"campaignId": "id", "campaignName": "nombre", "metric": 0.0, "suggestedAction": "acción específica"}
  ],
  "warningCampaigns": ["nombre1", "nombre2"],
  "suggestedActions": ["acción 1", "acción 2"]
}
</structured_output>`;

  try {
    const response = await openai.chat.completions.create({
      model: model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1000,
      temperature: 0.3,
    });

    const fullText = response.choices[0]?.message?.content ?? '';

    // Separar el texto del resumen del bloque JSON
    const summaryText = fullText.replace(/<structured_output>[\s\S]*?<\/structured_output>/, '').trim();

    let structured: StructuredLLMOutput | undefined;
    const match = fullText.match(/<structured_output>([\s\S]*?)<\/structured_output>/);
    if (match && match[1]) {
      try {
        structured = JSON.parse(match[1].trim());
      } catch (e) {
        console.warn('El modelo no retornó un JSON válido en structured_output');
      }
    }

    return {
      generatedAt: new Date(),
      model: response.model || model,
      summary: summaryText,
      structured,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[LLM] Error al generar resumen: ${message}`);
    return {
      generatedAt: new Date(),
      model: model,
      summary: 'No disponible — error al contactar el servicio de IA.',
      error: message,
    };
  }
}
