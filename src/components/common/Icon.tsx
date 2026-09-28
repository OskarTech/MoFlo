import React, { memo } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { IONICON_TO_PHOSPHOR, PHOSPHOR, PhosphorName } from './icons/phosphor.generated';

/** Nombres de Ionicons: los que guardan las categorías y huchas en Firestore */
export type IoniconName = keyof typeof Ionicons.glyphMap;
/** Un nombre de Ionicons (se traduce a Phosphor) o uno de Phosphor con su grosor */
export type IconName = IoniconName | PhosphorName;

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

const isPhosphor = (name: string): name is PhosphorName => name in PHOSPHOR;

/**
 * Iconos de la app: Phosphor, en dos tonos, relleno o, los de trazo (flechas,
 * +, X), con el trazo normal. Acepta los nombres de
 * Ionicons de siempre y los traduce (ver scripts/icons/icon-map.js), así los
 * datos guardados no cambian y las versiones anteriores de la app los siguen
 * entendiendo. Un nombre sin equivalente (el logo de Google) se pinta con
 * Ionicons, como antes.
 */
const Icon = ({ name, size = 24, color = '#000000', style }: Props) => {
  const key = isPhosphor(name) ? name : IONICON_TO_PHOSPHOR[name];
  if (!key) return <Ionicons name={name as IoniconName} size={size} color={color} style={style} />;
  return (
    <Svg width={size} height={size} viewBox="0 0 256 256" style={style}>
      {PHOSPHOR[key].map(([d, opacity], i) => (
        <Path key={i} d={d} fill={color} opacity={opacity} />
      ))}
    </Svg>
  );
};

export default memo(Icon);
