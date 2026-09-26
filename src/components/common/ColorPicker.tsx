import React, { useEffect, useId, useRef, useState } from 'react';
import { View, StyleSheet, PanResponder, LayoutChangeEvent, GestureResponderEvent } from 'react-native';
import { Text } from 'react-native-paper';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/useTheme';
import { hexToHsv, hsvToHex, isHexColor } from '../../utils/color';
import BottomSheet, { SheetButton } from './BottomSheet';

const SV_HEIGHT = 210;
const HUE_HEIGHT = 44;
const THUMB = 28;

const clamp = (n: number) => Math.min(1, Math.max(0, n));

// Los tonos de la barra, de rojo a rojo
const HUE_STOPS = ['#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF', '#FF0000'];

type Hsv = { h: number; s: number; v: number };

/**
 * Zona que sigue al dedo desde que se toca. Se queda con el gesto desde el
 * principio (dentro de un Modal de Android, esperar al movimiento no
 * funciona) y no lo suelta, así que la ventana no se desplaza mientras tanto.
 * Las coordenadas salen de la posición en pantalla del primer toque: así da
 * igual qué capa de dentro se haya tocado.
 */
const useDrag = (onPoint: (x: number, y: number) => void) => {
  const onPointRef = useRef(onPoint);
  onPointRef.current = onPoint;
  const origin = useRef({ x: 0, y: 0 });
  return useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e: GestureResponderEvent) => {
        const { pageX, pageY, locationX, locationY } = e.nativeEvent;
        origin.current = { x: pageX - locationX, y: pageY - locationY };
        onPointRef.current(locationX, locationY);
      },
      onPanResponderMove: (_, g) => {
        onPointRef.current(g.moveX - origin.current.x, g.moveY - origin.current.y);
      },
    }),
  ).current;
};

/**
 * Selector libre: un panel con el tono elegido (a la derecha, más intenso;
 * abajo, más oscuro) y una barra con todos los tonos. Se elige tocando o
 * arrastrando el dedo en los dos.
 */
