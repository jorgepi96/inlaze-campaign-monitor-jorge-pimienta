# Sistema de Monitoreo de Campañas - Automatización e IA



Este repositorio contiene la solución técnica desarrollada para el procesamiento, análisis y reporte de métricas de campañas de marketing para la empresa Inlaze. El objetivo principal es transformar datos brutos en decisiones automáticas garantizando **determinismo**, estabilidad y un análisis profundo con Inteligencia Artificial.



## Arquitectura de la Solución (Actualizada)



El sistema opera bajo una arquitectura fuertemente tipada y determinística, delegando la IA únicamente para análisis ejecutivo, de modo que aseguramos la previsibilidad de los estados críticos del sistema para producción:



1. **Clasificación Determinística (TypeScript):**

   La evaluación del rendimiento y clasificación de los estados de cada campaña (`critical`, `warning`, `ok`) se calcula utilizando estrictamente lógica determinística a partir de los umbrales de negocio y matemáticas comprobables. **El LLM ya no toma decisiones críticas operativas**, garantizando un entorno 100% confiable y sin fallas por alucinación o sobrecostos en la ingesta masiva de datos (ver `src/index.ts` y `src/api/pokeAdapter.ts`).



2. **Capa Ejecutiva (Inteligencia Artificial):**

   Para potenciar la inteligencia del reporte sin interferir con la lógica de negocio, se integra el modelo GPT-4o utilizando el **SDK oficial de OpenAI** exclusivamente para procesar un "resumen ejecutivo" pos-evento (ver `src/services/aiService.ts`). La información estructurada de la IA complementa las alertas.



3. **Capa Analítica y Consultas DB (Carpeta `part3/`):**

   - **Refactorización Limpia (`part3/part3a.ts`):** Filtrado de Click-Through Rate aplicando buenas prácticas de TypeScript estricto (eliminación completa de tipos `any`) y protección contra división por cero (CTR < 0.02).

   - **Agrupamiento Analítico (`part3/part3b.ts`):** Extracción del promedio de ROAS en los últimos 7 días con un ORM moderno (`Prisma SDK`), utilizando agrupación y cálculo estadístico dentro de la base de datos de manera óptima.



4. **Transmisión de Datos:**

   La información final y cruzada (incluyendo el *aiSummary*) se transporta mediante un Webhook (HTTP POST) de N8N.



## Decisiones Técnicas: Determinismo vs IA



Para un entorno intermedio / avanzado de monitorización (arquitectura empresarial de un producto), se debe tener cuidado de la latencia y la escalabilidad. Si un proceso batch requiere ingestar un millón de campañas, calcular clasificaciones en base a llamadas recurrentes a OpenAI (API limit restrictions) sería excesivamente costoso, incierto (-latencias en el orden de los segundos-) y propenso a variaciones no deseadas.



**Abordaje elegido:**

La lógica core de *'Peligro/Estable'* debe ser una operación $O(1)$ controlada y determinística puramente en software (TypeScript). Se reservó a OpenAI (SDK oficial - `aiService`) únicamente en el paso post-cálculos para leer el consolidado global y plantear resúmenes / recomendaciones ejecutivas. Esta es la arquitectura correcta para producción empresarial.



## Tecnologías Implementadas



- **Entorno de Ejecución:** Node.js y TypeScript (Tipado estricto habilitado, *cero* uso de "any").

- **Inteligencia Artificial:** OpenAI API (Implementado con el paquete oficial `@openai`).

- **Base de Datos & Cálculos Estructurados**: Prisma SDK para ORM y agrupaciones.

- **Orquestación de Workflows:** n8n.



## Configuración del Entorno



**1. Variables de Entorno**

Configura el archivo `.env` en la raíz con:

```env

OPENAI_API_KEY=tu_sk_de_openai_aqui

N8N_WEBHOOK_URL=tu_endpoint_de_n8n_aqui

DATABASE_URL=tu_base_de_datos_postgresql

```



**2. Ejecución**

```bash

# Instalación (Nuevas dependencias como Prisma y el API SDK de OpenAI)

npm install



# Iniciar el monitor

npm run dev

```



## Estructura del Proyecto



- `/src` : Lógica base determinística, incluyendo adaptador de llamadas (mock).

- `/src/services` : Servicio `aiService.ts` especializado en el modelo LLM mediante SDK oficial.

- `/part3` : Carpeta explícita con la refactorización (`part3a.ts`) y la query de Prisma (`part3b.ts`).

- `/n8n` : Workflow exportado para las alertas de operaciones.



## Notas de Calidad

- *Tipado Cero-Any*: Todos los modelos reflejan `interfaces` de TypeScript concisas protegiendo todo el ciclo de vida de la app desde la conexión de la DB / API hasta OpenAI.