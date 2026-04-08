// ============================================================
// ENTRY POINT — src/index.ts
// ============================================================
// Orquestador principal del sistema Inlaze Campaign Monitor.
//
// FLUJO:
//   1. Cargar variables de entorno desde .env (si existe)
//   2. Obtener todas las campañas desde el adaptador de API
//   3. Persistir el ProcessResult en data/ como JSON
//   4. [Parte 4] Generar resumen ejecutivo con LLM  ← primero
//   5. [Parte 2] Enviar ProcessResult + llmSummary al webhook de N8N
//   6. Mostrar resultados en consola
// ============================================================

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

// Cargar .env antes de importar cualquier módulo que use process.env
dotenv.config();

import { fetchAllCampaigns, AVAILABLE_CAMPAIGN_IDS } from './api/pokeAdapter';
import { generateCampaignSummary } from './services/llmService';
import { ProcessResult } from './models/campaign';

// ── Función auxiliar: guardar resultado en data/ ─────────────

function saveProcessResult(result: ProcessResult): string {
  const dataDir = path.resolve(process.cwd(), 'data');

  // Crear carpeta data/ si no existe
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
// Hace un POST con el ProcessResult completo + el resumen LLM.
// Si N8N_WEBHOOK_URL no está configurada, o si falla el envío,
// el error se loguea pero NO interrumpe el flujo principal.

import { LLMSummary } from './services/llmService';

async function sendToN8nWebhook(
  result: ProcessResult,
  llmSummary: LLMSummary
): Promise<void> {
  const webhookUrl = process.env['N8N_WEBHOOK_URL'];

  if (!webhookUrl) {
    console.log('  ⚠️  N8N_WEBHOOK_URL no configurada — se omite el envío al webhook.\n');
    return;
  }

  // Payload enriquecido: ProcessResult + resumen ejecutivo LLM
  const payload = {
    ...result,
    llmSummary: {
      model:       llmSummary.model,
      generatedAt: llmSummary.generatedAt,
      summary:     llmSummary.summary,
      structured:  llmSummary.structured,
      error:       llmSummary.error,
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
    // No relanzamos el error — el flujo principal continúa.
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

// ── Función auxiliar: mostrar el resumen del LLM ─────────────

function printLLMSummary(summary: Awaited<ReturnType<typeof generateCampaignSummary>>): void {
  console.log('┌─────────────────────────────────────────────────────────────┐');
  console.log('│              PARTE 4 — RESUMEN EJECUTIVO LLM                │');
  console.log('└─────────────────────────────────────────────────────────────┘');

  if (summary.error) {
    console.log(`  ⚠️  LLM no disponible: ${summary.error}`);
    console.log('  (El flujo principal se completó correctamente sin LLM)\n');
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

  // ── PASO 1: Fetch de todas las campañas ─────────────────────
  console.log('── Paso 1: Fetch de campañas ───────────────────────────────');
  const reports = await fetchAllCampaigns(AVAILABLE_CAMPAIGN_IDS);

  // ── PASO 2: Calcular resumen y construir ProcessResult ───────
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

  // ── PASO 4: Generar resumen ejecutivo con LLM (ANTES del webhook) ──
  console.log('── Paso 4: Generando resumen ejecutivo con LLM ─────────────');

  const hasApiKey = Boolean(process.env['OPENAI_API_KEY']);
  if (!hasApiKey) {
    console.log('  ⚠️  OPENAI_API_KEY no configurada — se intentará igual (error controlado)\n');
  }

  const llmSummary = await generateCampaignSummary(reports);
  printLLMSummary(llmSummary);

  // ── PASO 5: Enviar al webhook de N8N (con llmSummary incluido) ──────
  console.log('── Paso 3: Enviando payload al webhook de N8N ──────────────');
  await sendToN8nWebhook(processResult, llmSummary);

  console.log('✅ Proceso completado.\n');
}

// ── Ejecutar ──────────────────────────────────────────────────
main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\n❌ Error fatal en main(): ${message}`);
  process.exit(1);
});
