import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated, StyleSheet, TouchableOpacity, View,
  StyleProp, ViewStyle,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { selectionHaptic } from '../../utils/haptics';

export interface SwipeAction {
  icon: keyof typeof Ionicons.glyphMap;
  /** Fondo del botón */
  background: string;
  /** Color del icono */
  tint?: string;
  onPress: () => void;
}

interface Props {
  children: React.ReactNode;
  /** Se revelan deslizando la fila hacia la izquierda */
  actions: SwipeAction[];
  /** Radio de la tarjeta, para que el fondo de las acciones encaje */
  borderRadius?: number;
  containerStyle?: StyleProp<ViewStyle>;
  enabled?: boolean;
}

const ACTION_WIDTH = 64;

/**
 * Solo puede haber una fila abierta en toda la app. Se guarda aquí fuera del
 * componente para que cualquier fila pueda cerrar a la que estuviera abierta.
 */
let openRow: Swipeable | null = null;

/**
 * Cierra la fila abierta, si hay alguna.
 *
 * Las pantallas con filas deslizables lo enganchan a la raíz mediante
 * `onStartShouldSetResponderCapture`, que se dispara en la fase de captura ante
 * cualquier toque de la pantalla y devuelve false para no quedarse con el
 * gesto: así se cierra la fila y el toque sigue su camino normal hasta el botón
 * o la lista que se haya tocado.
 */
export const closeOpenSwipeable = () => {
  if (!openRow) return false;
  const row = openRow;
  openRow = null;
  // El cierre se anima en el hilo de JS, así que lanzarlo aquí mismo retrasaría
  // el re-render del toque que lo ha disparado (cambiar de filtro, por ejemplo).
  // Aplazándolo un frame, la pantalla reacciona al instante y la fila se cierra
  // por detrás.
  requestAnimationFrame(() => {
    // La fila puede haberse desmontado en ese frame (cambio de filtro, borrado)
    try { row.close(); } catch { /* ya no existe: nada que cerrar */ }
  });
  return false;
};

/**
 * Fila deslizable con acciones a la derecha.
 *
 * Usa el Swipeable clásico de gesture-handler (API Animated) en lugar del de
 * Reanimated: no necesita el plugin de Babel ni worklets, así que funciona con
 * el build nativo actual en iOS y Android sin cambios.
 */
const SwipeableRow = ({
  children, actions, borderRadius = 16, containerStyle, enabled = true,
}: Props) => {
  const rowRef = useRef<Swipeable>(null);
  // El Swipeable clásico llama a renderRightActions en cada render, no al
  // deslizar, así que sin esto cada fila de la lista montaría de entrada dos
  // botones pulsables con sus iconos de fuente aunque no se vean nunca. Hasta
  // el primer arrastre se dibujan solo los rectángulos de color.
  const [armed, setArmed] = useState(false);

  const close = () => rowRef.current?.close();

  // Al abrir esta, se cierra la que estuviera abierta
  const handleWillOpen = () => {
    if (openRow && openRow !== rowRef.current) openRow.close();
    openRow = rowRef.current;
    selectionHaptic();
  };

  const handleClosed = () => {
    if (openRow === rowRef.current) openRow = null;
  };

  const handleOpenStartDrag = useCallback(() => setArmed(true), []);

  // Si la fila se desmonta abierta (se borra el elemento, cambia el filtro),
  // el registro no puede quedarse apuntando a algo que ya no existe
  useEffect(() => () => {
    if (openRow === rowRef.current) openRow = null;
  }, []);

  const renderActions = (
    progress: Animated.AnimatedInterpolation<number>,
  ) => {
    // Los marcadores ocupan exactamente lo mismo que los botones reales: el
    // Swipeable mide aquí cuánto tiene que abrirse la fila, así que el ancho no
    // puede cambiar al sustituirlos
    if (!armed) {
      return (
        <View style={[styles.actions, { borderRadius }]}>
          {actions.map((action) => (
            <View
              key={action.icon}
              style={[styles.action, { backgroundColor: action.background }]}
            />
          ))}
        </View>
      );
    }

    return (
      <View style={[styles.actions, { borderRadius }]}>
        {actions.map((action, index) => {
          // Cada botón entra desplazándose desde la derecha
          const translateX = progress.interpolate({
            inputRange: [0, 1],
            outputRange: [ACTION_WIDTH * (actions.length - index), 0],
            extrapolate: 'clamp',
          });
          return (
            <Animated.View key={action.icon} style={{ transform: [{ translateX }] }}>
              <TouchableOpacity
                style={[styles.action, { backgroundColor: action.background }]}
                onPress={() => {
                  close();
                  action.onPress();
                }}
                activeOpacity={0.8}
              >
                <Ionicons name={action.icon} size={22} color={action.tint ?? '#FFFFFF'} />
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </View>
    );
  };

  if (!enabled || actions.length === 0) {
    return <View style={containerStyle}>{children}</View>;
  }

  return (
    <Swipeable
      ref={rowRef}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={renderActions}
      onSwipeableOpenStartDrag={handleOpenStartDrag}
      onSwipeableWillOpen={handleWillOpen}
      onSwipeableClose={handleClosed}
      containerStyle={containerStyle}
    >
      {children}
    </Swipeable>
  );
};

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', overflow: 'hidden' },
  action: {
    width: ACTION_WIDTH,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default SwipeableRow;
