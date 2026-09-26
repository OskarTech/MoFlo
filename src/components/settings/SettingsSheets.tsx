import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as Font from 'expo-font';
import { useTheme } from '../../hooks/useTheme';
import BottomSheet from '../common/BottomSheet';
import { getDynamicColors, ColorPaletteId } from '../../theme';
import { ThemeMode } from '../../store/settingsStore';
import {
  FONT_OPTIONS, AppFontId, getActiveFont, getPreviewFontFamily, getPreviewFontMap,
} from '../../theme/fonts';
import { withAlpha } from '../../utils/color';
import { formatAmount } from '../../utils/formatAmount';

/** Marca redonda de la opción elegida */
const Check = ({ on }: { on: boolean }) => {
  const { ui } = useTheme();
  return (
    <View style={[styles.check, on ? { backgroundColor: ui.accent } : { borderColor: ui.hair2, borderWidth: 1.5 }]}>
      {on && <Ionicons name="checkmark" size={15} color={ui.onAccent} />}
    </View>
  );
};

export interface SheetOption {
  code: string;
  label: string;
  /** Debajo del nombre, más pequeño (p. ej. el código de la moneda) */
  detail?: string;
  /** Cuadrado a la izquierda (p. ej. el símbolo de la moneda) */
  badge?: string;
}

