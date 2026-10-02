import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Animated, ActivityIndicator, BackHandler, Platform, useWindowDimensions } from 'react-native';
import { Text } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/useTheme';
import { setNavigationBarStyle } from '../../hooks/useAndroidSystemBars';
import { getDynamicColors } from '../../theme';
import { getUiColors } from '../../theme/ui';
import { HeroGlow } from '../layout/HeroScreen';
import Avatar from './Avatar';
import {
  useAccountSwitchStore, markCovered, clearSwitchSession, SwitchSession,
} from '../../store/accountSwitch';

const FADE_IN_MS = 180;
const FADE_OUT_MS = 260;

// Sin la paleta de la cuenta en el móvil: un fondo neutro y fijo, que no
// cambia mientras por debajo cambian los colores de la app
const NEUTRAL = {
  light: { bg: '#F6F6F4', text: '#1B1C1F', soft: '#6B6A66', fill: 'rgba(27,28,31,0.08)' },
  dark: { bg: '#111215', text: '#F5F3EE', soft: '#A3A09A', fill: 'rgba(245,243,238,0.1)' },
};

/**
 * Pantalla de carga al cambiar de cuenta (ver store/accountSwitch): tapa toda
 * la app con la cuenta a la que se va mientras por debajo se cambia y se carga.
 */
const AccountSwitchOverlay = () => {
  const session = useAccountSwitchStore((s) => s.session);
  if (!session) return null;
  // Una por cambio: cada una empieza con su propia opacidad
  return <Cover key={session.id} session={session} />;
};

const Cover = ({ session }: { session: SwitchSession }) => {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const { width, height } = useWindowDimensions();
  const { id, look, instant, leaving } = session;
  const opacity = useRef(new Animated.Value(instant ? 1 : 0)).current;

  useEffect(() => {
    if (instant) {
      markCovered();
      return;
    }
    Animated.timing(opacity, { toValue: 1, duration: FADE_IN_MS, useNativeDriver: true })
      .start(() => markCovered());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al aparecer
  }, []);

  useEffect(() => {
    if (!leaving) return;
    Animated.timing(opacity, { toValue: 0, duration: FADE_OUT_MS, useNativeDriver: true })
      .start(() => clearSwitchSession(id));
  }, [leaving, opacity, id]);

  // El botón atrás de Android no hace nada mientras se cambia
  useEffect(() => {
    if (leaving) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [leaving]);

  // Los de la cuenta a la que se va, no los de la app, que cambian por debajo
  const palette = useMemo(
    () => (look.paletteId ? getUiColors(getDynamicColors(isDark, look.paletteId), isDark) : null),
    [look.paletteId, isDark],
  );
  const neutral = NEUTRAL[isDark ? 'dark' : 'light'];
  const text = palette ? palette.onHero : neutral.text;
  const soft = palette ? palette.onHeroSoft : neutral.soft;
  const message = t('accountSwitch.switching');

  // Android: con la app en modo claro, la barra de navegación del sistema
  // lleva un velo blanco y quedaba una franja blanca abajo. Mientras tapa, el
  // velo va a juego con la pantalla de carga, como la barra de estado; al
  // desvanecerse, vuelve el de la app
  const coverIsDark = !!palette || isDark;
  useEffect(() => {
    if (Platform.OS !== 'android' || leaving) return;
    setNavigationBarStyle(coverIsDark ? 'dark' : 'light');
    return () => setNavigationBarStyle(isDark ? 'dark' : 'light');
  }, [leaving, coverIsDark, isDark]);

  return (
    <Animated.View
      style={[styles.cover, { backgroundColor: palette ? palette.hero : neutral.bg, opacity }]}
      // Mientras tapa, ningún toque llega a la app; al desvanecerse ya sí
      pointerEvents={leaving ? 'none' : 'auto'}
      onStartShouldSetResponder={() => true}
      accessibilityViewIsModal
      accessible
      accessibilityLabel={`${look.name}. ${message}`}
    >
      {palette ? <HeroGlow width={width} height={height} colors={palette} /> : null}
      {!leaving ? <StatusBar style={palette || isDark ? 'light' : 'dark'} /> : null}
      <Avatar uri={look.photoURL} style={[styles.avatar, { backgroundColor: palette ? palette.heroFill : neutral.fill }]}>
        <Text style={[styles.initial, { color: text }]}>{look.initial}</Text>
      </Avatar>
      <Text style={[styles.name, { color: text }]} numberOfLines={2}>{look.name}</Text>
      <Text style={[styles.message, { color: soft }]}>{message}</Text>
      <ActivityIndicator style={styles.spinner} color={text} />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  cover: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  avatar: {
    width: 76, height: 76, borderRadius: 38,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 18,
  },
  initial: { fontSize: 30, fontFamily: 'Poppins_700Bold' },
  name: { fontSize: 22, fontFamily: 'Poppins_700Bold', letterSpacing: -0.3, textAlign: 'center' },
  message: { fontSize: 14, fontFamily: 'Poppins_400Regular', marginTop: 4, textAlign: 'center' },
  spinner: { marginTop: 24 },
});

export default AccountSwitchOverlay;
