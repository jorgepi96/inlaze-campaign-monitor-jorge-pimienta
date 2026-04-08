import { PrismaClient } from '../src/generated/prisma';

// Se instancia Prisma Client.
// Es importante mantener una sola instancia durante todo el ciclo de vida de la aplicación.
const prisma = new PrismaClient();

// Interfaz para definir el tipo de retorno por la agregación
export interface OperatorROASAverage {
  operator: string;
  _avg: {
    roas: number | null;
  } | null;
}

/**
 * PARTE 3B: Query de Prisma
 * Agrupa las campañas por 'operator' y calcula el promedio de ROAS de los últimos 7 días.
 *
 * @returns {Promise<OperatorROASAverage[]>} Lista de operadores con su respectivo promedio de ROAS.
 */
export async function getOperatorROASAverages7Days(): Promise<OperatorROASAverage[]> {
  try {
    // Calculamos la fecha de hace 7 días
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Consulta con Prisma ORM haciendo uso del tipado estricto implícito
    const results = await prisma.campaign.groupBy({
      by: ['operator'],
      where: {
        createdAt: {
          gte: sevenDaysAgo,
        },
      },
      _avg: {
        roas: true,
      },
    });

    return results as unknown as OperatorROASAverage[]; // Prisma generará los tipos tras el prisma generate, adaptamos interfaz
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`Error al ejecutar la query de agrupamiento de ROAS: ${errorMsg}`);
    throw error;
  } finally {
    // Por buenas prácticas cerramos la conexión al terminar script, 
    // en servidores persistentes se mantendría conectada.
    await prisma.$disconnect();
  }
}