export const ColorPickerPanel = ({ value, onChange }: { value: string; onChange: (hex: string) => void }) => {
  const { colors: dc, ui } = useTheme();
  const id = useId().replace(/:/g, '');
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(isHexColor(value) ? value : '#E8735A'));
  const hsvRef = useRef(hsv);
  hsvRef.current = hsv;
  const [svWidth, setSvWidth] = useState(0);
  const [hueWidth, setHueWidth] = useState(0);
  const svWidthRef = useRef(0);
  const hueWidthRef = useRef(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const update = (next: Hsv) => {
    setHsv(next);
    onChangeRef.current(hsvToHex(next.h, next.s, next.v));
  };

  const svPan = useDrag((x, y) => {
    const w = svWidthRef.current;
    if (!w) return;
    update({ h: hsvRef.current.h, s: clamp(x / w), v: 1 - clamp(y / SV_HEIGHT) });
  });
  const huePan = useDrag((x) => {
    const w = hueWidthRef.current - THUMB;
    if (w <= 0) return;
    // Sin llegar a 360: sería otra vez el rojo del principio
    update({ ...hsvRef.current, h: clamp((x - THUMB / 2) / w) * 359.9 });
  });

  const hueHex = hsvToHex(hsv.h, 1, 1);
  const hex = hsvToHex(hsv.h, hsv.s, hsv.v);

  return (
    <View>
      <View
        style={styles.sv}
        onLayout={(e: LayoutChangeEvent) => {
          svWidthRef.current = e.nativeEvent.layout.width;
          setSvWidth(e.nativeEvent.layout.width);
        }}
        {...svPan.panHandlers}
      >
        <View pointerEvents="none" style={[styles.svClip, { borderColor: ui.hair }]}>
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity={1} />
                <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
              </LinearGradient>
              <LinearGradient id={`${id}v`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#000000" stopOpacity={0} />
                <Stop offset="1" stopColor="#000000" stopOpacity={1} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill={hueHex} />
            <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}s)`} />
            <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}v)`} />
          </Svg>
        </View>
        {svWidth > 0 && (
          <View
            pointerEvents="none"
            style={[
              styles.thumb,
              {
                backgroundColor: hex,
                left: hsv.s * svWidth - THUMB / 2,
                top: (1 - hsv.v) * SV_HEIGHT - THUMB / 2,
              },
            ]}
          />
        )}
      </View>

      <View
        style={styles.hue}
        onLayout={(e: LayoutChangeEvent) => {
          hueWidthRef.current = e.nativeEvent.layout.width;
          setHueWidth(e.nativeEvent.layout.width);
        }}
        {...huePan.panHandlers}
      >
        <View pointerEvents="none" style={styles.hueTrack}>
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id={`${id}h`} x1="0" y1="0" x2="1" y2="0">
                {HUE_STOPS.map((c, i) => (
                  <Stop key={i} offset={i / (HUE_STOPS.length - 1)} stopColor={c} stopOpacity={1} />
                ))}
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}h)`} />
          </Svg>
        </View>
        {hueWidth > 0 && (
          <View
            pointerEvents="none"
            style={[
              styles.thumb,
              styles.hueThumb,
              { backgroundColor: hueHex, left: (hsv.h / 359.9) * (hueWidth - THUMB) },
            ]}
          />
        )}
      </View>

      <View style={styles.previewRow}>
        <View style={[styles.preview, { backgroundColor: hex, borderColor: ui.hair }]} />
        <Text style={[styles.hex, { color: dc.textPrimary }]}>{hex}</Text>
      </View>
    </View>
  );
};

/** El selector libre en su propia ventana, para las pantallas (p. ej. crear hucha) */
export const ColorPickerSheet = ({
  visible, value, onDismiss, onSelect,
}: {
  visible: boolean;
  value: string;
  onDismiss: () => void;
  onSelect: (hex: string) => void;
}) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);
  // Cada vez que se abre, el panel empieza en el color actual
  const [openCount, setOpenCount] = useState(0);
  useEffect(() => {
    if (!visible) return;
    setDraft(value);
    setOpenCount((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir
  }, [visible]);

  return (
    <BottomSheet
      visible={visible}
      onClose={onDismiss}
      title={t('common.colorPickerTitle')}
      subtitle={t('common.colorPickerHint')}
      scrollable={false}
      footer={(
        <SheetButton
          label={t('common.colorPickerUse')}
          onPress={() => { onSelect(draft); onDismiss(); }}
        />
      )}
    >
      <ColorPickerPanel key={openCount} value={value} onChange={setDraft} />
    </BottomSheet>
  );
};

/** Círculo con todos los tonos, para abrir el selector libre */
export const RainbowSwatch = ({ size = 30 }: { size?: number }) => {
  const id = useId().replace(/:/g, '');
  return (
    <Svg width={size} height={size}>
      <Defs>
        <LinearGradient id={`${id}r`} x1="0" y1="0" x2="1" y2="1">
          {HUE_STOPS.map((c, i) => (
            <Stop key={i} offset={i / (HUE_STOPS.length - 1)} stopColor={c} stopOpacity={1} />
          ))}
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width={size} height={size} rx={size / 2} fill={`url(#${id}r)`} />
    </Svg>
  );
};

const styles = StyleSheet.create({
  sv: { height: SV_HEIGHT, marginTop: 4 },
  svClip: { ...StyleSheet.absoluteFillObject, borderRadius: 18, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  thumb: {
    position: 'absolute', width: THUMB, height: THUMB, borderRadius: THUMB / 2,
    borderWidth: 3, borderColor: '#FFFFFF',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 3,
  },
  hue: { height: HUE_HEIGHT, marginTop: 18, justifyContent: 'center' },
  hueTrack: { height: 22, borderRadius: 11, overflow: 'hidden', marginHorizontal: THUMB / 2 - 4 },
  hueThumb: { top: (HUE_HEIGHT - THUMB) / 2 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  preview: { width: 44, height: 44, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth },
  hex: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', letterSpacing: 1 },
});
