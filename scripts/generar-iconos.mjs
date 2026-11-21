/**
 * Genera el ícono y la pantalla de carga de Tinzit0 en 3 estilos.
 *
 * Uso:  node scripts/generar-iconos.mjs <estilo> <carpeta-con-resvg>
 *   estilo: grafito | lima | noche   (o "todos" para la hoja de propuestas)
 *
 * La marca: el "0" de Tinzit0 como un anillo grueso con una abertura,
 * y un punto que "completa" el día. Simple, se lee bien en 48 px.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [, , estilo = 'grafito', carpetaResvg] = process.argv;
const require = createRequire(join(resolve(carpetaResvg ?? '.'), 'package.json'));
const { Resvg } = require('@resvg/resvg-js');

export const ESTILOS = {
  grafito: { nombre: 'Grafito + Lima', fondo: ['#0B0B0C', '#1C1C1F'], anillo: '#CFF56B', punto: '#CFF56B' },
  lima: { nombre: 'Lima sólido', fondo: ['#D6F87A', '#C2EE4F'], anillo: '#0B0B0C', punto: '#0B0B0C' },
  noche: { nombre: 'Noche violeta', fondo: ['#1A1440', '#3A2C8C'], anillo: '#FFFFFF', punto: '#CFF56B' },
};

/** La marca dentro de un cuadro de 100x100, centrada. escala = cuánto ocupa (0..1). */
function marca(e, escala = 0.56) {
  const s = 100 * escala;
  const o = (100 - s) / 2;
  const r = s * 0.36; // radio del anillo
  const g = s * 0.17; // grosor
  const cx = o + s / 2;
  const cy = o + s / 2;
  // Anillo abierto: arco de 276° dejando una abertura arriba a la derecha.
  const a0 = (-72 * Math.PI) / 180;
  const a1 = (-72 - 276) * (Math.PI / 180);
  const p = (a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  // Punto: en la abertura, un poco afuera.
  const ap = (-30 * Math.PI) / 180;
  const dx = cx + r * Math.cos(ap);
  const dy = cy + r * Math.sin(ap);
  return `
    <path d="M ${x0} ${y0} A ${r} ${r} 0 1 0 ${x1} ${y1}" fill="none" stroke="${e.anillo}" stroke-width="${g}" stroke-linecap="round"/>
    <circle cx="${dx}" cy="${dy}" r="${g * 0.58}" fill="${e.punto}"/>`;
}

function fondo(e, radio = 0, id = 'bg') {
  return `
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${e.fondo[0]}"/><stop offset="1" stop-color="${e.fondo[1]}"/>
    </linearGradient></defs>
    <rect width="100" height="100" rx="${radio}" fill="url(#${id})"/>`;
}

const svg = (contenido) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">${contenido}</svg>`;

function png(svgTexto, tam) {
  return new Resvg(svgTexto, { fitTo: { mode: 'width', value: tam }, background: 'rgba(0,0,0,0)' }).render().asPng();
}

if (estilo === 'widget') {
  // Vista previa del widget (la que muestra Android en la lista de widgets).
  const t = (x, y, txt, size, color, peso = 500, anchor = 'start') =>
    `<text x="${x}" y="${y}" font-family="Inter, Arial" font-size="${size}" font-weight="${peso}" fill="${color}" text-anchor="${anchor}">${txt}</text>`;
  const prev = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="300">
    <rect width="640" height="300" rx="44" fill="#141416"/>
    ${t(32, 58, 'TINZIT0 · HOY', 20, '#CFF56B', 700)}
    ${t(608, 58, 'Pecho 💪', 22, '#A1A1A6', 500, 'end')}
    ${t(32, 140, '3 tareas pendientes', 40, '#F4F4F2', 700)}
    ${t(32, 180, '• Comprar pan   • Pagar la luz   • Llamar a la abuela', 22, '#A1A1A6')}
    ${t(32, 240, 'Semana', 22, '#6B6B70')}
    ${t(608, 240, '$62.400 de $100.000', 22, '#F4F4F2', 700, 'end')}
    <rect x="32" y="256" width="576" height="10" rx="5" fill="#2A2A2E"/>
    <rect x="32" y="256" width="${576 * 0.624}" height="10" rx="5" fill="#CFF56B"/>
  </svg>`;
  writeFileSync('assets/widget-preview.png', new Resvg(prev, { font: { loadSystemFonts: true } }).render().asPng());
  console.log('✅ assets/widget-preview.png');
} else if (estilo === 'todos') {
  // Hoja de propuestas: los 3 estilos lado a lado, como ícono redondeado.
  const keys = Object.keys(ESTILOS);
  const ancho = 360 * keys.length + 40;
  const items = keys
    .map((k, i) => {
      const e = ESTILOS[k];
      return `<g transform="translate(${40 + i * 360}, 40)">
        <svg x="0" y="0" width="280" height="280" viewBox="0 0 100 100">${fondo(e, 22, 'bg' + i)}${marca(e)}</svg>
        <text x="140" y="330" text-anchor="middle" font-family="Arial" font-size="26" font-weight="700" fill="#F4F4F2">${i + 1}. ${e.nombre}</text>
      </g>`;
    })
    .join('');
  const hoja = `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="400"><rect width="100%" height="100%" fill="#141416"/>${items}</svg>`;
  mkdirSync('docs', { recursive: true });
  writeFileSync('docs/propuestas-icono.png', new Resvg(hoja, { font: { loadSystemFonts: true } }).render().asPng());
  console.log('✅ docs/propuestas-icono.png');
} else {
  const e = ESTILOS[estilo];
  if (!e) throw new Error(`Estilo desconocido: ${estilo}`);
  // Ícono principal (iOS/general): cuadrado completo, el sistema redondea.
  writeFileSync('assets/icon.png', png(svg(fondo(e) + marca(e)), 1024));
  // Android adaptativo: fondo y figura por separado. La figura cabe en la zona segura (66%).
  writeFileSync('assets/android-icon-background.png', png(svg(fondo(e)), 1024));
  writeFileSync('assets/android-icon-foreground.png', png(svg(marca(e, 0.42)), 1024));
  // Monocromo (íconos temáticos de Android 13+): figura blanca.
  writeFileSync('assets/android-icon-monochrome.png', png(svg(marca({ anillo: '#FFFFFF', punto: '#FFFFFF' }, 0.42)), 1024));
  // Pantalla de carga: solo la figura (el fondo lo pone app.json).
  writeFileSync('assets/splash-icon.png', png(svg(marca(e, 0.9)), 1024));
  writeFileSync('assets/favicon.png', png(svg(fondo(e, 22) + marca(e)), 96));
  console.log(`✅ Íconos generados con el estilo "${e.nombre}". Fondo splash: ${e.fondo[0]}`);
}
