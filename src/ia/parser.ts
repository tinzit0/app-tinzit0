/**
 * Lee las "llamadas a herramientas" que escribe el modelo de IA.
 * Qwen 3 las escribe así:  <tool_call>{"name": "...", "arguments": {...}}</tool_call>
 * Por si acaso también aceptamos JSON suelto: {"name": "...", "arguments": {...}}
 * Sin dependencias del celular: se prueba en Node (scripts/test-voz.ts).
 */
export type LlamadaHerramienta = { function: { name: string; arguments: Record<string, unknown> } };
export type ResultadoParser = { toolCalls: LlamadaHerramienta[]; textContent?: string };

function aLlamada(json: unknown): LlamadaHerramienta | null {
  if (!json || typeof json !== 'object') return null;
  const o = json as { name?: unknown; arguments?: unknown; function?: { name?: unknown; arguments?: unknown } };
  const name = typeof o.name === 'string' ? o.name : typeof o.function?.name === 'string' ? o.function.name : null;
  let args: unknown = o.arguments ?? o.function?.arguments ?? {};
  if (typeof args === 'string') {
    try {
      args = JSON.parse(args);
    } catch {
      args = {};
    }
  }
  if (!name) return null;
  return { function: { name, arguments: (args && typeof args === 'object' ? args : {}) as Record<string, unknown> } };
}

/** Quita el bloque de "pensamiento" (<think>…</think>) que a veces agrega Qwen 3. */
export function sinPensamiento(t: string): string {
  return t.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*$/, '').trim();
}

export function leerLlamadas(texto: string): ResultadoParser | undefined {
  const t = sinPensamiento(texto);
  const llamadas: LlamadaHerramienta[] = [];
  let resto = t;
  for (const m of t.matchAll(/<tool_call>([\s\S]*?)(?:<\/tool_call>|$)/g)) {
    try {
      const l = aLlamada(JSON.parse(m[1].trim()));
      if (l) llamadas.push(l);
      resto = resto.replace(m[0], '');
    } catch {
      // JSON incompleto: lo ignoramos
    }
  }
  if (!llamadas.length) {
    // JSON suelto al inicio de la respuesta
    const j = /^\s*(\{[\s\S]*"name"[\s\S]*\})\s*$/.exec(t);
    if (j) {
      try {
        const l = aLlamada(JSON.parse(j[1]));
        if (l) {
          llamadas.push(l);
          resto = '';
        }
      } catch {
        // no era una llamada
      }
    }
  }
  if (!llamadas.length) return undefined;
  return { toolCalls: llamadas, textContent: resto.trim() || undefined };
}
