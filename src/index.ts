// ============================================================
// ENTRY POINT — src/index.ts
// ============================================================
// Orquestador principal del sistema Inlaze Campaign Monitor.
//
// FLUJO:
//   1. Cargar variables de entorno desde .env (si existe)
//   2. Obtener todas las campañas desde el adaptador de API
//   3. (ARQUITECTURA DETERMINÍSTICA) Asignar 'ok', 'warning' o 'critical'
//      basado estrictamente en las métricas (TypeScript lógico).
//   4. Persistir el ProcessResult en data/ como JSON
//   5. Generar resumen ejecutivo con LLM (solo para insights, NO clasificación)
//   6. Enviar ProcessResult + aiSummary al webhook de N8N
//   7. Mostrar resultados en consola
// ============================================================

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

// Cargar .env antes de importar cualquier módulo que use process.env
dotenv.config();

import { fetchAllCampaigns, AVAILABLE_CAMPAIGN_IDS, evaluateThreshold } from './api/pokeAdapter';
import { generateCampaignSummary, LLMSummary } from './services/aiService';
import { ProcessResult, CampaignReport } from './models/campaign';

// ── Función auxiliar: guardar resultado en data/ ─────────────

function saveProcessResult(result: ProcessResult): string {
  const dataDir = path.resolve(process.cwd(), 'data');

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .slice(0, 19);

  const filename = `campaign-report-${timestamp}.json`;
  const filepath = path.join(dataDir, filename);

  fs.writeFileSync(filepath, JSON.stringify(result, null, 2), 'utf-8');

  return filepath;
}

// ── Función auxiliar: enviar al webhook de N8N ───────────────

