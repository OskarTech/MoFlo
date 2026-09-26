import React, { useId, useMemo, useRef, useState } from 'react';
import {
  View, StyleSheet, Animated, Platform, StatusBar, RefreshControl, useWindowDimensions,
  ScrollViewProps, StyleProp, ViewStyle, LayoutChangeEvent,
} from 'react-native';
import Svg, { Defs, G, LinearGradient, Mask, RadialGradient, Rect, Stop } from 'react-native-svg';
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

// Lo que baja el difuminado de la franja de la barra de estado
const STATUS_FADE = 24;

/**
 * Fondo de la cabecera: el color de la tarjeta de balance con un brillo de
 * primaryLight arriba a la derecha y otro blanco muy suave abajo a la
 * izquierda. Se dibuja con react-native-svg, que ya estaba en la app.
 */
export const HeroGlow = ({ width, height }: { width: number; height: number }) => {
  const { ui } = useTheme();
  const id = useId().replace(/:/g, '');
  if (!width || !height) {
    return <View style={[StyleSheet.absoluteFill, { backgroundColor: ui.hero }]} />;
  }
  return (
    <Svg style={StyleSheet.absoluteFill} width={width} height={height} pointerEvents="none">
      <HeroGlowLayers id={id} width={width} height={height} />
    </Svg>
  );
};

// Las capas del fondo, para dibujarlas dentro de un Svg: en la cabecera y, las
// mismas, en la franja de la barra de estado
const HeroGlowLayers = ({ id, width, height }: { id: string; width: number; height: number }) => {
  const { ui } = useTheme();
  return (
    <>
      <Defs>
        <RadialGradient
          id={`${id}a`} gradientUnits="userSpaceOnUse"
          cx={width} cy={0} rx={width * 1.3} ry={height * 0.85} fx={width} fy={0}
        >
          <Stop offset="0" stopColor={ui.heroGlow} stopOpacity={ui.heroGlowOpacity} />
          <Stop offset="0.58" stopColor={ui.heroGlow} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient
          id={`${id}b`} gradientUnits="userSpaceOnUse"
          cx={0} cy={height} rx={width * 0.9} ry={height * 0.7} fx={0} fy={height}
        >
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.09} />
          <Stop offset="0.6" stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill={ui.hero} />
      <Rect x={0} y={0} width={width} height={height} fill={`url(#${id}a)`} />
      <Rect x={0} y={0} width={width} height={height} fill={`url(#${id}b)`} />
    </>
  );
};

/**
 * Parte de color de arriba. Deja hueco para la barra de estado y, por
 * debajo, lo que tapa la hoja. Encima lleva un bloque del mismo color para
 * que al tirar hacia abajo (rebote de iOS) no se vea un hueco blanco.
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
  const { ui } = useTheme();
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
      <View style={[styles.overscroll, { backgroundColor: ui.hero }]} />
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
 * La franja lleva el mismo fondo que la cabecera, con su brillo (heroHeight es
 * el alto de la cabecera, para que el brillo coincida), así que al empezar a
 * desplazar no se nota dónde empieza. Mientras por debajo pasa la cabecera, se
 * difumina por abajo: lo que sube se desvanece en vez de cortarse en seco.
 * Cuando llega la hoja, el difuminado se va y la franja queda sólida, con el
 * borde limpio sobre el contenido.
 */
export const HeroStatusBar = ({ scrollY, heroHeight = 0 }: { scrollY: Animated.Value; heroHeight?: number }) => {
  const { ui } = useTheme();
  const topInset = useTopInset();
  const { width } = useWindowDimensions();
  const id = useId().replace(/:/g, '');
  const opacity = scrollY.interpolate({ inputRange: [0, 18], outputRange: [0, 1], extrapolate: 'clamp' });
  // El difuminado se apaga mientras el borde de arriba de la hoja lo cruza
  const fadeOutStart = Math.max(19, heroHeight - SHEET_OVERLAP - topInset - STATUS_FADE);
  const fadeOpacity = scrollY.interpolate({
    inputRange: [0, 18, fadeOutStart, fadeOutStart + STATUS_FADE],
    outputRange: [0, 1, 1, 0],
    extrapolate: 'clamp',
  });
  const fadeTop = topInset;
  const fadeBottom = topInset + STATUS_FADE;
  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.statusBar, { height: topInset, opacity }]}>
        <Svg width={width} height={topInset}>
          {heroHeight > 0
            ? <HeroGlowLayers id={`${id}s`} width={width} height={heroHeight} />
            : <Rect x={0} y={0} width={width} height={topInset} fill={ui.hero} />}
        </Svg>
      </Animated.View>
      {heroHeight > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[styles.statusBar, { top: fadeTop, height: STATUS_FADE, opacity: fadeOpacity }]}
        >
          {/* viewBox: se dibuja con las coordenadas de la cabecera, justo bajo la barra de estado */}
          <Svg width={width} height={STATUS_FADE} viewBox={`0 ${fadeTop} ${width} ${STATUS_FADE}`}>
            <Defs>
              <LinearGradient id={`${id}f`} gradientUnits="userSpaceOnUse" x1={0} y1={fadeTop} x2={0} y2={fadeBottom}>
                <Stop offset={0} stopColor="#FFFFFF" stopOpacity={1} />
                <Stop offset={1} stopColor="#FFFFFF" stopOpacity={0} />
              </LinearGradient>
              <Mask id={`${id}m`} maskUnits="userSpaceOnUse" x={0} y={fadeTop} width={width} height={STATUS_FADE}>
                <Rect x={0} y={fadeTop} width={width} height={STATUS_FADE} fill={`url(#${id}f)`} />
              </Mask>
            </Defs>
            <G mask={`url(#${id}m)`}>
              <HeroGlowLayers id={`${id}d`} width={width} height={heroHeight} />
            </G>
          </Svg>
        </Animated.View>
      )}
    </>
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
  overscroll: { position: 'absolute', left: 0, right: 0, top: -800, height: 800 },
  sheet: {
    flexGrow: 1, marginTop: -SHEET_OVERLAP, paddingTop: 22,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
  },
  // Tapa justo lo que la hoja sube sobre la cabecera
  cap: {
    height: SHEET_OVERLAP, marginTop: -SHEET_OVERLAP,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
  },
  statusBar: { position: 'absolute', top: 0, left: 0, right: 0 },
});
