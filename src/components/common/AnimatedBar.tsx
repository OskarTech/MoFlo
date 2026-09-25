import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleProp, ViewStyle } from 'react-native';

interface Props {
  // Porcentaje (0-100) o píxeles, según `unit`
  size: number;
  unit?: '%' | 'px';
  axis?: 'width' | 'height';
  // Retraso solo en la primera animación (efecto escalonado en listas)
  delay?: number;
  style?: StyleProp<ViewStyle>;
}

// Barra que se rellena con animación al aparecer y al cambiar de valor
const AnimatedBar = ({ size, unit = '%', axis = 'width', delay = 0, style }: Props) => {
  const anim = useRef(new Animated.Value(0)).current;
  const firstRef = useRef(true);

  useEffect(() => {
    const animation = Animated.timing(anim, {
      toValue: size,
      duration: 650,
      delay: firstRef.current ? delay : 0,
      easing: Easing.out(Easing.cubic),
      // Anchura/altura no se pueden animar con el driver nativo
      useNativeDriver: false,
    });
    firstRef.current = false;
    animation.start();
    return () => animation.stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- solo se anima al cambiar el tamaño; el retraso cuenta solo la primera vez
  }, [size]);

  const dimension = unit === '%'
    ? anim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'], extrapolate: 'clamp' })
    : anim;

  return (
    <Animated.View style={[style, axis === 'width' ? { width: dimension } : { height: dimension }]} />
  );
};

export default AnimatedBar;
