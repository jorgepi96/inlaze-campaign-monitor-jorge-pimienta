// ============================================================
// MODELS — src/models/campaign.ts
// ============================================================
// Este archivo define los "contratos" de datos del sistema.
// Nada entra ni sale del sistema sin pasar por estos tipos.
// Cambiar una fuente de datos solo requiere actualizar el
// adaptador (api/pokeAdapter.ts), no este archivo.
// ============================================================

/**
 * BLOQUE 1 — Tipo principal del sistema.
 * Representa una campaña ya evaluada con su status final.
 * Este es el objeto que fluye hacia N8N en la Parte 2.
 */
export type CampaignStatus = 'ok' | 'warning' | 'critical';

export type CampaignReport = {
  id: string;
  name: string;
  metric: number;       // CTR simulado: clicks / impressions (escala 0–10)
  status: CampaignStatus;
  evaluatedAt: Date;
};

/**
 * BLOQUE 2 — Shape de la respuesta cruda de PokeAPI.
 * Solo tipamos los campos que realmente usamos.
 * Esto evita el 'any' y documenta el contrato con la API externa.
 */
export type PokeApiStat = {
  base_stat: number;
  stat: {
    name: string;
  };
};

export type PokeApiResponse = {
  id: number;
  name: string;
  base_experience: number;
  weight: number;
  stats: PokeApiStat[];
};

/**
 * BLOQUE 3 — Resultado del proceso completo.
 * Agrupa todos los reportes y metadatos de ejecución.
 * Este objeto se guarda en JSON local (Parte 1) y se puede
 * enviar como payload al webhook de N8N (Parte 2).
 */
export type ProcessResult = {
  processedAt: Date;
  totalCampaigns: number;
  reports: CampaignReport[];
  summary: {
    ok: number;
    warning: number;
    critical: number;
  };
};
