import React, { useState, useRef } from 'react';
import {
  View, StyleSheet, FlatList, TouchableOpacity,
  Alert, ScrollView,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useMovementStore } from '../../store/movementStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useCategoryStore } from '../../store/categoryStore';
import { useSharedAccountStore } from '../../store/sharedAccountStore';
import { useSharedCategoryStore } from '../../store/sharedCategoryStore';
import { useTheme } from '../../hooks/useTheme';
import { colors } from '../../theme';
import { Movement, MovementType } from '../../types';
import AppHeader from '../../components/common/AppHeader';
import { formatDate } from '../../utils/dateFormat';

type FilterType = 'all' | MovementType;

const MovementRow = ({
  movement, onDelete,
}: {
  movement: Movement; onDelete: (id: string) => void;
}) => {
  const { t } = useTranslation();
  const { getCurrencySymbol } = useSettingsStore();
  const { getCategoryName } = useCategoryStore();
  const { isSharedMode, getSharedCurrencySymbol } = useSharedAccountStore();
  const { getSharedCategoryName } = useSharedCategoryStore();
  const { colors: dc } = useTheme();

  const currencySymbol = isSharedMode
    ? getSharedCurrencySymbol()
    : getCurrencySymbol();

  const getCatName = (id: string, type: MovementType) =>
    isSharedMode
      ? getSharedCategoryName(id, type, t)
      : getCategoryName(id, type, t);

  const isIncome = movement.type === 'income';
  const isSaving = movement.type === 'saving';
  const color = isIncome ? colors.income : isSaving ? colors.savings : colors.expense;
  const icon: keyof typeof Ionicons.glyphMap = isIncome
    ? 'arrow-down-circle' : isSaving ? 'save' : 'arrow-up-circle';

  const handleDelete = () => {
    Alert.alert(
      t('movementsList.deleteConfirm'),
      `${movement.amount.toFixed(2)} ${currencySymbol}`,
      [
        { text: t('movements.cancel'), style: 'cancel' },
        { text: 'OK', style: 'destructive', onPress: () => onDelete(movement.id) },
      ]
    );
  };

  return (
    <TouchableOpacity
      onLongPress={handleDelete}
      style={[styles.movementRow, { backgroundColor: dc.surface, borderColor: dc.border }]}
    >
      <View style={[styles.movementIcon, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <View style={styles.movementInfo}>
        <View style={styles.movementTitleRow}>
          <Text style={[styles.movementCategory, { color: dc.textPrimary }]} numberOfLines={1}>
            {getCatName(movement.category, movement.type)}
          </Text>
          {movement.isRecurring && (
            <View style={styles.recurringBadge}>
              <Ionicons name="repeat" size={10} color={colors.primary} />
            </View>
          )}
        </View>
        <Text style={[styles.movementDate, { color: dc.textSecondary }]}>
          {formatDate(movement.date)}
        </Text>
      </View>
      <Text style={[styles.movementAmount, { color }]}>
        {isIncome ? '+' : '-'}{movement.amount.toFixed(2)} {currencySymbol}
      </Text>
    </TouchableOpacity>
  );
};

const MovementsScreen = () => {
  const { t } = useTranslation();
  const { movements, deleteMovement } = useMovementStore();
  const { colors: dc } = useTheme();
  const [filter, setFilter] = useState<FilterType>('all');
  const scrollRef = useRef<ScrollView>(null);
  const filterPositions = useRef<{ [key: string]: number }>({});

  const filteredMovements = [...movements]
    .filter((m) => filter === 'all' || m.type === filter)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const filters: { key: FilterType; label: string; color: string }[] = [
    { key: 'all', label: t('movementsList.all'), color: colors.primary },
    { key: 'income', label: t('movementsList.income'), color: colors.income },
    { key: 'expense', label: t('movementsList.expenses'), color: colors.expense },
    { key: 'saving', label: t('movementsList.savings'), color: colors.savings },
  ];

  const handleFilterPress = (key: FilterType) => {
    setFilter(key);
    const x = filterPositions.current[key] ?? 0;
    scrollRef.current?.scrollTo({ x: x - 16, animated: true });
  };

  return (
    <View style={[styles.container, { backgroundColor: dc.background }]}>
      <AppHeader title={t('header.historial')} />
      <FlatList
        data={filteredMovements}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filtersRow}
          >
            {filters.map((f) => (
              <TouchableOpacity
                key={f.key}
                style={[
                  styles.filterChip,
                  { backgroundColor: dc.surface, borderColor: dc.border },
                  filter === f.key && { backgroundColor: f.color, borderColor: f.color },
                ]}
                onLayout={(e) => {
                  filterPositions.current[f.key] = e.nativeEvent.layout.x;
                }}
                onPress={() => handleFilterPress(f.key)}
              >
                <Text style={[
                  styles.filterChipText, { color: dc.textSecondary },
                  filter === f.key && styles.filterChipTextActive,
                ]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        }
        renderItem={({ item }) => (
          <MovementRow movement={item} onDelete={deleteMovement} />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🔍</Text>
            <Text style={[styles.emptyText, { color: dc.textPrimary }]}>
              {t('movementsList.noMovements')}
            </Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  filtersRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8, flexDirection: 'row' },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 0.5 },
  filterChipText: { fontSize: 12, fontFamily: 'Poppins_500Medium' },
  filterChipTextActive: { color: '#FFFFFF', fontFamily: 'Poppins_600SemiBold' },
  listContent: { paddingHorizontal: 16, paddingBottom: 100 },
  movementRow: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 16, padding: 14, marginBottom: 8, borderWidth: 0.5,
  },
  movementIcon: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  movementInfo: { flex: 1 },
  movementTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  movementCategory: { fontSize: 14, fontFamily: 'Poppins_500Medium', flexShrink: 1 },
  recurringBadge: { backgroundColor: colors.primary + '15', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  movementDate: { fontSize: 11, fontFamily: 'Poppins_400Regular', marginTop: 3 },
  movementAmount: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', marginLeft: 8 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyText: { fontSize: 18, fontFamily: 'Poppins_600SemiBold' },
});

export default MovementsScreen;