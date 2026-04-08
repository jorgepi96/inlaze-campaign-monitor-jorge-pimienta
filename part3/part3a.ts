/**
 * PARTE 3A: Refactorización de lógica de filtrado (Página 5).
 * 
 * Correcciones aplicadas:
 * 1. Tipado estricto (eliminación de 'any'): Se introducen interfaces claras (IRawCampaign) 
 *    para evitar errores en tiempo de ejecución.
 * 2. Lógica de cálculo: Se valida que 'impressions' no sea 0 para prevenir división por cero.
 * 3. Corrección del filtro: CTR < 0.02 (2%).
 */

export interface IRawCampaign {
  id: string;
  name: string;
  clicks: number;
  impressions: number;
  operator?: string;
  spend_usd?: number;
}

/**
 * Retorna las campañas que tienen un Click-Through Rate (CTR) MENOR al 2% (0.02).
 * El CTR se calcula como: (clicks / impressions)
 *
 * @param campaigns Lista de campañas en bruto.
 * @returns Lista de campañas filtradas.
 */
export function getLowCTRCampaigns(campaigns: IRawCampaign[]): IRawCampaign[] {
  return campaigns.filter((campaign) => {
    // Si no hubo impresiones, no se puede calcular el CTR correctamente y prevenir division por cero.
    if (campaign.impressions <= 0) {
      return false; 
    }

    const ctr = campaign.clicks / campaign.impressions;
    return ctr < 0.02;
  });
}
