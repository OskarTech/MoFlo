import React, { useId, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import Svg, { Defs, LinearGradient, Stop, Path, Line, Circle } from 'react-native-svg';
import { useTheme } from '../../hooks/useTheme';

const H = 120;
const PAD_X = 6;
const PAD_TOP = 8;
const PAD_BOTTOM = 6;

interface Props {
  /** Gasto acumulado día a día del mes elegido (hasta hoy si es el actual) */
  current: number[];
  /** Lo mismo del mes anterior, entero; null si no tuvo gastos */
  previous: number[] | null;
  /** Días del mes elegido: el eje llega hasta aquí */
  daysInMonth: number;
  /** Etiqueta del último punto (p. ej. "hoy") */
  endLabel?: string;
}

/**
 * Gasto acumulado del mes, con el del mes anterior de fondo en discontinua.
 * Mismo eje para los dos: se ve de un vistazo si se va por encima o por debajo.
 */
const RhythmChart = ({ current, previous, daysInMonth, endLabel }: Props) => {
  const { colors: dc, ui } = useTheme();
  const id = useId().replace(/:/g, '');
  const [width, setWidth] = useState(0);

  const max = Math.max(1, ...current, ...(previous ?? [])) * 1.08;
  const x = (day: number) => PAD_X + ((day - 1) / Math.max(1, daysInMonth - 1)) * (width - PAD_X * 2);
  const base = H - PAD_BOTTOM;
  const y = (v: number) => base - (v / max) * (base - PAD_TOP);
  const path = (values: number[]) =>
    values.map((v, i) => `${i ? 'L' : 'M'}${x(i + 1).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');

  const lastX = x(current.length);
  const lastY = y(current[current.length - 1] ?? 0);
  const mid = Math.ceil(daysInMonth / 2);

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <Svg width={width} height={H}>
          <Defs>
            <LinearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={ui.accent} stopOpacity={0.28} />
              <Stop offset="1" stopColor={ui.accent} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Line x1={0} x2={width} y1={base} y2={base} stroke={ui.hair2} strokeWidth={1} />
          {previous && (
            <Path
              d={path(previous.slice(0, daysInMonth))}
              fill="none" stroke={dc.textSecondary} strokeOpacity={0.6}
              strokeWidth={1.6} strokeDasharray="3 4"
            />
          )}
          {current.length > 0 && (
            <>
              <Path
                d={`${path(current)} L${lastX.toFixed(1)} ${base} L${x(1).toFixed(1)} ${base} Z`}
                fill={`url(#${id}g)`}
              />
              <Path
                d={path(current)}
                fill="none" stroke={ui.accent} strokeWidth={2.4}
                strokeLinejoin="round" strokeLinecap="round"
              />
              <Circle cx={lastX} cy={lastY} r={4.5} fill={ui.accent} stroke={ui.sheet} strokeWidth={2.5} />
            </>
          )}
        </Svg>
      )}
      {/* Eje de días: el primero, el de en medio y el último */}
      <View style={styles.axis}>
        <Text style={[styles.axisText, { color: dc.textSecondary }]}>1</Text>
        <Text style={[styles.axisText, { color: dc.textSecondary }]}>{mid}</Text>
        <Text style={[styles.axisText, { color: endLabel ? ui.accent : dc.textSecondary }]}>
          {endLabel ?? daysInMonth}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  axisText: { fontSize: 10.5, fontFamily: 'Poppins_500Medium' },
});

export default RhythmChart;
