import React, { useId, useMemo, useRef, useState } from 'react';
import {
  View, StyleSheet, Animated, Platform, StatusBar, RefreshControl,
  ScrollViewProps, StyleProp, ViewStyle, LayoutChangeEvent,
} from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
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
    </Svg>
  );
};

/**
 * Parte de color de arriba. Deja hueco para la barra de estado y, por
 * debajo, lo que tapa la hoja. Encima lleva un bloque del mismo color para
 * que al tirar hacia abajo (rebote de iOS) no se vea un hueco blanco.
 */
export const HeroTop = ({
  children, extraBottom = 0, style,
}: { children: React.ReactNode; extraBottom?: number; style?: StyleProp<ViewStyle> }) => {
  const { ui } = useTheme();
  const topInset = useTopInset();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.width || height !== size.height) setSize({ width, height });
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
 * cabecera llega hasta arriba del todo, con su brillo; al desplazar, la
 * franja se rellena del color de la cabecera para que el contenido no quede
 * debajo de la hora y la batería.
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

export const HeroStatusBar = ({ scrollY }: { scrollY: Animated.Value }) => {
  const { ui } = useTheme();
  const topInset = useTopInset();
  const opacity = scrollY.interpolate({ inputRange: [0, 18], outputRange: [0, 1], extrapolate: 'clamp' });
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.statusBar, { height: topInset, backgroundColor: ui.hero, opacity }]}
    />
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
        <HeroTop extraBottom={heroExtraBottom}>{hero}</HeroTop>
        <HeroSheet style={sheetStyle}>{children}</HeroSheet>
      </Animated.ScrollView>
      <HeroStatusBar scrollY={scrollY} />
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
