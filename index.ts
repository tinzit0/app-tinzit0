/**
 * Punto de entrada de la app.
 * 1. Registra el widget de la pantalla de inicio (solo hace algo en el development build).
 * 2. Define la tarea de fondo de asistencia automática (tiene que existir antes que todo).
 * 3. Arranca Expo Router (la navegación y todas las pantallas).
 */
import { registrarWidget } from '@/widget';
import '@/estudio/campusTarea';
import 'expo-router/entry';

registrarWidget();

