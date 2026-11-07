import React, { useRef, useState } from 'react';
import {
  View, StyleSheet, Pressable, PanResponder, PanResponderGestureState, AccessibilityActionEvent,
} from 'react-native';
import { Text } from 'react-native-paper';
import Svg, { Line, Path, Rect } from 'react-native-svg';
import { useTheme } from '../../hooks/useTheme';
import { CompoundYear, niceCeil } from '../../utils/compoundInterest';
import { selectionHaptic } from '../../utils/haptics';

const PLOT_H = 160;
// Aire encima del tope del eje, para que su etiqueta no se corte
const PLOT_TOP = 10;
const BAR_MAX = 24;
// Hueco del color de la hoja entre lo aportado y los intereses, y entre barras
const GAP = 2;
const RADIUS = 4;
const AXIS_H = 22;
const YEAR_LABEL_W = 36;
// El arrastre se reconoce como en SwipeNavigator: solo si va claramente en
// horizontal, así el scroll vertical de la pantalla sigue funcionando encima
const DRAG_START = 6;
const DRAG_RATIO = 1.5;

interface Props {
  data: CompoundYear[];
  /** Índice del año elegido */
  selected: number;
  onSelect: (index: number) => void;
  contributedColor: string;
  interestColor: string;
  /** Las cifras del eje. `compact` cuando el eje llega a 10.000: 50 mil €, 1,25 M € */
  axisLabel: (value: number, compact: boolean) => string;
  accessibilityLabel: string;
  /** Lo que lee el lector de pantalla: el año elegido y sus cifras */
  accessibilityValue: string;
}

// Ancho aproximado de una etiqueta del eje (Poppins de 10,5): los signos y
// espacios ocupan menos que cifras y letras, y las mayúsculas (CHF, Mio.) más.
// Mejor que sobre a que se corte
const labelWidth = (text: string) =>
  [...text].reduce((width, ch) => width + (/[\s.,]/.test(ch) ? 3 : /[A-Z]/.test(ch) ? 8 : 6.6), 0);

const isDrag = ({ dx, dy }: PanResponderGestureState) =>
  Math.abs(dx) > DRAG_START && Math.abs(dx) > Math.abs(dy) * DRAG_RATIO;

// Tramo de barra que sube desde y + h hasta y: la punta redondeada, la base recta
const roundedTop = (x: number, y: number, w: number, h: number) => {
  const r = Math.min(RADIUS, w / 2, h);
  return `M${x} ${y + h}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}H${x + w - r}`
    + `A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h}Z`;
};

/**
 * Barras por año del interés compuesto: abajo lo aportado y encima, separado
 * por un hueco, lo generado. Tocar o arrastrar el dedo elige un año; la
 * pantalla enseña sus cifras encima. El eje de cifras va a la izquierda, con
 * la mitad y el tope redondos.
 */
