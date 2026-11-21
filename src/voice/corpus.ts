/**
 * Frases de ejemplo para entender "por parecido".
 * Cada grupo tiene:
 *  - comando: una frase que el intérprete SÍ entiende (se ejecuta esa)
 *  - etiqueta: cómo se muestra en "¿Quisiste decir…?"
 *  - ejemplos: otras formas de decir lo mismo
 * Para enseñarle algo nuevo de forma permanente, agrega ejemplos aquí.
 * (Lo que Tinzit0 aprende hablando con él se guarda aparte, en la base de datos.)
 */
export type GrupoCorpus = { comando: string; etiqueta: string; ejemplos: string[] };

export const CORPUS: GrupoCorpus[] = [
  {
    comando: 'qué tareas me faltan hoy',
    etiqueta: 'Ver tus tareas de hoy',
    ejemplos: ['qué tengo que hacer hoy', 'qué me queda por hacer', 'lista de pendientes', 'tengo algo pendiente', 'qué hay para hoy en mi agenda', 'mis cosas de hoy', 'qué hago hoy', 'tengo cosas atrasadas'],
  },
  {
    comando: 'tareas de esta semana',
    etiqueta: 'Ver tareas de la semana',
    ejemplos: ['qué tengo esta semana', 'agenda de la semana', 'pendientes de la semana', 'cómo viene la semana'],
  },
  {
    comando: 'cuánto he gastado esta semana',
    etiqueta: 'Ver gasto de la semana',
    ejemplos: ['cuánta plata llevo', 'cuánto llevo gastado', 'cuánto se me ha ido', 'en cuánto voy de plata', 'cómo van mis lucas', 'cuánto dinero he usado', 'gasté mucho', 'balance de gastos'],
  },
  {
    comando: 'cuánto he gastado este mes',
    etiqueta: 'Ver gasto del mes',
    ejemplos: ['cuánta plata este mes', 'gastos mensuales', 'cuánto llevo en el mes', 'total del mes'],
  },
  {
    comando: 'en qué gasté esta semana',
    etiqueta: 'Ver en qué gastaste',
    ejemplos: ['en qué se me fue la plata', 'detalle de gastos', 'últimas compras', 'qué compré', 'mis movimientos'],
  },
  {
    comando: 'cuánto me queda del presupuesto',
    etiqueta: 'Ver tu presupuesto',
    ejemplos: ['me alcanza la plata', 'me puedo dar un gusto', 'cómo voy con el presupuesto', 'me pasé de plata', 'tengo plata disponible', 'puedo gastar más'],
  },
  {
    comando: 'cómo van mis metas',
    etiqueta: 'Ver tus metas de ahorro',
    ejemplos: ['cuánto he ahorrado', 'cómo va el ahorro', 'cuánto me falta para mi meta', 'cómo va la alcancía'],
  },
  {
    comando: 'mis gastos fijos',
    etiqueta: 'Ver gastos fijos',
    ejemplos: ['cuánto pago al mes de cuentas', 'qué cuentas tengo', 'mis suscripciones', 'cuánto pago de arriendo y cuentas'],
  },
  {
    comando: 'próximos pagos',
    etiqueta: 'Ver próximos pagos',
    ejemplos: ['cuándo tengo que pagar', 'qué viene por pagar', 'qué cuenta vence', 'pagos que vienen'],
  },
  {
    comando: 'qué me toca hoy en el gym',
    etiqueta: 'Ver el gym de hoy',
    ejemplos: ['qué entreno hoy', 'hoy voy al gimnasio', 'qué músculo toca', 'me toca pesas hoy', 'qué día de rutina es hoy', 'hoy es día de gym'],
  },
  {
    comando: 'cuál es mi último peso',
    etiqueta: 'Ver tu peso',
    ejemplos: ['cuánto peso', 'cuántos kilos tengo', 'he bajado de peso', 'cómo va mi peso', 'subí de peso'],
  },
  {
    comando: 'cómo va mi racha',
    etiqueta: 'Ver tus rachas',
    ejemplos: ['cuántos días seguidos llevo', 'cómo van mis hábitos', 'he sido constante', 'mantengo la racha'],
  },
  {
    comando: 'qué hábitos me faltan',
    etiqueta: 'Ver hábitos pendientes',
    ejemplos: ['qué hábitos tengo hoy', 'me falta algún hábito', 'qué hábitos no he marcado'],
  },
  {
    comando: 'léeme mis notas',
    etiqueta: 'Leer tus notas',
    ejemplos: ['qué anoté', 'mis apuntes', 'qué tengo en notas', 'muéstrame lo que anoté'],
  },
  {
    comando: 'cómo está el clima',
    etiqueta: 'Ver el clima',
    ejemplos: ['cómo está afuera', 'hace frío', 'hace calor', 'cómo está el día', 'salgo con chaqueta', 'necesito abrigo', 'qué tiempo hace'],
  },
  {
    comando: 'va a llover mañana',
    etiqueta: 'Ver si llueve mañana',
    ejemplos: ['mañana llueve', 'llevo paraguas mañana', 'cómo estará mañana'],
  },
  {
    comando: 'cómo me fue este mes',
    etiqueta: 'Ver estadísticas del mes',
    ejemplos: ['resumen mensual', 'balance mensual', 'cómo vamos este mes', 'números del mes', 'qué tal el mes'],
  },
  {
    comando: 'mis medallas',
    etiqueta: 'Ver tus medallas',
    ejemplos: ['qué logros tengo', 'cuántos trofeos llevo', 'qué premios gané'],
  },
  {
    comando: 'cómo voy hoy',
    etiqueta: 'Resumen de tu día',
    ejemplos: ['cómo estoy', 'qué tal mi día', 'dame un resumen', 'ponme al tanto', 'novedades de hoy', 'qué onda hoy', 'cuéntame cómo voy'],
  },
  {
    comando: 'estado del sistema',
    etiqueta: 'Estado del sistema',
    ejemplos: ['estás funcionando', 'todo bien contigo', 'cómo está la batería', 'nivel de batería', 'estás activo'],
  },
  {
    comando: 'motívame',
    etiqueta: 'Una frase motivadora',
    ejemplos: ['no tengo ganas', 'estoy aburrido', 'me da flojera', 'ando bajoneado', 'dame ánimo', 'necesito motivación'],
  },
  {
    comando: 'ayuda',
    etiqueta: 'Qué puedo pedirte',
    ejemplos: ['qué sabes hacer', 'qué haces', 'para qué sirves', 'qué funciones tienes', 'qué puedo decirte', 'cómo te uso'],
  },
];
