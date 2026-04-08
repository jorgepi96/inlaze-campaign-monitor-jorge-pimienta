// ============================================================
// UTILS — src/utils/retry.ts
// ============================================================
// Lógica de retry con backoff exponencial.
// Completamente agnóstica: no sabe nada de campañas ni de APIs.
// Se puede usar para cualquier operación async que pueda fallar.
//
// DIAGRAMA DE FLUJO:
//   INTENTO 1 → ¿Falla? → espera 1000ms → INTENTO 2
//   INTENTO 2 → ¿Falla? → espera 2000ms → INTENTO 3
//   INTENTO 3 → ¿Falla? → espera 4000ms → INTENTO 4
//   INTENTO N → ¿Falla? → throw error final
//   Cualquier intento exitoso → return resultado
// ============================================================

/**
 * Opciones configurables del retry.
 * Valores con defaults razonables para producción.
 */
type RetryOptions = {
  maxAttempts?: number;   // cuántas veces intentar en total
  baseDelayMs?: number;   // delay inicial en ms (se duplica cada intento)
  onRetry?: (attempt: number, error: Error) => void; // callback para logging
};

/**
 * Función genérica de retry con backoff exponencial.
 *
 * @param fn     - La operación async que queremos reintentar
 * @param options - Configuración del comportamiento del retry
 * @returns      - El resultado de fn() cuando tiene éxito
 * @throws       - El último error si se agotan todos los intentos
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 1000,
    onRetry,
  } = options;

  let lastError: Error = new Error('Unknown error');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // ✅ INTENTO: ejecutamos la función. Si funciona, retornamos.
      return await fn();
    } catch (err) {
      // ⚠️ FALLO: guardamos el error y decidimos si reintentar.
      lastError = err instanceof Error ? err : new Error(String(err));

      const isLastAttempt = attempt === maxAttempts;

      if (isLastAttempt) {
        // Se acabaron los intentos. Lanzamos el error acumulado.
        break;
      }

      // Notificar al caller que estamos reintentando (útil para logs).
      if (onRetry) {
        onRetry(attempt, lastError);
      }

      // Backoff exponencial: 1s → 2s → 4s → 8s...
      // Math.pow(2, attempt - 1) → 2^0=1, 2^1=2, 2^2=4
      const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
      await sleep(delayMs);
    }
  }

  throw lastError;
}

/**
 * Helper: pausa la ejecución por N milisegundos.
 * Permite el backoff sin bloquear el event loop.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
