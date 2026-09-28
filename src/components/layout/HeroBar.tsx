import React from 'react';
import { View, StyleSheet, TouchableOpacity, StyleProp, ViewStyle } from 'react-native';
import { Text } from 'react-native-paper';
import Icon, { IconName } from '../common/Icon';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';

// Botón redondo translúcido sobre la cabecera de color
export const HeroIconButton = ({
  icon, onPress, accessibilityLabel, size = 38,
}: {
  icon: IconName;
  onPress?: () => void;
  accessibilityLabel?: string;
  size?: number;
}) => {
  const { ui } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.iconButton, { width: size, height: size, borderRadius: size / 2, backgroundColor: ui.heroFill }]}
      onPress={onPress}
      activeOpacity={0.7}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Icon name={icon} size={size * 0.5} color={ui.onHero} />
    </TouchableOpacity>
  );
};

// Tuerca de Ajustes: siempre la última de la barra, arriba a la derecha
export const HeroSettingsButton = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  return (
    <HeroIconButton
      icon="settings-outline"
      onPress={() => navigation.navigate('Settings', { screen: 'SettingsMain' })}
      accessibilityLabel={t('header.settings_screen')}
    />
  );
};

/**
 * Barra de arriba de las pantallas: el nombre a la izquierda (con flecha para
 * volver si hace falta) y, a la derecha, el control propio de la pantalla y,
 * con `settings`, la tuerca de Ajustes en el mismo sitio que en Inicio.
 */
export const HeroTitleBar = ({
  title, onBack, right, settings, style,
}: {
  title: string;
  onBack?: () => void;
  right?: React.ReactNode;
  settings?: boolean;
  style?: StyleProp<ViewStyle>;
}) => {
  const { t } = useTranslation();
  const { ui } = useTheme();
  return (
    <View style={[styles.bar, style]}>
      {onBack && (
        <HeroIconButton icon="arrow-back" onPress={onBack} size={36} accessibilityLabel={t('common.back')} />
      )}
      {/* En móviles estrechos, los títulos largos se encogen un poco antes de cortarse */}
      <Text
        style={[styles.title, { color: ui.onHero }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {title}
      </Text>
      {right || settings ? (
        <View style={styles.right}>
          {right}
          {settings && <HeroSettingsButton />}
        </View>
      ) : null}
    </View>
  );
};

// Pastilla translúcida con texto, para la derecha de la barra (p. ej. "2 activas")
export const HeroChip = ({ label }: { label: string }) => {
  const { ui } = useTheme();
  return (
    <View style={[styles.chip, { backgroundColor: ui.heroFill }]}>
      <Text style={[styles.chipText, { color: ui.onHero }]} numberOfLines={1}>{label}</Text>
    </View>
  );
};

// Selector de mes: ‹ Septiembre ›
export const MonthSelector = ({
  label, onPrev, onNext, canPrev = true, canNext = true,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  canPrev?: boolean;
  canNext?: boolean;
}) => {
  const { t } = useTranslation();
  const { ui } = useTheme();
  return (
    <View style={[styles.month, { backgroundColor: ui.heroFill }]}>
      <TouchableOpacity
        style={[styles.monthArrow, !canPrev && styles.disabled]}
        onPress={onPrev}
        disabled={!canPrev}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t('common.previousMonth')}
      >
        <Icon name="chevron-back" size={16} color={ui.onHero} />
      </TouchableOpacity>
      <Text style={[styles.monthText, { color: ui.onHero }]} numberOfLines={1}>{label}</Text>
      <TouchableOpacity
        style={[styles.monthArrow, !canNext && styles.disabled]}
        onPress={onNext}
        disabled={!canNext}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t('common.nextMonth')}
      >
        <Icon name="chevron-forward" size={16} color={ui.onHero} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingLeft: 18, paddingRight: 16, paddingTop: 8, minHeight: 54,
  },
  iconButton: { justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 26, fontFamily: 'Poppins_700Bold', letterSpacing: -0.6, flexShrink: 1 },
  right: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 12.5, fontFamily: 'Poppins_600SemiBold' },
  month: { flexDirection: 'row', alignItems: 'center', borderRadius: 999, padding: 4 },
  monthArrow: { width: 26, height: 26, justifyContent: 'center', alignItems: 'center' },
  monthText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', marginHorizontal: 2 },
  disabled: { opacity: 0.35 },
});
