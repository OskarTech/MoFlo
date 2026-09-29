import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Keyboard, Platform } from 'react-native';
import { Text } from 'react-native-paper';
import Icon, { IconName } from '../common/Icon';
import { BlurView } from 'expo-blur';
import { requireOptionalNativeModule } from 'expo';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CommonActions } from '@react-navigation/native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useTheme } from '../../hooks/useTheme';
import { withAlpha } from '../../utils/color';
import { useWalkthroughTarget } from '../walkthrough/useWalkthroughTarget';

export const TAB_BAR_HEIGHT = 62;

// Margen de la barra con los lados de la pantalla
const SIDE = 14;

// Distancia del centro del botón + al borde derecho (para señalarlo, ver AddHint)
export const FAB_CENTER_FROM_RIGHT = SIDE + TAB_BAR_HEIGHT / 2;

const IS_IOS = Platform.OS === 'ios';

// El difuminado es nativo (expo-blur): una build anterior a él no lo trae y,
// en su lugar, dibujaba un recuadro rojo de error. Sin él, la cápsula es
// sólida: translúcida sin difuminar se veía el contenido de detrás y los
// colores quedaban sucios (lo que pasó en Android con una build de antes)
const HAS_BLUR = requireOptionalNativeModule('ExpoBlurView') != null;

// Android: expo-blur divide la intensidad entre este número para el radio del
// difuminado (por defecto 4: con 60 quedaban 15 px y se leía lo de detrás, con
// los colores de las filas colándose en la cápsula). Más bajo, más difuminado.
// En Android 11 o anterior difumina RenderScript, que no admite un radio mayor
// de 25: con 48 la app se cerraba al dibujar la barra (versión 2.0.0). Ahí se
// queda en 24
const ANDROID_BLUR_REDUCTION = Platform.OS === 'android' && Platform.Version < 31 ? 2.5 : 1.25;
// Android: capa del color de la tarjeta sobre el difuminado, como la de iOS
const ANDROID_GLASS = { dark: 0.55, light: 0.45 };

// Separación de la cápsula con el borde de abajo. En iOS se apoya justo encima
// de la barra de inicio. En Android va entera por encima de la zona de gestos (o
// de los botones del sistema): pegada a ella, la barra de gestos la cortaba.
export const useTabBarOffset = () => {
  const insets = useSafeAreaInsets();
  return IS_IOS ? Math.max(12, insets.bottom - 6) : Math.max(12, insets.bottom + 10);
};

// Lo que debe dejar libre abajo una pantalla para que la barra no tape su final
export const useTabBarSpace = () => TAB_BAR_HEIGHT + useTabBarOffset() + 24;

const TABS: Record<string, { label: string; icon: IconName; iconOn: IconName; target?: string }> = {
  HomeTab: { label: 'tabs.home', icon: 'home-outline', iconOn: 'home' },
  HistorialTab: { label: 'tabs.historial', icon: 'clock-counter-clockwise-duotone', iconOn: 'clock-counter-clockwise-fill', target: 'recurring' },
  AnnualTab: { label: 'tabs.annual', icon: 'bar-chart-outline', iconOn: 'bar-chart', target: 'annual_tab' },
  HuchaTab: { label: 'tabs.hucha', icon: 'piggy-bank-duotone', iconOn: 'piggy-bank-fill', target: 'hucha_tab' },
};

const TabButton = ({
  routeName, focused, onPress,
}: { routeName: string; focused: boolean; onPress: () => void }) => {
  const { t } = useTranslation();
  const { colors: dc, ui } = useTheme();
  const tab = TABS[routeName];
  const targetRef = useWalkthroughTarget(tab.target ?? `tab_${routeName}`);
  const color = focused ? ui.accent : dc.textPrimary;
  return (
    <View ref={targetRef} collapsable={false} style={styles.tabWrap}>
      <TouchableOpacity
        style={[styles.tab, focused && { backgroundColor: ui.accentSoft }]}
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={t(tab.label)}
      >
        <Icon name={focused ? tab.iconOn : tab.icon} size={22} color={color} />
        <Text style={[styles.label, { color }]} numberOfLines={1}>{t(tab.label)}</Text>
      </TouchableOpacity>
    </View>
  );
};

