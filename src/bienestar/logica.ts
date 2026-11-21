/**
 * Bienestar emocional (lógica pura, sin base de datos): emociones, habilidades DBT,
 * descubrir patrones en tus días, detectar frases de riesgo y las fases de un impulso.
 * Se prueba en scripts/test-bienestar.ts.
 *
 * Las habilidades vienen de la Terapia Dialéctica Conductual (DBT). La app acompaña,
 * no reemplaza a tu psicólogo/a.
 */

export type ClaveEmocion = 'tristeza' | 'rabia' | 'ansiedad' | 'verguenza' | 'vacio' | 'alegria';

export const EMOCIONES: { clave: ClaveEmocion; label: string }[] = [
  { clave: 'tristeza', label: 'Tristeza' },
  { clave: 'rabia', label: 'Rabia' },
  { clave: 'ansiedad', label: 'Miedo o ansiedad' },
  { clave: 'verguenza', label: 'Vergüenza o culpa' },
  { clave: 'vacio', label: 'Vacío' },
  { clave: 'alegria', label: 'Alegría' },
];

export type Habilidad = { clave: string; nombre: string; grupo: string; que: string };

/** Habilidades DBT, en palabras simples. */
export const HABILIDADES: Habilidad[] = [
  { clave: 'mente_sabia', grupo: 'Atención plena', nombre: 'Mente sabia', que: 'Escuchar a la emoción y a la razón a la vez antes de decidir.' },
  { clave: 'observar', grupo: 'Atención plena', nombre: 'Observar y describir', que: 'Nombrar lo que sientes sin juzgarlo: "siento rabia", no "soy horrible".' },
  { clave: 'tipp', grupo: 'Tolerar el malestar', nombre: 'TIPP', que: 'Agua fría, ejercicio intenso, respiración lenta y relajar músculos.' },
  { clave: 'stop', grupo: 'Tolerar el malestar', nombre: 'STOP', que: 'Para, da un paso atrás, observa y sigue con calma.' },
  { clave: 'pros_contras', grupo: 'Tolerar el malestar', nombre: 'Pros y contras', que: 'Pensar qué pasa si actúo por impulso y qué pasa si no.' },
  { clave: 'distraer', grupo: 'Tolerar el malestar', nombre: 'Distraerme', que: 'Hacer otra cosa un rato hasta que la ola baje.' },
  { clave: 'sentidos', grupo: 'Tolerar el malestar', nombre: 'Calmarme con los sentidos', que: 'Música, una ducha, un olor rico, algo suave.' },
  { clave: 'aceptacion', grupo: 'Tolerar el malestar', nombre: 'Aceptación radical', que: 'Aceptar lo que no puedo cambiar, para sufrir menos.' },
  { clave: 'accion_opuesta', grupo: 'Regular emociones', nombre: 'Acción opuesta', que: 'Hacer lo contrario de lo que pide la emoción (si quiero aislarme, escribirle a alguien).' },
  { clave: 'hechos', grupo: 'Regular emociones', nombre: 'Revisar los hechos', que: '¿Lo que siento calza con lo que pasó, o estoy suponiendo?' },
  { clave: 'cuidar_cuerpo', grupo: 'Regular emociones', nombre: 'Cuidar el cuerpo', que: 'Dormir, comer, moverme y tomar mis remedios.' },
  { clave: 'cosas_buenas', grupo: 'Regular emociones', nombre: 'Sumar cosas buenas', que: 'Hacer hoy algo que me guste, aunque sea chico.' },
  { clave: 'dear_man', grupo: 'Relaciones', nombre: 'DEAR MAN', que: 'Pedir algo con calma: describir, expresar, pedir y reforzar.' },
  { clave: 'give', grupo: 'Relaciones', nombre: 'GIVE', que: 'Cuidar la relación: amable, interesado/a, validar y tranquilo/a.' },
];

export function nombreHabilidad(clave: string): string {
  return HABILIDADES.find((h) => h.clave === clave)?.nombre ?? clave;
}

