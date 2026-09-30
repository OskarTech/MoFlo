import React, { useId, useMemo, useRef, useState } from 'react';
import {
  View, StyleSheet, Animated, Platform, StatusBar, RefreshControl, useWindowDimensions,
  ScrollViewProps, StyleProp, ViewStyle, LayoutChangeEvent,
} from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { useTabBarSpace } from '../navigation/GlassTabBar';

// Alto de la franja de la barra de estado. En Android se usa la de StatusBar,
// como ya hacía la cabecera antigua: los insets pueden llegar a 0 al arrancar.
export const useTopInset = () => {
  const insets = useSafeAreaInsets();
  return Platform.OS === 'android' ? (StatusBar.currentHeight ?? insets.top) : insets.top;
};

// Lo que la hoja sube sobre la cabecera
const SHEET_OVERLAP = 26;

// Brillo de arriba a la derecha: radios de su elipse (por el ancho y el alto de
// la cabecera) y hasta dónde llega, en la escala del degradado
const GLOW_RX = 1.3;
const GLOW_RY = 0.85;
const GLOW_END = 0.58;

// Lo que puede asomar por encima de la cabecera al tirar hacia abajo
const OVERSCROLL = 800;

// El fondo se dibuja un poco más ancho que su hueco. En Android el Svg redondea
// su ancho hacia abajo (411,43 dp = 1079,99 px pasa a 1079) y la última
// columna de píxeles quedaba sin pintar: una línea blanca en el borde derecho.
// Lo que sobra queda fuera de la pantalla o lo recorta la tarjeta.
const GLOW_BLEED = 2;

/**
 * Fondo de la cabecera: el color de la tarjeta de balance con el brillo de
 * la paleta arriba a la derecha y otro blanco muy suave abajo a la
 * izquierda. Se dibuja con react-native-svg, que ya estaba en la app.
 */
export const HeroGlow = ({ width, height }: { width: number; height: number }) => {
  const { ui } = useTheme();
  const id = useId().replace(/:/g, '');
  if (!width || !height) {
    return <View style={[StyleSheet.absoluteFill, { backgroundColor: ui.hero }]} />;
  }
  return (
    <Svg style={styles.glow} width={width + GLOW_BLEED} height={height} pointerEvents="none">
      <HeroGlowLayers id={id} width={width} height={height} />
    </Svg>
  );
};

// Las capas del fondo, para dibujarlas dentro de un Svg: en la cabecera y, las
// mismas, en la franja de la barra de estado. El brillo se sitúa con el ancho
// real y el color de fondo llega hasta lo que sobra por la derecha.
const HeroGlowLayers = ({ id, width, height }: { id: string; width: number; height: number }) => {
  const { ui } = useTheme();
  return (
    <>
      <Defs>
        <RadialGradient
          id={`${id}a`} gradientUnits="userSpaceOnUse"
          cx={width} cy={0} rx={width * GLOW_RX} ry={height * GLOW_RY} fx={width} fy={0}
        >
          <Stop offset="0" stopColor={ui.heroGlow} stopOpacity={ui.heroGlowOpacity} />
          <Stop offset={GLOW_END} stopColor={ui.heroGlow} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient
          id={`${id}b`} gradientUnits="userSpaceOnUse"
          cx={0} cy={height} rx={width * 0.9} ry={height * 0.7} fx={0} fy={height}
        >
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.09} />
          <Stop offset="0.6" stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={width + GLOW_BLEED} height={height} fill={ui.hero} />
      <Rect x={0} y={0} width={width + GLOW_BLEED} height={height} fill={`url(#${id}a)`} />
      <Rect x={0} y={0} width={width + GLOW_BLEED} height={height} fill={`url(#${id}b)`} />
    </>
  );
};

