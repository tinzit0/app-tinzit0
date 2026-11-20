/**
 * Pantallas provisorias de la Fase 1.
 * Cada una se reemplaza por la real en su fase (Tareas → Fase 2, Gastos → Fase 3…).
 */
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';

export function GymScreen() {
  return (
    <Screen eyebrow="Entrenamiento" title="Gym">
      <EmptyState
        icon="barbell-outline"
        title="Tu rutina y tu progreso"
        description="Qué toca cada día, tus series, repeticiones y peso, y cómo vas subiendo."
      />
    </Screen>
  );
}

export function NotasScreen() {
  return (
    <Screen eyebrow="Ideas" title="Notas">
      <EmptyState
        icon="document-text-outline"
        title="Notas rápidas"
        description="Lo que se te ocurra, guardado con su fecha."
      />
    </Screen>
  );
}