/** Palabras para el ánimo 0–10. */
export function textoAnimo(v: number | null | undefined): string {
  if (v == null) return 'Sin registro';
  if (v <= 2) return 'Muy difícil';
  if (v <= 4) return 'Difícil';
  if (v <= 6) return 'Más o menos';
  if (v <= 8) return 'Bien';
  return 'Muy bien';
}

// ---------- Frases de riesgo ----------

const RIESGO = [
  /\b(me quiero|quiero|quisiera|ganas de|pienso en|pensando en) (morir(me)?|matarme|suicidarme|desaparecer para siempre|no despertar)\b/,
  /\bsuicid/,
  /\b(matarme|quitarme la vida|acabar con (mi vida|todo))\b/,
  /\bno (quiero|aguanto) (seguir )?vivi(r|endo)\b/,
  /\b(hacerme dano|cortarme|autolesion|lastimarme)\b/,
  /\b(mejor (si )?no existiera|no vale la pena vivir|todos estarian mejor sin mi)\b/,
];

/** ¿La frase (ya normalizada: minúsculas, sin tildes) habla de hacerse daño? */
export function detectarRiesgo(t: string): boolean {
  return RIESGO.some((re) => re.test(t));
}

// ---------- Surfear un impulso ----------

/** En qué parte de la "ola" vas, según cuánto ha pasado (0 a 1). */
export function faseImpulso(progreso: number): { titulo: string; texto: string } {
  if (progreso < 0.3) {
    return { titulo: 'La ola está subiendo', texto: 'Las ganas pueden sentirse muy fuertes. Es normal. Sentirlas no te obliga a actuar.' };
  }
  if (progreso < 0.6) {
    return { titulo: 'Estás cerca de la cima', texto: 'Este es el momento más difícil, y también el último en subir. Respira lento. Ya casi.' };
  }
  if (progreso < 1) {
    return { titulo: 'La ola está bajando', texto: 'Lo estás logrando. Las ganas siempre bajan si les das tiempo.' };
  }
  return { titulo: 'Surfeaste la ola', texto: 'Pasó el tiempo y sigues aquí. Eso es fuerza de verdad.' };
}

// ---------- Patrones ----------

export type DiaBienestar = {
  fecha: string; // YYYY-MM-DD
  animo: number | null;
  impulso: number | null;
  actue: boolean;
  sueno: number | null;
  gym: boolean;
  estudioMin: number;
  gasto: number;
};

export type Descubrimiento = { icono: string; texto: string; tono: 'bueno' | 'alerta' | 'dato' };

const media = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const uno = (n: number) => (Math.round(n * 10) / 10).toLocaleString('es-CL');
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MIN = 3; // mínimo de días por grupo para decir algo
const DIF = 0.8; // diferencia mínima de ánimo (0–10) para que valga la pena

