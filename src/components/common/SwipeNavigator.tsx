import React, { useRef } from 'react';
import {
  Animated, Dimensions, PanResponder, StyleProp, ViewStyle,
} from 'react-native';
import { selectionHaptic } from '../../utils/haptics';

interface Props {
  children: React.ReactNode;
  /** Deslizar hacia la izquierda (el contenido se va a la izquierda) */
  onSwipeLeft?: () => void;
  /** Deslizar hacia la derecha */
  onSwipeRight?: () => void;
  style?: StyleProp<ViewStyle>;
}

// Distancia mínima para contar como deslizamiento
const DISTANCE = 45;
// Debe empezar claramente en horizontal para no robarle el scroll vertical
const START = 12;
const RATIO = 1.5;
// El contenido acompaña al dedo amortiguado, no 1:1: se siente más contenido
const DAMPING = 0.35;

const SCREEN = Dimensions.get('window').width;
const EXIT = SCREEN * 0.28;

/**
 * Detecta deslizamientos horizontales y anima la transición: el contenido
 * acompaña al dedo y se desvanece, sale por el lado del gesto y el nuevo
 * entra desde el contrario.
 *
 * Usa PanResponder y la API Animated de React Native, no gesture-handler ni
 * Reanimated: se comporta igual en iOS y Android, y solo reclama el gesto
 * cuando el movimiento es inequívocamente horizontal, así que el scroll
 * vertical y los botones de dentro siguen funcionando.
 *
 * Transform y opacity van por el driver nativo: la animación corre fuera del
 * hilo de JS y no se entrecorta aunque la pantalla tenga gráficas.
 */
const SwipeNavigator = ({ children, onSwipeLeft, onSwipeRight, style }: Props) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const busy = useRef(false);

  // Las funciones se leen desde una ref para que el PanResponder, que se crea
  // una sola vez, no se quede con versiones antiguas
  const handlers = useRef({ onSwipeLeft, onSwipeRight });
  handlers.current = { onSwipeLeft, onSwipeRight };

  const springBack = () => {
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: 0, useNativeDriver: true, bounciness: 6, speed: 18,
      }),
      Animated.timing(opacity, { toValue: 1, duration: 140, useNativeDriver: true }),
    ]).start();
  };

  const runTransition = (direction: -1 | 1, action: () => void) => {
    busy.current = true;
    // 1. Lo actual termina de salir por donde iba el dedo
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: direction * EXIT, duration: 130, useNativeDriver: true,
      }),
      Animated.timing(opacity, { toValue: 0, duration: 130, useNativeDriver: true }),
    ]).start(() => {
      // 2. Se cambia el contenido mientras está invisible y se coloca al otro lado
      action();
      translateX.setValue(-direction * EXIT);
      // 3. Lo nuevo entra hasta su sitio
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: 0, duration: 190, useNativeDriver: true,
        }),
        Animated.timing(opacity, { toValue: 1, duration: 190, useNativeDriver: true }),
      ]).start(() => { busy.current = false; });
    });
  };

  const responder = useRef(
    PanResponder.create({
      // Al tocar no se captura nada: los botones de dentro siguen respondiendo
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gesture) =>
        !busy.current &&
        Math.abs(gesture.dx) > START &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy) * RATIO,
      onPanResponderMove: (_, gesture) => {
        if (busy.current) return;
        const shift = gesture.dx * DAMPING;
        translateX.setValue(shift);
        // Se desvanece con el recorrido, sin llegar a desaparecer del todo
        const progress = Math.min(1, Math.abs(gesture.dx) / (DISTANCE * 3));
        opacity.setValue(1 - progress * 0.55);
      },
      onPanResponderRelease: (_, gesture) => {
        if (busy.current) return;
        const direction: -1 | 1 = gesture.dx < 0 ? -1 : 1;
        const action = direction === -1
          ? handlers.current.onSwipeLeft
          : handlers.current.onSwipeRight;
        if (Math.abs(gesture.dx) < DISTANCE || !action) {
          springBack();
          return;
        }
        selectionHaptic();
        runTransition(direction, action);
      },
      // Si otro componente roba el gesto, el contenido vuelve a su sitio
      onPanResponderTerminate: springBack,
    })
  ).current;

  return (
    <Animated.View
      style={[style, { transform: [{ translateX }], opacity }]}
      {...responder.panHandlers}
    >
      {children}
    </Animated.View>
  );
};

export default SwipeNavigator;
