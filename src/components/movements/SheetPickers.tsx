import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import Icon from '../common/Icon';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/useTheme';
import { useCategoryInfo } from '../../hooks/useCategoryInfo';
import { withAlpha } from '../../utils/color';
import { MovementType } from '../../types';
import StrikeText from '../common/StrikeText';

export type CategoryChip = { id: string; name: string; icon: string; isCustom: boolean; deleted?: boolean };

// Todas del mismo ancho: los nombres largos se cortan ("Supermer…")
const TILE_W = 72;
const TILE_GAP = 4;

const DAY_SIZE = 36;
const DAY_GAP = 6;

/**
 * Categorías en una sola fila de cuadrados que se desliza: cada una con su
 * color, en el orden que se le pase (el de uso: la más usada, primero). Al
 * final, un cuadrado para crear una nueva.
 */
export const CategoryPicker = ({
  categories, type, selectedId, onSelect, onAdd, resetKey,
}: {
  categories: CategoryChip[];
  type: MovementType;
  selectedId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  /** Al cambiar, vuelve al principio de la fila (al abrir la ventana o cambiar de tipo) */
  resetKey?: unknown;
}) => {
  const { t } = useTranslation();
  const { colors: dc, ui } = useTheme();
  const cat = useCategoryInfo();
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ x: 0, animated: false });
  }, [resetKey]);

  const handlePress = (id: string, index: number) => {
    onSelect(id);
    scrollRef.current?.scrollTo({ x: Math.max(0, index * (TILE_W + TILE_GAP) - 20), animated: true });
  };

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="always"
      style={styles.bleed}
      contentContainerStyle={styles.row}
    >
      {categories.map((c, index) => {
        const on = c.id === selectedId;
        const color = type === 'income' ? cat.colors.incomeOf(c.id) : cat.colors.expense(c.id);
        return (
          <TouchableOpacity
            key={c.id}
            style={[
              styles.tile,
              on && { backgroundColor: withAlpha(color, 0.12), borderColor: color },
            ]}
            onPress={() => handlePress(c.id, index)}
            activeOpacity={0.75}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
          >
            <View style={[styles.icon, { backgroundColor: withAlpha(color, 0.16) }]}>
              <Icon name={`${c.icon}-outline` as any} size={16} color={color} />
            </View>
            <Text
              style={[styles.name, { color: dc.textPrimary }, on && styles.nameOn]}
              numberOfLines={1}
            >
              <StrikeText struck={!!c.deleted}>
                {c.isCustom ? c.name : t(`movements.categories.${c.id}`)}
              </StrikeText>
            </Text>
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity style={styles.tile} onPress={onAdd} activeOpacity={0.75} accessibilityRole="button">
        <View style={[styles.icon, styles.addIcon, { borderColor: ui.hair2 }]}>
          <Icon name="add" size={16} color={dc.textSecondary} />
        </View>
        <Text style={[styles.name, { color: dc.textSecondary }]} numberOfLines={1}>{t('categories.new')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

/** Días del mes (1-31) en una fila que se desliza, para los movimientos fijos */
export const DayPicker = ({
  value, onChange, resetKey,
}: {
  value: number;
  onChange: (day: number) => void;
  resetKey?: unknown;
}) => {
  const { colors: dc, ui } = useTheme();
  const scrollRef = useRef<ScrollView>(null);

  // Al abrir, el día elegido queda a la vista
  useEffect(() => {
    const id = setTimeout(() => {
      scrollRef.current?.scrollTo({ x: Math.max(0, (value - 3) * (DAY_SIZE + DAY_GAP)), animated: false });
    }, 50);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir
  }, [resetKey]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="always"
      style={styles.bleed}
      contentContainerStyle={styles.days}
    >
      {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
        const on = day === value;
        return (
          <TouchableOpacity
            key={day}
            style={[styles.day, { backgroundColor: on ? dc.primary : ui.field }]}
            onPress={() => onChange(day)}
            activeOpacity={0.75}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.dayText, { color: on ? '#FFFFFF' : dc.textPrimary }]}>{day}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  bleed: { marginHorizontal: -20 },
  row: { paddingHorizontal: 20, gap: TILE_GAP },
  tile: {
    width: TILE_W, alignItems: 'center', gap: 5,
    paddingTop: 8, paddingBottom: 7, paddingHorizontal: 3, borderRadius: 14,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  icon: { width: 30, height: 30, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  addIcon: { borderWidth: 1.5, borderStyle: 'dashed' },
  name: { fontSize: 11, fontFamily: 'Poppins_500Medium', maxWidth: '100%' },
  nameOn: { fontFamily: 'Poppins_600SemiBold' },
  days: { paddingHorizontal: 20, gap: DAY_GAP },
  day: { width: DAY_SIZE, height: DAY_SIZE, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  dayText: { fontSize: 13.5, fontFamily: 'Poppins_600SemiBold' },
});
