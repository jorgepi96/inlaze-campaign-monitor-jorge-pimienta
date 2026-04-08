## Sistema de ejecución automática de acciones sobre campañas



El agente necesita cuatro componentes: una **base de datos** con métricas en tiempo real, un **LLM con tool-calling** como motor de razonamiento, un **conjunto de herramientas (tools)** que ejecutan acciones reales, y un **log de auditoría** que registra cada decisión.



El agente opera en un loop: consulta métricas recientes → evalúa si alguna campaña cruza umbrales → decide si actuar → ejecuta la tool correspondiente → registra la acción con justificación.



**Tools disponibles:**

- `pause_campaign(id)` — pausa una campaña via API de la plataforma publicitaria

- `send_alert(channel, message)` — notifica a Slack/Discord

- `query_metrics(campaign_id, days)` — consulta historial de ROAS/CTR

- `escalate_to_human(reason)` — crea ticket cuando la acción supera el umbral de confianza



**Cómo decide el agente cuándo actuar:** el prompt del sistema define umbrales explícitos y condiciones de escalada. El LLM no actúa si la confianza es baja — en ese caso llama a `escalate_to_human()`.



**Auditabilidad:** cada invocación de tool se registra en una tabla `agent_actions` con: timestamp, campaña afectada, tool llamada, parámetros, razonamiento del LLM (el texto de su respuesta antes de la tool call), y resultado. Ninguna acción es silenciosa.



```

┌─────────────────────────────────────────────────────┐

│                   AGENT LOOP                        │

│                                                     │

│  DB ──► query_metrics ──► LLM (razonamiento)        │

│                              │                      │

│              ┌───────────────┼───────────────┐      │

│              ▼               ▼               ▼      │

│        pause_campaign   send_alert    escalate      │

│              │               │               │      │

│              └───────────────┴───────────────┘      │

│                              │                      │

│                    agent_actions (audit log)         │

└─────────────────────────────────────────────────────┘

```



La diferencia clave entre este agente y un script automatizado: el LLM evalúa contexto (¿es una caída temporal? ¿hay un evento externo?) antes de actuar, en lugar de aplicar reglas ciegas. :D
