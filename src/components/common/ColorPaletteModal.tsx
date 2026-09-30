import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import Icon from './Icon';
import { useTheme } from '../../hooks/useTheme';
import { getDynamicColors, ColorPaletteId } from '../../theme';
import { CATEGORY_COLORS } from '../../theme/categoryColors';
import { formatAmount } from '../../utils/formatAmount';
import BottomSheet from './BottomSheet';

export const PALETTE_ORDER: ColorPaletteId[] = [
  'green', 'earth', 'rose', 'mono', 'navy', 'wine', 'lime',
  'teal', 'cocoa', 'sunset', 'aurora', 'charcoal',
];

interface Props {
  visible: boolean;
  selectedPalette: ColorPaletteId;
  onSelect: (id: ColorPaletteId) => void;
  onDismiss: () => void;
  /** Símbolo de la moneda de la cuenta, para el importe de muestra */
  currencySymbol?: string;
}

/**
 * Color de la app: cada paleta con su cabecera y cuatro de sus colores de
 * categoría, en el modo (claro u oscuro) que se está usando.
 */
const ColorPaletteModal = ({ visible, selectedPalette, onSelect, onDismiss, currencySymbol = '€' }: Props) => {
  const { t } = useTranslation();
  const { isDark, ui } = useTheme();
  const sample = `${formatAmount(839.82)} ${currencySymbol}`;

  return (
    <BottomSheet
      visible={visible}
      onClose={onDismiss}
      title={t('settings.colorPalette')}
      subtitle={t('settings.paletteHint')}
      bodyStyle={styles.body}
    >
      <View style={styles.grid}>
        {PALETTE_ORDER.map((id) => {
          const c = getDynamicColors(isDark, id);
          const dots = CATEGORY_COLORS[id][isDark ? 'dark' : 'light'].expense.slice(0, 4);
          const on = selectedPalette === id;
          const label = t(`settings.palette${id.charAt(0).toUpperCase() + id.slice(1)}`);
          return (
            <TouchableOpacity
              key={id}
              style={[styles.card, { backgroundColor: c.surface, borderColor: on ? ui.accent : ui.hair }]}
              onPress={() => { onSelect(id); onDismiss(); }}
              activeOpacity={0.8}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={label}
            >
              <View style={[styles.hero, { backgroundColor: c.balanceCard }]}>
                <Text style={styles.heroLabel}>{t('resumen.balance')}</Text>
                <Text style={styles.heroAmount} numberOfLines={1}>{sample}</Text>
              </View>
              <View style={[styles.foot, { backgroundColor: c.surface }]}>
                <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={1}>{label}</Text>
                <View style={styles.dots}>
                  {dots.map((d, i) => <View key={i} style={[styles.dot, { backgroundColor: d }]} />)}
                </View>
              </View>
              {on && (
                <View style={styles.check}>
                  <Icon name="checkmark" size={14} color="#111111" />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  body: { paddingBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  card: { width: '48.5%', borderRadius: 18, overflow: 'hidden', borderWidth: 2.5 },
  hero: { height: 56, paddingVertical: 8, paddingHorizontal: 11 },
  heroLabel: { fontSize: 10, fontFamily: 'Poppins_400Regular', color: 'rgba(255,255,255,0.8)' },
  heroAmount: { fontSize: 17, fontFamily: 'Poppins_700Bold', color: '#FFFFFF', letterSpacing: -0.4 },
  foot: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6,
    paddingHorizontal: 11, paddingTop: 8, paddingBottom: 9,
  },
  name: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', flexShrink: 1 },
  dots: { flexDirection: 'row', gap: 3 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  check: {
    position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center',
  },
});

export default ColorPaletteModal;