async function sendToN8nWebhook(
  result: ProcessResult,
  aiSummary: LLMSummary
): Promise<void> {
  const webhookUrl = process.env['N8N_WEBHOOK_URL'];

  if (!webhookUrl) {
    console.log('  ⚠️  N8N_WEBHOOK_URL no configurada — se omite el envío al webhook.\n');
    return;
  }

  // Payload enriquecido: ProcessResult determinístico + resumen ejecutivo de la IA
  const payload = {
    ...result,
    aiSummary: {
      model:       aiSummary.model,
      generatedAt: aiSummary.generatedAt,
      summary:     aiSummary.summary,
      structured:  aiSummary.structured,
      error:       aiSummary.error,
    },
  };

  try {
    const response = await axios.post(webhookUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    });
    console.log(`  ✅ Payload enviado al webhook. HTTP ${response.status}\n`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  ❌ Error al enviar al webhook de N8N: ${message}\n`);
  }
}

// ── Función auxiliar: tabla de resultados en consola ─────────

function printResultsTable(result: ProcessResult): void {
  const statusEmoji: Record<string, string> = {
    ok: '✅',
    warning: '⚠️ ',
    critical: '🔴',
  };

  console.log('\n┌─────────────────────────────────────────────────────────────┐');
  console.log('│            INLAZE CAMPAIGN MONITOR — RESULTADOS             │');
  console.log('└─────────────────────────────────────────────────────────────┘');
  console.log(`  Procesado: ${result.processedAt.toISOString()}`);
  console.log(`  Total campañas: ${result.totalCampaigns}\n`);

  console.log('  ID         NOMBRE                           MÉTRICA  ESTADO');
  console.log('  ─────────  ───────────────────────────────  ───────  ────────');

  for (const r of result.reports) {
    const emoji = statusEmoji[r.status] ?? '  ';
    console.log(
      `  ${r.id.padEnd(9)}  ${r.name.padEnd(31)}  ${String(r.metric).padStart(5)}    ${emoji} ${r.status.toUpperCase()}`
    );
  }

  console.log('\n  ── Resumen ──────────────────────────────────────────────────');
  console.log(`  ✅  OK:       ${result.summary.ok}`);
  console.log(`  ⚠️   WARNING:  ${result.summary.warning}`);
  console.log(`  🔴  CRITICAL: ${result.summary.critical}`);
  console.log('');
}

// ── Función auxiliar: mostrar el resumen de la IA ────────────

function printAISummary(summary: LLMSummary): void {
  console.log('┌─────────────────────────────────────────────────────────────┐');
  console.log('│              PARTE 4 — RESUMEN EJECUTIVO IA                 │');
  console.log('└─────────────────────────────────────────────────────────────┘');

  if (summary.error) {
    console.log(`  ⚠️  IA no disponible: ${summary.error}`);
    console.log('  (El flujo principal se completó correctamente, sistema determinístico)\n');
    return;
  }

  console.log(`  Modelo: ${summary.model}`);
  console.log(`  Generado: ${summary.generatedAt.toISOString()}\n`);
  console.log('  ' + summary.summary.split('\n').join('\n  '));

  if (summary.structured) {
    console.log('\n  ── Structured Output ────────────────────────────────────────');

    if (summary.structured.criticalCampaigns.length > 0) {
      console.log('  🔴 Campañas críticas:');
      for (const c of summary.structured.criticalCampaigns) {
        console.log(`     • ${c.campaignName} (${c.campaignId}) — métrica: ${c.metric}`);
        console.log(`       Acción: ${c.suggestedAction}`);
      }
    }

    if (summary.structured.suggestedActions.length > 0) {
      console.log('  📋 Acciones sugeridas:');
      for (const action of summary.structured.suggestedActions) {
        console.log(`     • ${action}`);
      }
    }
  }

  console.log('');
}

// ── Main ──────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n🚀 Iniciando Inlaze Campaign Monitor...\n');
  console.log(`  Campañas a procesar: ${AVAILABLE_CAMPAIGN_IDS.join(', ')}\n`);

  // ── PASO 1: Fetch de campañas y clasificación determinística  ──────
  console.log('── Paso 1: Fetch de campañas y Evaluación Determinística ──────');
  let reports: CampaignReport[] = await fetchAllCampaigns(AVAILABLE_CAMPAIGN_IDS);
  
  // Garantizamos que la clasificación se hace con lógica estricta de TypeScript
  reports = reports.map(report => ({
    ...report,
    status: evaluateThreshold(report.metric)
  }));

  // ── PASO 2: Construir ProcessResult ────────────────────────────────
  const processResult: ProcessResult = {
    processedAt: new Date(),
    totalCampaigns: reports.length,
    reports,
    summary: {
      ok:       reports.filter((r) => r.status === 'ok').length,
      warning:  reports.filter((r) => r.status === 'warning').length,
      critical: reports.filter((r) => r.status === 'critical').length,
    },
  };

  // ── PASO 3: Mostrar tabla en consola ─────────────────────────
  printResultsTable(processResult);

  // ── PASO 4: Persistir JSON en data/ ──────────────────────────
  console.log('── Paso 2: Guardando reporte JSON ──────────────────────────');
  const savedPath = saveProcessResult(processResult);
  console.log(`  ✅ Reporte guardado en: ${savedPath}\n`);

  // ── PASO 5: Generar resumen de IA (Solo lectura/Insights) ──
  console.log('── Paso 3: Generando resumen ejecutivo con IA ──────────────');

  const hasApiKey = Boolean(process.env['OPENAI_API_KEY']);
  if (!hasApiKey) {
    console.log('  ⚠️  OPENAI_API_KEY no configurada — se intentará igual (error controlado)\n');
  }

  const aiSummary = await generateCampaignSummary(reports);
  printAISummary(aiSummary);

  // ── PASO 6: Enviar al webhook de N8N ───────────────────────────
  console.log('── Paso 4: Enviando payload al webhook de N8N ──────────────');
  await sendToN8nWebhook(processResult, aiSummary);

  console.log('✅ Proceso completado.\n');
}

// ── Ejecutar ──────────────────────────────────────────────────
main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\n❌ Error fatal en main(): ${message}`);
  process.exit(1);
});
