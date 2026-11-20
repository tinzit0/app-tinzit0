/**
 * Formato de pesos chilenos: 12990 → "$12.990".
 * El CLP no usa decimales, así que siempre redondeamos a entero.
 */
export function formatCLP(monto: number): string {
  const entero = Math.round(monto);
  const signo = entero < 0 ? '-' : '';
  const conPuntos = Math.abs(entero)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${signo}$${conPuntos}`;
}
