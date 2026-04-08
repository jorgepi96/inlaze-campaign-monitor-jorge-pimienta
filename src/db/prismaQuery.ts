// ============================================================
// PARTE 3B — src/db/prismaQuery.ts
// ============================================================
// Query con Prisma Client para campañas con peor ROAS promedio
// de los últimos 7 días, agrupadas por operador.
//
// NOTE: Este archivo es código de evaluación — no se ejecuta
// en la demo local (no hay DB real). Se compila y verifica
// con tipos manuales que replican el schema de Prisma.
//
// EXPLICACIÓN DE LA QUERY:
//   Objetivo: "¿Qué operadores tienen las campañas con peor
//   rendimiento (ROAS) en la última semana?"
//
//   1. findMany en Campaign, incluyendo operator y metrics
//   2. where en metrics: recordedAt >= hace 7 días
//   3. ROAS promedio calculado en memoria con reduce()
//      — Prisma no permite AVG() en findMany+include simultáneo;
//        groupBy no permite include de relaciones. Este es el
//        tradeoff documentado de Prisma vs SQL crudo.
//   4. Agrupado por operador con Map<operatorId, summary>
//   5. Ordenado de menor a mayor ROAS (peores primero)
// ============================================================

// ── Tipos manuales que replican el schema Prisma ─────────────
// En producción con Prisma instalado, estos tipos son generados
// automáticamente por `prisma generate` y se importan de '@prisma/client'.

type Operator = {
  id: string;
  name: string;
};

type CampaignMetricRaw = {
  roas: number;
  recordedAt: Date;
};

type CampaignRaw = {
  id: string;
  name: string;
  operatorId: string;
  operator: Operator;
  metrics: CampaignMetricRaw[];
};

// Simula el tipo que retorna prisma.campaign.findMany con el include definido
type PrismaClientLike = {
  campaign: {
    findMany: (args: {
      include: {
        operator: boolean;
        metrics: {
          where: { recordedAt: { gte: Date } };
          select: { roas: boolean; recordedAt: boolean };
        };
      };
    }) => Promise<CampaignRaw[]>;
  };
};

// ── Tipos del resultado exportado ────────────────────────────

type CampaignWithAvgRoas = {
  campaignId: string;
  campaignName: string;
  operatorId: string;
  operatorName: string;
  avgRoas: number;
  metricsCount: number;
};

type OperatorRoasSummary = {
  operatorId: string;
  operatorName: string;
  campaigns: CampaignWithAvgRoas[];
  overallAvgRoas: number;
};

// ── Query principal ───────────────────────────────────────────

async function getWorstRoasCampaignsByOperator(
  prisma: PrismaClientLike
): Promise<OperatorRoasSummary[]> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // PASO 1: Fetch con relaciones anidadas — Prisma lo ejecuta en 2 queries optimizadas
  const campaigns = await prisma.campaign.findMany({
    include: {
      operator: true,
      metrics: {
        where: {
          recordedAt: { gte: sevenDaysAgo },
        },
        select: {
          roas: true,
          recordedAt: true,
        },
      },
    },
  });

  // PASO 2: Excluir campañas sin métricas en el período
  const withMetrics = campaigns.filter(
    (c: CampaignRaw) => c.metrics.length > 0
  );

  // PASO 3: Calcular ROAS promedio por campaña
  const withAvg: CampaignWithAvgRoas[] = withMetrics.map((c: CampaignRaw) => {
    const totalRoas = c.metrics.reduce(
      (sum: number, m: CampaignMetricRaw) => sum + m.roas,
      0
    );
    return {
      campaignId: c.id,
      campaignName: c.name,
      operatorId: c.operator.id,
      operatorName: c.operator.name,
      avgRoas: parseFloat((totalRoas / c.metrics.length).toFixed(4)),
      metricsCount: c.metrics.length,
    };
  });

  // PASO 4: Agrupar por operador
  const byOperator = withAvg.reduce<Map<string, OperatorRoasSummary>>(
    (acc, campaign) => {
      const existing = acc.get(campaign.operatorId);
      if (existing) {
        existing.campaigns.push(campaign);
      } else {
        acc.set(campaign.operatorId, {
          operatorId: campaign.operatorId,
          operatorName: campaign.operatorName,
          campaigns: [campaign],
          overallAvgRoas: 0,
        });
      }
      return acc;
    },
    new Map()
  );

  // PASO 5: Calcular avg del operador, ordenar campañas internas y operadores
  return Array.from(byOperator.values())
    .map((op) => {
      const sorted = op.campaigns.sort((a, b) => a.avgRoas - b.avgRoas);
      const avg = sorted.reduce((s, c) => s + c.avgRoas, 0) / sorted.length;
      return { ...op, campaigns: sorted, overallAvgRoas: parseFloat(avg.toFixed(4)) };
    })
    .sort((a, b) => a.overallAvgRoas - b.overallAvgRoas); // peores primero
}

export {
  getWorstRoasCampaignsByOperator,
  OperatorRoasSummary,
  CampaignWithAvgRoas,
};