/**
 * Lo que asoma por encima de la cabecera al tirar hacia abajo (rebote de iOS y,
 * mientras actualiza, el hueco de la ruedita): su primera fila estirada hacia
 * arriba. En esa fila el brillo es un degradado de izquierda a derecha, así
 * que no se nota dónde acaba la cabecera; con el color liso se veía el corte.
 * Se dibuja un Svg de 1 de alto y se estira: con todo el alto ocuparía
 * varios MB de memoria para un color que no cambia de arriba abajo.
 */
const HeroOverscroll = ({ width }: { width: number }) => {
  const { ui } = useTheme();
  const id = useId().replace(/:/g, '');
  return (
    <View style={[styles.overscroll, { backgroundColor: ui.hero }]} pointerEvents="none">
      {width > 0 && (
        <Svg style={styles.overscrollRow} width={width + GLOW_BLEED} height={1}>
          <Defs>
            <LinearGradient
              id={`${id}o`} gradientUnits="userSpaceOnUse"
              x1={width * (1 - GLOW_RX * GLOW_END)} y1={0} x2={width} y2={0}
            >
              <Stop offset={0} stopColor={ui.heroGlow} stopOpacity={0} />
              <Stop offset={1} stopColor={ui.heroGlow} stopOpacity={ui.heroGlowOpacity} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={width + GLOW_BLEED} height={1} fill={`url(#${id}o)`} />
        </Svg>
      )}
    </View>
  );
};

/**
 * Parte de color de arriba. Deja hueco para la barra de estado y, por
 * debajo, lo que tapa la hoja. Encima lleva la continuación de su fondo para
 * que al tirar hacia abajo no se vea un hueco blanco.
 */
export const HeroTop = ({
  children, extraBottom = 0, style, onHeight,
}: {
  children: React.ReactNode;
  extraBottom?: number;
  style?: StyleProp<ViewStyle>;
  // Su alto, para que la franja de la barra de estado dibuje el mismo brillo
  onHeight?: (height: number) => void;
}) => {
  const topInset = useTopInset();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.width || height !== size.height) {
      setSize({ width, height });
      onHeight?.(height);
    }
  };
  return (
    <View
      onLayout={onLayout}
      style={[{ paddingTop: topInset, paddingBottom: SHEET_OVERLAP + 22 + extraBottom }, style]}
    >
      <HeroOverscroll width={size.width} />
      <HeroGlow width={size.width} height={size.height} />
      {children}
    </View>
  );
};

// La hoja que sube sobre la cabecera. Lleva el hueco de la barra de abajo
export const HeroSheet = ({
  children, style, noTabBarSpace,
}: { children: React.ReactNode; style?: StyleProp<ViewStyle>; noTabBarSpace?: boolean }) => {
  const { ui } = useTheme();
  const tabSpace = useTabBarSpace();
  return (
    <View
      style={[
        styles.sheet,
        { backgroundColor: ui.sheet, paddingBottom: noTabBarSpace ? 24 : tabSpace },
        style,
      ]}
    >
      {children}
    </View>
  );
};

// Tapa de la hoja para listas (FlatList): el resto de filas van debajo con el mismo fondo
export const HeroSheetCap = ({ children }: { children?: React.ReactNode }) => {
  const { ui } = useTheme();
  return <View style={[styles.cap, { backgroundColor: ui.sheet }]}>{children}</View>;
};

/**
 * Posición del scroll para la franja de la barra de estado: en reposo la
 * cabecera llega hasta arriba del todo, con su brillo; al desplazar, aparece
 * la franja para que el contenido no quede debajo de la hora y la batería.
 */
export const useHeroScroll = (listener?: (y: number) => void) => {
  const scrollY = useRef(new Animated.Value(0)).current;
  const onScroll = useMemo(
    () => Animated.event(
      [{ nativeEvent: { contentOffset: { y: scrollY } } }],
      {
        useNativeDriver: true,
        listener: listener
          ? (e: any) => listener(e.nativeEvent.contentOffset.y)
          : undefined,
      },
    ),
    [scrollY, listener],
  );
  return { scrollY, onScroll };
};

