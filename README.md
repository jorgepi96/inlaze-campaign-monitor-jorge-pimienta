Sistema de Monitoreo de Campañas - Automatización e IA
Este repositorio contiene la solución técnica desarrollada para el procesamiento, análisis y reporte de métricas de campañas de marketing. El objetivo principal es transformar datos brutos en decisiones automáticas mediante el uso de inteligencia artificial y orquestación de flujos de trabajo.

Arquitectura de la Solución
El sistema opera bajo una arquitectura desacoplada para garantizar escalabilidad y mantenimiento:

Capa de Procesamiento (TypeScript): Se desarrolló un script que centraliza la extracción de métricas. Este componente se integra directamente con la API de OpenAI para evaluar el rendimiento de cada campaña bajo el modelo GPT-4o, asignando un estado lógico (critical, warning, ok) basado en un análisis inteligente de datos.

Transmisión de Datos: La información procesada, incluyendo el resumen ejecutivo generado por la IA, se envía mediante un Webhook (HTTP POST) hacia el motor de automatización.

Capa de Orquestación (n8n): El flujo recibe la carga de datos y ejecuta la lógica de negocio:

Prioridad Alta: Las campañas en estado crítico activan una notificación inmediata en Discord, incluyendo el análisis descriptivo de la IA.

Seguimiento: Las campañas con advertencias se registran en un log histórico en Google Sheets para su posterior auditoría.

Tecnologías Implementadas
Entorno de Ejecución: Node.js y TypeScript.

Inteligencia Artificial: OpenAI API (Modelo GPT-4o para análisis de métricas).

Orquestación de Workflows: n8n.

Integraciones: Discord API y Google Sheets API.

Resiliencia y Manejo de Errores
Para dar cumplimiento a los requerimientos de estabilidad del sistema, se implementaron las siguientes medidas:

Captura Global de Errores: Se configuró un nodo Error Trigger en n8n que monitorea el flujo de manera constante. Ante cualquier fallo en los nodos de salida o de procesamiento, el sistema captura la excepción, genera un log del error y notifica al administrador sin detener la operación general.

Continuidad Operativa: Los nodos finales cuentan con la configuración Continue on Error, asegurando que el fallo en una integración específica (ej. saturación de API en Sheets) no bloquee la entrega de alertas urgentes en otros canales.

Configuración del Entorno
Variables de Envío
Para la ejecución del proyecto, es indispensable configurar un archivo .env en la raíz (excluido por políticas de seguridad en el .gitignore) con los siguientes parámetros:

Fragmento de código
OPENAI_API_KEY=tu_sk_de_openai_aqui
N8N_WEBHOOK_URL=tu_endpoint_de_n8n_aqui
Ejecución
Instalar dependencias: npm install

Iniciar el procesamiento: npx ts-node src/index.ts

Estructura del Proyecto
/src: Código fuente del script de análisis e integración con OpenAI.

/n8n: Archivo de exportación del flujo (.json) con la lógica de ruteo y alertas.

README.md: Documentación técnica del proyecto.

Notas de Entrega
La integración con OpenAI permite que el sistema no solo notifique métricas, sino que proporcione un contexto analítico para la toma de decisiones. Se han utilizado placeholders en el archivo JSON del flujo de n8n para proteger las URLs de Webhooks y IDs de documentos privados, manteniendo la portabilidad de la solución.