/** Lista de opciones en filas, la elegida marcada. Moneda, idioma y formato de fecha. */
export const OptionSheet = ({
  visible, title, subtitle, options, selected, onSelect, onDismiss,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  options: SheetOption[];
  selected: string;
  onSelect: (code: string) => void;
  onDismiss: () => void;
}) => {
  const { colors: dc, ui } = useTheme();
  return (
    <BottomSheet visible={visible} onClose={onDismiss} title={title} subtitle={subtitle} bodyStyle={styles.sheetBody}>
      {options.map((o) => {
        const on = o.code === selected;
        return (
          <TouchableOpacity
            key={o.code}
            style={[styles.option, on && { backgroundColor: ui.accentSoft }]}
            onPress={() => { onSelect(o.code); onDismiss(); }}
            activeOpacity={0.7}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
          >
            {o.badge ? (
              <View style={[styles.badge, { backgroundColor: on ? ui.sheet : ui.field }]}>
                <Text style={[styles.badgeText, { color: dc.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
                  {o.badge}
                </Text>
              </View>
            ) : null}
            <View style={styles.optionText}>
              <Text style={[styles.optionLabel, { color: dc.textPrimary }]}>{o.label}</Text>
              {o.detail ? <Text style={[styles.optionDetail, { color: dc.textSecondary }]}>{o.detail}</Text> : null}
            </View>
            <Check on={on} />
          </TouchableOpacity>
        );
      })}
    </BottomSheet>
  );
};

// Pantalla en miniatura con los colores de la paleta en claro u oscuro
const MiniScreen = ({ paletteId, dark }: { paletteId: ColorPaletteId; dark: boolean }) => {
  const c = getDynamicColors(dark, paletteId);
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={[styles.miniHero, { backgroundColor: c.balanceCard }]} />
      <View style={[styles.miniBody, { backgroundColor: c.surface }]}>
        <View style={[styles.miniLine, { width: '80%', backgroundColor: withAlpha(c.textPrimary, 0.25) }]} />
        <View style={[styles.miniLine, { width: '55%', backgroundColor: withAlpha(c.textPrimary, 0.16) }]} />
        <View style={[styles.miniLine, { width: '70%', backgroundColor: withAlpha(c.textPrimary, 0.16) }]} />
      </View>
    </View>
  );
};

/** Apariencia: tres miniaturas en vez de una lista de texto */
export const AppearanceSheet = ({
  visible, paletteId, selected, onSelect, onDismiss,
}: {
  visible: boolean;
  paletteId: ColorPaletteId;
  selected: ThemeMode;
  onSelect: (mode: ThemeMode) => void;
  onDismiss: () => void;
}) => {
  const { t } = useTranslation();
  const { colors: dc, ui } = useTheme();
  const options: { code: ThemeMode; label: string }[] = [
    { code: 'auto', label: t('settings.themeAuto') },
    { code: 'light', label: t('settings.themeLight') },
    { code: 'dark', label: t('settings.themeDark') },
  ];
  return (
    <BottomSheet
      visible={visible}
      onClose={onDismiss}
      title={t('settings.theme')}
      subtitle={t('settings.themeHint')}
      bodyStyle={styles.sheetBody}
    >
      <View style={styles.appearanceRow}>
        {options.map((o) => {
          const on = o.code === selected;
          return (
            <TouchableOpacity
              key={o.code}
              style={[styles.appearance, { backgroundColor: ui.field, borderColor: on ? ui.accent : 'transparent' }]}
              onPress={() => { onSelect(o.code); onDismiss(); }}
              activeOpacity={0.8}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
            >
              <View style={[styles.mini, { borderColor: ui.hair }]}>
                {o.code === 'auto' ? (
                  // Mitad clara y mitad oscura
                  <>
                    <View style={styles.miniHalf}>
                      <View style={styles.miniFull}><MiniScreen paletteId={paletteId} dark={false} /></View>
                    </View>
                    <View style={[styles.miniHalf, styles.miniHalfRight]}>
                      <View style={[styles.miniFull, styles.miniFullRight]}><MiniScreen paletteId={paletteId} dark /></View>
                    </View>
                  </>
                ) : (
                  <MiniScreen paletteId={paletteId} dark={o.code === 'dark'} />
                )}
              </View>
              <Text style={[styles.appearanceLabel, { color: dc.textPrimary }]} numberOfLines={2}>{o.label}</Text>
              <View
                style={[
                  styles.radio,
                  on ? { borderColor: ui.accent, borderWidth: 6 } : { borderColor: ui.hair2, borderWidth: 1.5 },
                ]}
              />
            </TouchableOpacity>
          );
        })}
      </View>
    </BottomSheet>
  );
};

/** Fuente: cada una escrita con ella misma, con un importe para ver las cifras */
export const FontSheet = ({
  visible, selected, currencySymbol, onSelect, onDismiss,
}: {
  visible: boolean;
  selected: AppFontId;
  currencySymbol: string;
  onSelect: (id: AppFontId) => void;
  onDismiss: () => void;
}) => {
  const { t } = useTranslation();
  const { colors: dc, ui } = useTheme();
  const [previewReady, setPreviewReady] = useState(false);

  useEffect(() => {
    if (!visible || previewReady) return;
    // Si no se pueden cargar, las opciones se ven con la fuente actual
    Font.loadAsync(getPreviewFontMap())
      .then(() => setPreviewReady(true))
      .catch((e) => console.error('Error loading font previews:', e));
  }, [visible, previewReady]);

  const sample = `${formatAmount(839.82)} ${currencySymbol}`;

  return (
    <BottomSheet
      visible={visible}
      onClose={onDismiss}
      title={t('settings.font')}
      subtitle={t('settings.fontHint')}
      bodyStyle={styles.sheetBody}
    >
      {FONT_OPTIONS.map((option) => {
        const on = option.id === selected;
        const canPreview = previewReady || option.id === getActiveFont();
        const previewFont = canPreview ? { fontFamily: getPreviewFontFamily(option.id) } : undefined;
        return (
          <TouchableOpacity
            key={option.id}
            style={[styles.option, on && { backgroundColor: ui.accentSoft }]}
            onPress={() => { onDismiss(); if (!on) onSelect(option.id); }}
            activeOpacity={0.7}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
          >
            <View style={styles.optionText}>
              <Text style={[styles.fontLabel, { color: dc.textPrimary }, previewFont]}>{option.label}</Text>
              <Text style={[styles.optionDetail, { color: dc.textSecondary }, previewFont]}>{sample}</Text>
            </View>
            <Check on={on} />
          </TouchableOpacity>
        );
      })}
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  sheetBody: { paddingBottom: 8 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, marginHorizontal: -4,
  },
  badge: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  badgeText: { fontSize: 14, fontFamily: 'Poppins_700Bold' },
  optionText: { flex: 1, minWidth: 0 },
  optionLabel: { fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  optionDetail: { fontSize: 12.5, fontFamily: 'Poppins_400Regular', marginTop: 1 },
  fontLabel: { fontSize: 16 },
  check: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },

  appearanceRow: { flexDirection: 'row', gap: 10 },
  appearance: {
    flex: 1, alignItems: 'center', gap: 9,
    paddingVertical: 12, paddingHorizontal: 6, borderRadius: 18, borderWidth: 2,
  },
  mini: { width: 66, height: 108, borderRadius: 13, overflow: 'hidden', borderWidth: 1 },
  miniHero: { position: 'absolute', left: 0, right: 0, top: 0, height: 44 },
  miniBody: {
    position: 'absolute', left: 0, right: 0, top: 36, bottom: 0,
    borderTopLeftRadius: 10, borderTopRightRadius: 10, paddingVertical: 9, paddingHorizontal: 7,
  },
  miniLine: { height: 5, borderRadius: 3, marginBottom: 6 },
  miniHalf: { position: 'absolute', top: 0, bottom: 0, left: 0, width: '50%', overflow: 'hidden' },
  miniHalfRight: { left: '50%' },
  miniFull: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 64 },
  miniFullRight: { left: -32 },
  appearanceLabel: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', textAlign: 'center' },
  radio: { width: 20, height: 20, borderRadius: 10 },
});
