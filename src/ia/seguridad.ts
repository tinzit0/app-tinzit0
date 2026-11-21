/**
 * Revisión de lo que la IA pide hacer, ANTES de ejecutarlo (puro: se prueba en Node).
 *
 * - Solo existe una herramienta ("ejecutar_comando") con un argumento de texto: se valida tipo y largo.
 * - La IA no puede enseñar ni olvidar frases (eso lo decides tú).
 * - Lo que borra datos o sale de la app (WhatsApp, llamar) vuelve como "confirmar": se ejecuta
 *   solo si tocas "Sí" en la pantalla.
 */
import type { Intencion } from '@/voice/interpretar';

export const LARGO_MAXIMO = 200;

/** Intenciones que borran datos o actúan fuera de la app: siempre con confirmación. */
export function necesitaConfirmacion(i: Intencion): string | null {
  switch (i.tipo) {
    case 'eliminar_tarea':
      return `¿Borro la tarea "${i.texto}"?`;
    case 'borrar_ultimo_gasto':
      return '¿Borro tu último gasto?';
    case 'app_accion':
      if (i.accion === 'whatsapp') return `¿Abro WhatsApp con el mensaje "${i.texto}"?`;
      if (i.accion === 'llamar') return `¿Llamo al ${i.texto}?`;
      return null;
    default:
      return null;
  }
}

export type RevisionComando =
  | { tipo: 'ok'; comando: string }
  | { tipo: 'confirmar'; comando: string; pregunta: string }
  | { tipo: 'invalido'; motivo: string };

export function revisarComandoIA(args: unknown, interpretar: (frase: string) => Intencion): RevisionComando {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return { tipo: 'invalido', motivo: 'argumentos no válidos.' };
  const claves = Object.keys(args);
  if (claves.some((k) => k !== 'comando')) return { tipo: 'invalido', motivo: 'solo se acepta el argumento "comando".' };
  const crudo = (args as { comando?: unknown }).comando;
  if (typeof crudo !== 'string') return { tipo: 'invalido', motivo: 'el comando debe ser texto.' };
  // Sin caracteres de control ni saltos de línea; espacios normales.
  const comando = crudo.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!comando) return { tipo: 'invalido', motivo: 'falta el comando.' };
  if (comando.length > LARGO_MAXIMO) return { tipo: 'invalido', motivo: 'el comando es demasiado largo.' };

  const i = interpretar(comando);
  if (i.tipo === 'ensenar' || i.tipo === 'olvidar') return { tipo: 'invalido', motivo: 'enseñar u olvidar frases solo lo puede hacer el usuario.' };
  const pregunta = necesitaConfirmacion(i);
  if (pregunta) return { tipo: 'confirmar', comando, pregunta };
  return { tipo: 'ok', comando };
}
