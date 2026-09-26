import React, { useEffect, useRef, useState } from 'react';
import {
  View, StyleSheet, Modal, TouchableOpacity, Animated, Easing, useWindowDimensions,
  Platform, StatusBar,
} from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { HeroGlow } from '../layout/HeroScreen';

// Mismo margen lateral que el contenido de Inicio
const CARD_MARGIN = 16;

export interface SummaryOrigin {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Props {
  visible: boolean;
  /** Dónde está el botón pulsado: la tarjeta crece desde ahí y vuelve a él */
  origin: SummaryOrigin | null;
  onDismiss: () => void;
  title: string;
  /** Contenido de la cabecera de color, debajo del título */
  hero: (close: (after?: () => void) => void) => React.ReactNode;
  /** Contenido de la hoja blanca */
  children: (close: (after?: () => void) => void) => React.ReactNode;
}

/**
 * Tarjeta flotante de Inicio ("Hoy" y los ingresos o gastos del mes): arriba,
 * la cabecera de color con su brillo, como la de Inicio en pequeño; debajo,
 * una hoja blanca con la lista. Crece desde el botón pulsado y vuelve a él.
 */
const FloatingSummaryCard = ({ visible, origin, onDismiss, title, hero, children }: Props) => {
  const { t } = useTranslation();
  const { ui } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();

  const progress = useRef(new Animated.Value(0)).current;
  const closingRef = useRef(false);
  const [heroSize, setHeroSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!visible) return;
    closingRef.current = false;
    progress.setValue(0);
    Animated.spring(progress, {
      toValue: 1, damping: 22, stiffness: 220, mass: 0.9, useNativeDriver: true,
    }).start();
  }, [visible, progress]);

  const close = (after?: () => void) => {
    if (closingRef.current) return;
    closingRef.current = true;
    Animated.timing(progress, {
      toValue: 0, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true,
    }).start(() => {
      onDismiss();
      after?.();
    });
  };

  // ── Geometría: rectángulo flotante centrado ─────────────────────────────
  const cardW = winW - CARD_MARGIN * 2;
  const availableH = winH - insets.top - insets.bottom - CARD_MARGIN * 4;
  const cardH = Math.min(availableH, winH * (winH < 700 ? 0.82 : 0.72), 640);
  const cardTop = insets.top + (winH - insets.top - insets.bottom - cardH) / 2;

  // Android: measureInWindow devuelve Y descontando la barra de estado, pero el Modal
  // (statusBarTranslucent) empieza en el borde superior de la pantalla. En iOS coinciden.
  const androidStatusBarOffset = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0;
  const from = origin
    ? { ...origin, y: origin.y + androidStatusBarOffset }
    : { x: winW / 2 - 20, y: cardTop + cardH / 2 - 12, width: 40, height: 24 };
  const dx = from.x + from.width / 2 - winW / 2;
  const dy = from.y + from.height / 2 - (cardTop + cardH / 2);

  const cardTransform = [
    { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [dx, 0] }) },
    { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [dy, 0] }) },
    { scaleX: progress.interpolate({ inputRange: [0, 1], outputRange: [from.width / cardW, 1] }) },
    { scaleY: progress.interpolate({ inputRange: [0, 1], outputRange: [from.height / cardH, 1] }) },
  ];
  const cardOpacity = progress.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' });
  const contentOpacity = progress.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 0, 1], extrapolate: 'clamp' });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => close()}
    >
      <Animated.View style={[styles.backdrop, { opacity: progress }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => close()} />
      </Animated.View>

      {/* Capa exterior: posición, animación y sombra (sin overflow para que iOS pinte la sombra) */}
      <Animated.View
        style={[styles.shadow, {
          left: CARD_MARGIN, top: cardTop, width: cardW, height: cardH,
          backgroundColor: ui.hero, opacity: cardOpacity, transform: cardTransform,
        }]}
      >
        <View style={[styles.card, { backgroundColor: ui.sheet }]}>
          <View
            style={styles.hero}
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout;
              if (width !== heroSize.width || height !== heroSize.height) setHeroSize({ width, height });
            }}
          >
            <HeroGlow width={heroSize.width} height={heroSize.height} />
            <Animated.View style={{ opacity: contentOpacity }}>
              <View style={styles.titleRow}>
                <Text style={[styles.title, { color: ui.onHeroSoft }]} numberOfLines={1}>{title}</Text>
                <TouchableOpacity
                  style={[styles.close, { backgroundColor: 'rgba(255,255,255,0.18)' }]}
                  onPress={() => close()}
                  hitSlop={10}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.close')}
                >
                  <Ionicons name="close" size={18} color={ui.onHero} />
                </TouchableOpacity>
              </View>
              {hero(close)}
            </Animated.View>
          </View>

          <Animated.View style={[styles.body, { backgroundColor: ui.sheet, opacity: contentOpacity }]}>
            {children(close)}
          </Animated.View>
        </View>
      </Animated.View>
    </Modal>
  );
};

/** Flechas y título para moverse entre días o meses dentro de la cabecera */
export const SummaryNav = ({
  title, subtitle, onPrev, onNext, canNext,
}: {
  title: string;
  subtitle: string;
  onPrev: () => void;
  onNext: () => void;
  canNext: boolean;
}) => {
  const { t } = useTranslation();
  const { ui } = useTheme();
  const btn = (icon: 'chevron-back' | 'chevron-forward', onPress: () => void, disabled: boolean, label: string) => (
    <TouchableOpacity
      style={[styles.navBtn, { backgroundColor: 'rgba(255,255,255,0.14)' }, disabled && styles.navDisabled]}
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={18} color={ui.onHero} />
    </TouchableOpacity>
  );
  return (
    <View style={styles.nav}>
      {btn('chevron-back', onPrev, false, t('common.previous'))}
      <View style={styles.navCenter}>
        <Text style={[styles.navTitle, { color: ui.onHero }]} numberOfLines={1}>{title}</Text>
        <Text style={[styles.navSubtitle, { color: ui.onHeroSoft }]} numberOfLines={1}>{subtitle}</Text>
      </View>
      {btn('chevron-forward', onNext, !canNext, t('common.next'))}
    </View>
  );
};

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  shadow: {
    position: 'absolute', borderRadius: 28,
    elevation: 12, shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.32, shadowRadius: 20,
  },
  card: { flex: 1, borderRadius: 28, overflow: 'hidden' },
  hero: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 40 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  title: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', flexShrink: 1 },
  close: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  body: {
    flex: 1, marginTop: -22, borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden',
  },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  navBtn: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  navDisabled: { opacity: 0.3 },
  navCenter: { flex: 1, alignItems: 'center', marginHorizontal: 8 },
  navTitle: { fontSize: 18, fontFamily: 'Poppins_700Bold' },
  navSubtitle: { fontSize: 12.5, fontFamily: 'Poppins_400Regular' },
});

export default FloatingSummaryCard;