const CompoundChart = ({
  data, selected, onSelect, contributedColor, interestColor, axisLabel,
  accessibilityLabel, accessibilityValue,
}: Props) => {
  const { colors: dc, ui } = useTheme();
  const [width, setWidth] = useState(0);

  const count = data.length;
  const top = niceCeil(Math.max(0, ...data.map((d) => d.total)));
  const compact = top >= 10000;
  const ticks = [top / 2, top].map((value) => ({ value, label: axisLabel(value, compact) }));
  const gutter = Math.ceil(Math.max(...ticks.map((tick) => labelWidth(tick.label)))) + 10;
  const plotW = Math.max(0, width - gutter);
  const slot = count ? plotW / count : 0;
  // Fina: lo que sobra del hueco de cada año queda de aire, al menos los 2 de separación
  const barW = Math.max(1, Math.min(BAR_MAX, slot - Math.max(GAP, slot * 0.35)));
  const base = PLOT_TOP + PLOT_H;
  const yOf = (value: number) => base - (value / top) * PLOT_H;
  const centerOf = (index: number) => gutter + slot * index + slot / 2;

  // El PanResponder se crea una vez: lee el hueco, el año elegido y onSelect de aquí
  const live = useRef({ slot, count, selected, onSelect });
  live.current = { slot, count, selected, onSelect };

  const pick = useRef((x: number) => {
    const { slot: s, count: n, selected: current, onSelect: select } = live.current;
    if (!s || !n) return;
    const index = Math.min(n - 1, Math.max(0, Math.floor(x / s)));
    if (index === current) return;
    // Hasta que llegue el render, el mismo año no vuelve a dar el tic
    live.current.selected = index;
    selectionHaptic();
    select(index);
  }).current;

  const dragFrom = useRef(0);
  const pan = useRef(PanResponder.create({
    // Al tocar no se reclama nada: el toque suelto es del Pressable de dentro
    // y el scroll vertical, de la pantalla
    onStartShouldSetPanResponder: () => false,
    // Capture: se lo quita al Pressable en cuanto el dedo va en horizontal
    onMoveShouldSetPanResponderCapture: (_, gesture) => isDrag(gesture),
    onMoveShouldSetPanResponder: (_, gesture) => isDrag(gesture),
    onPanResponderGrant: (event, gesture) => {
      dragFrom.current = event.nativeEvent.locationX - gesture.dx;
      pick(event.nativeEvent.locationX);
    },
    onPanResponderMove: (_, gesture) => pick(dragFrom.current + gesture.dx),
  })).current;

  // Lector de pantalla: deslizar arriba o abajo pasa de año
  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    const step = event.nativeEvent.actionName === 'increment' ? 1
      : event.nativeEvent.actionName === 'decrement' ? -1 : 0;
    const next = Math.min(count - 1, Math.max(0, selected + step));
    if (step && next !== selected) onSelect(next);
  };

  // Años del eje: el primero, el de en medio y el último
  const yearTicks = [...new Set([0, Math.floor((count - 1) / 2), count - 1])].filter((i) => i >= 0);

  // Franja suave detrás del año elegido; con barras muy finas, algo más ancha
  // que su hueco para que se vea
  const bandW = Math.max(barW + 8, Math.min(slot, barW + 12));

  return (
    <View style={{ height: base + AXIS_H }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && count > 0 && (
        <>
          <Svg width={width} height={base}>
            {ticks.map((tick) => (
              <Line
                key={tick.value}
                x1={gutter} x2={width} y1={yOf(tick.value)} y2={yOf(tick.value)}
                stroke={ui.hair} strokeWidth={1}
              />
            ))}
            {selected >= 0 && selected < count && (
              <Rect
                x={centerOf(selected) - bandW / 2} y={PLOT_TOP - 6}
                width={bandW} height={PLOT_H + 6} rx={6}
                fill={ui.fill2}
              />
            )}
            {data.map((point, i) => {
              const x = gutter + slot * i + (slot - barW) / 2;
              const contributedH = (point.contributed / top) * PLOT_H;
              const totalH = (point.total / top) * PLOT_H;
              // Con lo aportado casi invisible, los intereses llegan hasta la base
              const hasContributed = contributedH >= 1;
              const interestBottom = hasContributed ? contributedH + GAP : 0;
              const hasInterest = totalH - interestBottom >= 1;
              return (
                <React.Fragment key={point.year}>
                  {hasContributed && (hasInterest ? (
                    <Rect x={x} y={base - contributedH} width={barW} height={contributedH} fill={contributedColor} />
                  ) : (
                    <Path d={roundedTop(x, base - contributedH, barW, contributedH)} fill={contributedColor} />
                  ))}
                  {hasInterest && (
                    <Path
                      d={roundedTop(x, base - totalH, barW, totalH - interestBottom)}
                      fill={interestColor}
                    />
                  )}
                </React.Fragment>
              );
            })}
            <Line x1={gutter} x2={width} y1={base} y2={base} stroke={ui.hair2} strokeWidth={1} />
          </Svg>

          {ticks.map((tick) => (
            <Text
              key={tick.value}
              style={[styles.tick, { top: yOf(tick.value) - 8, width: gutter - 8, color: dc.textSecondary }]}
              numberOfLines={1}
              // Por si la estimación se queda corta: se encoge antes que cortarse
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {tick.label}
            </Text>
          ))}
          {yearTicks.map((i) => (
            <Text
              key={i}
              style={[
                styles.year,
                {
                  top: base + 5,
                  left: Math.min(width - YEAR_LABEL_W, Math.max(gutter - 6, centerOf(i) - YEAR_LABEL_W / 2)),
                  color: dc.textSecondary,
                },
              ]}
              numberOfLines={1}
            >
              {data[i].year}
            </Text>
          ))}

          {/* Encima de todo: toques, arrastre y lector de pantalla */}
          <View
            style={[styles.touch, { left: gutter, width: plotW, height: base + AXIS_H }]}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={accessibilityLabel}
            accessibilityValue={{ text: accessibilityValue }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={onAccessibilityAction}
            {...pan.panHandlers}
          >
            <Pressable style={StyleSheet.absoluteFill} onPress={(e) => pick(e.nativeEvent.locationX)} />
          </View>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  tick: {
    position: 'absolute', left: 0, textAlign: 'right',
    fontSize: 10.5, lineHeight: 16, fontFamily: 'Poppins_500Medium', fontVariant: ['tabular-nums'],
  },
  year: {
    position: 'absolute', width: YEAR_LABEL_W, textAlign: 'center',
    fontSize: 10.5, fontFamily: 'Poppins_500Medium',
  },
  touch: { position: 'absolute', top: 0 },
});

export default CompoundChart;
