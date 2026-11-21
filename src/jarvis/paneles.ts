/**
 * Paneles HUD que el asistente muestra en la pantalla holográfica mientras habla.
 * Son solo datos (sin dibujo), así el ejecutor los arma y se pueden probar en Node.
 * El dibujo está en src/jarvis/PanelHud.tsx.
 */
export type ItemPanel = { texto: string; detalle?: string; hecho?: boolean };

export type Panel =
  | { tipo: 'lista'; titulo: string; items: ItemPanel[]; vacio?: string }
  | { tipo: 'cifras'; titulo: string; cifras: { label: string; valor: string; alerta?: boolean }[] }
  | {
      tipo: 'clima';
      ciudad: string;
      temp: number;
      descripcion: string;
      icono: string;
      dias: { dia: string; max: number; min: number; lluvia: number; icono: string }[];
    };

/** Cambios de la interfaz pedidos por voz ("ponte rojo", "haz un escaneo"). */
export type CambioHud = { color?: import('@/voice/interpretar').ColorHud; efecto?: 'scan' | 'pulse' };
