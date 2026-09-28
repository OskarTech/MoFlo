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
import { useWalkthroughTarget } from '../walkthrough/useWalkthroughTarget';

export const TAB_BAR_HEIGHT = 62;

// Margen de la barra con los lados de la pantalla
const SIDE = 14;

// Distancia del centro del botón + al borde derecho (para señalarlo, ver AddHint)
export const FAB_CENTER_FROM_RIGHT = SIDE + TAB_BAR_HEIGHT / 2;

const IS_IOS = Platform.OS === 'ios';

// El difuminado es nativo (expo-blur): una build anterior a él no lo trae y,
// en su lugar, dibujaba un recuadro rojo de error. Sin él, la cápsula se queda
// con el cristal sin difuminar
const HAS_BLUR = requireOptionalNativeModule('ExpoBlurView') != null;

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
            // En Android el cristal no se difumina bien (se veía el contenido de
            // detrás y los colores quedaban sucios): allí la cápsula es sólida
            !IS_IOS && [styles.capsuleSolid, { backgroundColor: ui.sheetRaised }],
          ]}
        >
          {/* iOS: cristal translúcido difuminado, en todas las versiones (sin Liquid Glass) */}
          {IS_IOS && HAS_BLUR && (
            <BlurView intensity={60} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          )}
          {IS_IOS && <View style={[StyleSheet.absoluteFill, { backgroundColor: ui.glass }]} />}
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