/**
 * Barra de abajo: una cápsula flotante de cristal con las cuatro pestañas y,
 * aparte, el botón + (su acción depende de la pantalla, ver AppNavigator).
 * Las pestañas ocultas (Ajustes, Recordatorios) no salen y, mientras se está
 * en ellas, ninguna aparece marcada. Con el teclado abierto se esconde.
 */
const GlassTabBar = ({
  state, navigation, onFabPress,
}: BottomTabBarProps & { onFabPress: () => void }) => {
  const { t } = useTranslation();
  const { colors: dc, ui, isDark } = useTheme();
  const bottom = useTabBarOffset();
  const fabRef = useWalkthroughTarget('home_fab');
  const [keyboardShown, setKeyboardShown] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setKeyboardShown(true));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardShown(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  if (keyboardShown) return null;

  const focusedKey = state.routes[state.index]?.key;

  const handlePress = (routeKey: string, routeName: string) => {
    const isFocused = focusedKey === routeKey;
    const event = navigation.emit({ type: 'tabPress', target: routeKey, canPreventDefault: true });
    if (!isFocused && !event.defaultPrevented) {
      navigation.dispatch({ ...CommonActions.navigate({ name: routeName, merge: true }), target: state.key });
    }
  };

  return (
    <View pointerEvents="box-none" style={[styles.root, { bottom }]}>
      <View style={styles.capsuleShadow}>
        <View
          style={[
            styles.capsule,
            { borderColor: ui.glassEdge },
            !HAS_BLUR && [styles.capsuleSolid, { backgroundColor: ui.sheetRaised }],
          ]}
        >
          {/* Cristal translúcido difuminado, en iOS y en Android. En Android el
              difuminado de expo-blur es experimental (dimezisBlurView) y pone
              encima su propio velo, blanco o gris según el tinte; con más
              difuminado y la capa del color de la tarjeta, como en iOS, lo de
              detrás ya no ensucia los colores. Sin sombra (elevation): en
              Android se ve a través del cristal y lo ensucia */}
          {HAS_BLUR && (
            <BlurView
              intensity={60}
              tint={isDark ? 'dark' : 'light'}
              experimentalBlurMethod="dimezisBlurView"
              {...(!IS_IOS && { blurReductionFactor: ANDROID_BLUR_REDUCTION })}
              style={StyleSheet.absoluteFill}
            />
          )}
          {HAS_BLUR && IS_IOS && <View style={[StyleSheet.absoluteFill, { backgroundColor: ui.glass }]} />}
          {HAS_BLUR && !IS_IOS && (
            <View
              style={[StyleSheet.absoluteFill, {
                backgroundColor: withAlpha(ui.sheetRaised, isDark ? ANDROID_GLASS.dark : ANDROID_GLASS.light),
              }]}
            />
          )}
          {state.routes.filter((r) => TABS[r.name]).map((route) => (
            <TabButton
              key={route.key}
              routeName={route.name}
              focused={route.key === focusedKey}
              onPress={() => handlePress(route.key, route.name)}
            />
          ))}
        </View>
      </View>
      <View ref={fabRef} collapsable={false}>
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: dc.primary, shadowColor: dc.primary }]}
          onPress={onFabPress}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t('common.add')}
        >
          <Icon name="add" size={28} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    position: 'absolute', left: SIDE, right: SIDE,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  capsuleShadow: {
    flex: 1, borderRadius: TAB_BAR_HEIGHT / 2,
    shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 15, shadowOffset: { width: 0, height: 10 },
  },
  capsule: {
    height: TAB_BAR_HEIGHT, borderRadius: TAB_BAR_HEIGHT / 2, overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 5,
  },
  capsuleSolid: { elevation: 6 },
  tabWrap: { flex: 1 },
  tab: {
    height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', gap: 1,
  },
  label: { fontSize: 10, fontFamily: 'Poppins_600SemiBold' },
  fab: {
    width: TAB_BAR_HEIGHT, height: TAB_BAR_HEIGHT, borderRadius: TAB_BAR_HEIGHT / 2,
    justifyContent: 'center', alignItems: 'center',
    elevation: 8, shadowOpacity: 0.38, shadowRadius: 12, shadowOffset: { width: 0, height: 8 },
  },
});

export default GlassTabBar;
