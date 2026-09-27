import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Text } from 'react-native-paper';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../hooks/useTheme';
import { FAB_CENTER_FROM_RIGHT } from './GlassTabBar';

// La flecha: sale junto al texto y baja curvándose hasta el botón +
const W = 56;
const H = 46;
const TIP_X = 44;

/**
 * "Pulsa + para añadir…" con una flecha que baja hasta el botón + de la barra.
 * Va al final del contenido y a todo el ancho de la pantalla: así queda justo
 * encima del hueco que se deja para la barra y la flecha acaba sobre el botón.
 */
const AddHint = ({ label, style }: { label: string; style?: StyleProp<ViewStyle> }) => {
  const { colors: dc } = useTheme();
  return (
    <View style={[styles.wrap, style]} pointerEvents="none">
      <Text style={[styles.text, { color: dc.textSecondary }]}>{label}</Text>
      <Svg width={W} height={H}>
        <Path
          d="M4 10 C24 4, 40 14, 44 40"
          fill="none" stroke={dc.textSecondary} strokeOpacity={0.7}
          strokeWidth={1.8} strokeLinecap="round"
        />
        <Path
          d="M38.5 34.2 L44 40 L47.5 32.8"
          fill="none" stroke={dc.textSecondary} strokeOpacity={0.7}
          strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'flex-start',
    paddingLeft: 20, paddingRight: FAB_CENTER_FROM_RIGHT - (W - TIP_X), marginTop: 16,
  },
  text: { flexShrink: 1, fontSize: 13, fontFamily: 'Poppins_500Medium', textAlign: 'right' },
});

export default AddHint;
