import React, { useEffect, useRef } from 'react';
import { Animated, TouchableOpacity, StyleProp, ViewStyle, TextStyle } from 'react-native';

interface Props {
  label: string;
  active: boolean;
  onPress: () => void;
  activeBackground: string;
  inactiveBackground: string;
  activeBorder: string;
  inactiveBorder: string;
  activeText: string;
  inactiveText: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

const DURATION = 220;

/**
 * Pastilla de pestaña que funde su color al activarse o desactivarse, en vez
 * de cambiarlo de golpe.
 *
 * La interpolación de color obliga a useNativeDriver: false, pero solo corre
 * al cambiar de pestaña (no durante un gesto), así que el coste en el hilo de
 * JS es irrelevante.
 */
const AnimatedTabPill = ({
  label, active, onPress,
  activeBackground, inactiveBackground,
  activeBorder, inactiveBorder,
  activeText, inactiveText,
  style, textStyle,
}: Props) => {
  const progress = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: active ? 1 : 0,
      duration: DURATION,
      useNativeDriver: false,
    }).start();
  }, [active, progress]);

  const backgroundColor = progress.interpolate({
    inputRange: [0, 1], outputRange: [inactiveBackground, activeBackground],
  });
  const borderColor = progress.interpolate({
    inputRange: [0, 1], outputRange: [inactiveBorder, activeBorder],
  });
  const color = progress.interpolate({
    inputRange: [0, 1], outputRange: [inactiveText, activeText],
  });

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={{ flex: 1 }}>
      <Animated.View style={[style, { backgroundColor, borderColor }]}>
        <Animated.Text style={[textStyle, { color }]}>{label}</Animated.Text>
      </Animated.View>
    </TouchableOpacity>
  );
};

export default AnimatedTabPill;