/**
 * Franja de la barra de estado: al desplazar, tapa lo que pasa por debajo de
 * la hora y la batería. Lleva el fondo de la cabecera (heroHeight es su alto)
 * y lo sube a la vez que ella, así que enseña justo el trozo que tiene debajo:
 * no se ve dónde empieza, el contenido simplemente se esconde bajo la hora.
 * Antes el brillo se quedaba quieto arriba mientras la cabecera subía, y la
 * franja salía más clara que lo de debajo. Cuando la hoja llega arriba, el
 * fondo se para: la franja se queda con el final de la cabecera y la hoja
 * pasa por debajo.
 */
export const HeroStatusBar = ({ scrollY, heroHeight = 0 }: { scrollY: Animated.Value; heroHeight?: number }) => {
  const { ui } = useTheme();
  const topInset = useTopInset();
  const { width } = useWindowDimensions();
  const id = useId().replace(/:/g, '');
  // Al tirar hacia abajo no sale: arriba asoma la continuación de la cabecera
  const opacity = scrollY.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' });
  // Desplazamiento con el que el borde de arriba de la hoja llega a la franja
  const sheetAtTop = Math.max(1, heroHeight - SHEET_OVERLAP - topInset);
  const translateY = scrollY.interpolate({
    inputRange: [0, sheetAtTop],
    outputRange: [0, -sheetAtTop],
    extrapolate: 'clamp',
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.statusBar, { height: topInset, opacity }]}>
      {heroHeight > 0 ? (
        <Animated.View style={{ transform: [{ translateY }] }}>
          <Svg width={width + GLOW_BLEED} height={sheetAtTop + topInset}>
            <HeroGlowLayers id={`${id}s`} width={width} height={heroHeight} />
          </Svg>
        </Animated.View>
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: ui.hero }]} />
      )}
    </Animated.View>
  );
};

type HeroScrollScreenProps = {
  hero: React.ReactNode;
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  scrollRef?: React.Ref<any>;
  heroExtraBottom?: number;
  sheetStyle?: StyleProp<ViewStyle>;
} & Omit<ScrollViewProps, 'children' | 'refreshControl' | 'onScroll'>;

/** Pantalla completa: cabecera de color y hoja con desplazamiento. */
export const HeroScrollScreen = ({
  hero, children, refreshing, onRefresh, scrollRef, heroExtraBottom, sheetStyle, ...scrollProps
}: HeroScrollScreenProps) => {
  const { ui } = useTheme();
  const topInset = useTopInset();
  const { scrollY, onScroll } = useHeroScroll();
  const [heroHeight, setHeroHeight] = useState(0);
  return (
    <View style={[styles.container, { backgroundColor: ui.sheet }]}>
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={onRefresh ? (
          <RefreshControl
            refreshing={!!refreshing}
            onRefresh={onRefresh}
            tintColor="#FFFFFF"
            colors={[ui.hero]}
            progressViewOffset={topInset}
          />
        ) : undefined}
        {...scrollProps}
      >
        <HeroTop extraBottom={heroExtraBottom} onHeight={setHeroHeight}>{hero}</HeroTop>
        <HeroSheet style={sheetStyle}>{children}</HeroSheet>
      </Animated.ScrollView>
      <HeroStatusBar scrollY={scrollY} heroHeight={heroHeight} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flexGrow: 1 },
  glow: { position: 'absolute', left: 0, top: 0 },
  overscroll: { position: 'absolute', left: 0, right: 0, top: -OVERSCROLL, height: OVERSCROLL },
  // La fila de 1 de alto, estirada desde su centro hasta llenar el hueco
  overscrollRow: {
    position: 'absolute', left: 0, top: (OVERSCROLL - 1) / 2,
    transform: [{ scaleY: OVERSCROLL }],
  },
  sheet: {
    flexGrow: 1, marginTop: -SHEET_OVERLAP, paddingTop: 22,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
  },
  // Tapa justo lo que la hoja sube sobre la cabecera
  cap: {
    height: SHEET_OVERLAP, marginTop: -SHEET_OVERLAP,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
  },
  statusBar: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
});