function diaSemana(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

function siguiente(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const f = new Date(y, m - 1, d + 1);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
}

/** Compara el ánimo de dos grupos de días. */
function comparar(si: number[], no: number[]): number | null {
  if (si.length < MIN || no.length < MIN) return null;
  return media(si) - media(no);
}

/**
 * Busca relaciones entre tu ánimo y lo que haces (sueño, gym, estudio, plata, día de la semana).
 * Solo dice algo cuando hay suficientes días y la diferencia se nota.
 */
export function descubrirPatrones(dias: DiaBienestar[]): Descubrimiento[] {
  const con = dias.filter((d) => d.animo != null) as (DiaBienestar & { animo: number })[];
  const out: Descubrimiento[] = [];
  if (con.length < 5) return out;

  // Sueño
  const conSueno = con.filter((d) => d.sueno != null);
  const dif = comparar(conSueno.filter((d) => d.sueno! >= 7).map((d) => d.animo), conSueno.filter((d) => d.sueno! < 6).map((d) => d.animo));
  if (dif != null && dif >= DIF) {
    out.push({ icono: 'moon-outline', tono: 'dato', texto: `Cuando duermes 7 horas o más, tu ánimo es ${uno(dif)} puntos más alto que cuando duermes menos de 6.` });
  }

  // Gym: mismo día y día siguiente
  const gymSi = con.filter((d) => d.gym).map((d) => d.animo);
  const gymNo = con.filter((d) => !d.gym).map((d) => d.animo);
  const difGym = comparar(gymSi, gymNo);
  if (difGym != null && difGym >= DIF) {
    out.push({ icono: 'barbell-outline', tono: 'bueno', texto: `Los días que vas al gym tu ánimo sube ${uno(difGym)} puntos en promedio.` });
  } else {
    const trasGym = new Set(dias.filter((x) => x.gym).map((x) => siguiente(x.fecha)));
    const despues = con.filter((d) => trasGym.has(d.fecha));
    const noDespues = con.filter((d) => !despues.includes(d));
    const difSig = comparar(despues.map((d) => d.animo), noDespues.map((d) => d.animo));
    if (difSig != null && difSig >= DIF) {
      out.push({ icono: 'barbell-outline', tono: 'bueno', texto: `El día después de ir al gym te sientes ${uno(difSig)} puntos mejor.` });
    }
  }

  // Estudio
  const difEst = comparar(con.filter((d) => d.estudioMin >= 60).map((d) => d.animo), con.filter((d) => d.estudioMin === 0).map((d) => d.animo));
  if (difEst != null && Math.abs(difEst) >= DIF) {
    out.push(
      difEst > 0
        ? { icono: 'school-outline', tono: 'bueno', texto: `Los días que estudias al menos 1 hora terminas ${uno(difEst)} puntos mejor de ánimo.` }
        : { icono: 'school-outline', tono: 'alerta', texto: `Los días de mucho estudio tu ánimo baja ${uno(-difEst)} puntos. Ojo con los descansos.` },
    );
  }

  // Plata en días difíciles (gasto impulsivo)
  const malos = con.filter((d) => d.animo <= 4);
  const buenos = con.filter((d) => d.animo >= 6);
  if (malos.length >= MIN && buenos.length >= MIN) {
    const gm = media(malos.map((d) => d.gasto));
    const gb = media(buenos.map((d) => d.gasto));
    if (gb > 0 && gm >= gb * 1.4 && gm - gb >= 3000) {
      out.push({ icono: 'card-outline', tono: 'alerta', texto: `En tus días difíciles gastas ${Math.round((gm / gb - 1) * 100)} % más. Antes de comprar en un mal día, espera un rato.` });
    }
  }

  // Día de la semana
  const porDia = new Map<number, number[]>();
  for (const d of con) porDia.set(diaSemana(d.fecha), [...(porDia.get(diaSemana(d.fecha)) ?? []), d.animo]);
  const validos = [...porDia.entries()].filter(([, v]) => v.length >= 2).map(([k, v]) => ({ k, m: media(v) }));
  if (validos.length >= 4) {
    const general = media(con.map((d) => d.animo));
    const peor = validos.reduce((a, b) => (b.m < a.m ? b : a));
    const mejor = validos.reduce((a, b) => (b.m > a.m ? b : a));
    if (general - peor.m >= DIF) {
      out.push({ icono: 'calendar-outline', tono: 'alerta', texto: `Los ${DIAS[peor.k]} suelen costarte más. Ese día te mando un mensaje de apoyo.` });
    }
    if (mejor.m - general >= DIF) {
      out.push({ icono: 'sunny-outline', tono: 'bueno', texto: `Tus mejores días suelen ser los ${DIAS[mejor.k]}.` });
    }
  }

  // Impulsos
  const conImpulso = con.filter((d) => d.impulso != null && d.impulso >= 3);
  if (conImpulso.length >= MIN) {
    const resistidos = conImpulso.filter((d) => !d.actue).length;
    if (resistidos > 0) {
      out.push({ icono: 'water-outline', tono: 'bueno', texto: `De ${conImpulso.length} días con impulsos fuertes, en ${resistidos} no actuaste. Eso es progreso real.` });
    }
  }

  return out;
}

/** El día de la semana (0=domingo) con peor ánimo, si se nota. Para el mensaje de apoyo. */
export function diaDificil(dias: DiaBienestar[]): number | null {
  const con = dias.filter((d) => d.animo != null);
  if (con.length < 10) return null;
  const general = media(con.map((d) => d.animo!));
  const porDia = new Map<number, number[]>();
  for (const d of con) porDia.set(diaSemana(d.fecha), [...(porDia.get(diaSemana(d.fecha)) ?? []), d.animo!]);
  let peor: { k: number; m: number } | null = null;
  for (const [k, v] of porDia) {
    if (v.length < 2) continue;
    const m = media(v);
    if (!peor || m < peor.m) peor = { k, m };
  }
  return peor && general - peor.m >= DIF ? peor.k : null;
}

/** Promedio de ánimo y tendencia (últimos 7 días vs los 7 anteriores). */
export function tendenciaAnimo(dias: DiaBienestar[]): { promedio: number | null; cambio: number | null } {
  const con = dias.filter((d) => d.animo != null).sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (!con.length) return { promedio: null, cambio: null };
  const ult = con.slice(-7).map((d) => d.animo!);
  const ant = con.slice(-14, -7).map((d) => d.animo!);
  return { promedio: media(ult), cambio: ant.length >= 3 ? media(ult) - media(ant) : null };
}

// ---------- Resumen para tu psicólogo/a ----------

export type TarjetaResumen = {
  date: string;
  animo: number | null;
  emociones: Partial<Record<ClaveEmocion, number>>;
  impulso: number | null;
  actue: boolean;
  habilidades: string[];
  sueno: number | null;
  nota: string | null;
};

/** Texto simple para compartir con tu psicólogo/a (por WhatsApp, correo o imprimir). */
export function resumenParaTerapia(tarjetas: TarjetaResumen[], impulsos: { total: number; logrados: number }, desde: string, hasta: string): string {
  const fmt = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/');
  const l: string[] = [`Mi registro · ${fmt(desde)} al ${fmt(hasta)}`, ''];
  const con = tarjetas.filter((t) => t.animo != null);
  if (con.length) {
    l.push(`Ánimo promedio: ${uno(media(con.map((t) => t.animo!)))} / 10 (${con.length} días registrados)`);
    const peor = con.reduce((a, b) => (b.animo! < a.animo! ? b : a));
    const mejor = con.reduce((a, b) => (b.animo! > a.animo! ? b : a));
    l.push(`Mejor día: ${fmt(mejor.date)} (${mejor.animo}) · Día más difícil: ${fmt(peor.date)} (${peor.animo})`);
  }
  const fuertes = EMOCIONES.map((e) => {
    const v = tarjetas.map((t) => t.emociones[e.clave]).filter((x): x is number => x != null);
    return { e, m: v.length ? media(v) : 0 };
  })
    .filter((x) => x.m >= 1)
    .sort((a, b) => b.m - a.m);
  if (fuertes.length) l.push(`Emociones más presentes: ${fuertes.slice(0, 3).map((x) => `${x.e.label.toLowerCase()} (${uno(x.m)}/5)`).join(', ')}`);
  const dImp = tarjetas.filter((t) => (t.impulso ?? 0) >= 3);
  if (dImp.length) l.push(`Días con impulsos fuertes: ${dImp.length} · actué por impulso: ${dImp.filter((t) => t.actue).length}`);
  if (impulsos.total) l.push(`Impulsos surfeados con la app: ${impulsos.logrados} de ${impulsos.total}`);
  const sue = tarjetas.map((t) => t.sueno).filter((x): x is number => x != null);
  if (sue.length) l.push(`Sueño promedio: ${uno(media(sue))} h`);
  const conteo = new Map<string, number>();
  for (const t of tarjetas) for (const h of t.habilidades) conteo.set(h, (conteo.get(h) ?? 0) + 1);
  const top = [...conteo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  if (top.length) l.push(`Habilidades que más usé: ${top.map(([h, n]) => `${nombreHabilidad(h)} (${n})`).join(', ')}`);
  const notas = tarjetas.filter((t) => t.nota?.trim());
  if (notas.length) {
    l.push('', 'Notas:');
    for (const t of notas.slice(-8)) l.push(`• ${fmt(t.date)}: ${t.nota!.trim()}`);
  }
  if (l.length === 2) l.push('Todavía no hay registros en estas fechas.');
  return l.join('\n');
}
