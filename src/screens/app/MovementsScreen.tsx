import React, { useState, useRef, useEffect } from 'react';
import {
  View, StyleSheet, FlatList, TouchableOpacity,
  Alert, ScrollView,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useRoute } from '@react-navigation/native';
import { useMovementStore } from '../../store/movementStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useCategoryStore } from '../../store/categoryStore';
import { useSharedAccountStore } from '../../store/sharedAccountStore';
import { useSharedCategoryStore } from '../../store/sharedCategoryStore';
import { useSavingsStore } from '../../store/savingsStore';
import { useTheme } from '../../hooks/useTheme';
import { colors } from '../../theme';
import { Movement, MovementType, HuchaMovement, RecurringMovement } from '../../types';
import AppHeader from '../../components/common/AppHeader';
import AddRecurringModal from '../../components/movements/AddRecurringModal';
import { formatDate } from '../../utils/dateFormat';

type FilterType = MovementType | 'hucha' | 'recurring';

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

  const currencySymbol = isSharedMode ? getSharedCurrencySymbol() : getCurrencySymbol();

  const getCatName = (id: string, type: MovementType) =>
    isSharedMode ? getSharedCategoryName(id, type, t) : getCategoryName(id, type, t);

  const isIncome = movement.type === 'income';
  const isSaving = (movement.type as string) === 'saving';
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
            <View style={[styles.recurringBadge, { backgroundColor: dc.primary + '15' }]}>
              <Ionicons name="repeat" size={10} color={dc.primary} />
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

const HuchaMovementRow = ({ movement }: { movement: HuchaMovement }) => {
  const { getCurrencySymbol } = useSettingsStore();
  const { isSharedMode, getSharedCurrencySymbol } = useSharedAccountStore();
  const { colors: dc } = useTheme();
  const { t } = useTranslation();

  const currencySymbol = isSharedMode ? getSharedCurrencySymbol() : getCurrencySymbol();
  const isDeposit = movement.type === 'deposit';
  const movColor = isDeposit ? colors.income : colors.expense;

  return (
    <View style={[styles.movementRow, { backgroundColor: dc.surface, borderColor: dc.border }]}>
      <View style={[styles.movementIcon, { backgroundColor: movement.huchaColor + '20' }]}>
        <Ionicons
          name={isDeposit ? 'arrow-down-circle' : 'arrow-up-circle'}
          size={22}
          color={movement.huchaColor}
        />
      </View>
      <View style={styles.movementInfo}>
        <View style={styles.movementTitleRow}>
          <Text style={[styles.movementCategory, { color: dc.textPrimary }]} numberOfLines={1}>
            {movement.huchaName}
          </Text>
          <View style={[styles.recurringBadge, { backgroundColor: movement.huchaColor + '20' }]}>
            <Ionicons name="wallet" size={10} color={movement.huchaColor} />
          </View>
        </View>
        <Text style={[styles.movementDate, { color: dc.textSecondary }]}>
          {t(isDeposit ? 'hucha.depositLabel' : 'hucha.withdrawalLabel')} · {formatDate(movement.date)}
        </Text>
      </View>
      <Text style={[styles.movementAmount, { color: movColor }]}>
        {isDeposit ? '+' : '-'}{movement.amount.toFixed(2)} {currencySymbol}
      </Text>
    </View>
  );
};

const RecurringCard = ({
  item, onDelete,
}: {
  item: RecurringMovement; onDelete: (id: string) => void;
}) => {
  const { t } = useTranslation();
  const { getCurrencySymbol } = useSettingsStore();
  const { isSharedMode, getSharedCurrencySymbol } = useSharedAccountStore();
  const { colors: dc } = useTheme();

  const color = item.type === 'income' ? colors.income : colors.expense;
  const icon: keyof typeof Ionicons.glyphMap = item.type === 'income'
    ? 'arrow-down-circle' : 'arrow-up-circle';
  const currencySymbol = isSharedMode ? getSharedCurrencySymbol() : getCurrencySymbol();

  const handleDelete = () => {
    Alert.alert(
      t('recurring.deleteConfirm'),
      item.description,
      [
        { text: t('movements.cancel'), style: 'cancel' },
        { text: 'OK', style: 'destructive', onPress: () => onDelete(item.id) },
      ]
    );
  };

  return (
    <View style={[styles.recurringCard, { backgroundColor: dc.surface, borderColor: dc.border }]}>
      <View style={[styles.dayBadge, { backgroundColor: dc.primary + '20' }]}>
        <Text style={[styles.dayNumber, { color: dc.primary }]}>{item.recurringDay}</Text>
        <Text style={[styles.dayLabel, { color: dc.primary }]}>{t('recurring.dayShort') ?? 'día'}</Text>
      </View>
      <View style={[styles.movementIcon, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <View style={styles.movementInfo}>
        <Text style={[styles.movementCategory, { color: dc.textPrimary }]} numberOfLines={1}>
          {item.description}
        </Text>
        <Text style={[styles.movementAmount, { color, fontSize: 12 }]}>
          {item.type === 'income' ? '+' : '-'}{item.amount.toFixed(2)} {currencySymbol}
        </Text>
      </View>
      <TouchableOpacity onPress={handleDelete} style={styles.deleteButton}>
        <Ionicons name="trash-outline" size={18} color={colors.expense} />
      </TouchableOpacity>
    </View>
  );
};

const MovementsScreen = () => {
  const { t } = useTranslation();
  const {
    movements, deleteMovement,
    recurringMovements, deleteRecurringMovement,
    showRecurringModal, setShowRecurringModal,
    setActiveHistorialFilter,
  } = useMovementStore();
  const { huchaMovements } = useSavingsStore();
  const { colors: dc } = useTheme();
  const route = useRoute<any>();
  const [filter, setFilter] = useState<FilterType>(route.params?.initialFilter ?? 'income');
  const scrollRef = useRef<ScrollView>(null);
  const filterPositions = useRef<{ [key: string]: number }>({});

  useEffect(() => {
    if (route.params?.initialFilter) {
      setFilter(route.params.initialFilter);
    }
  }, [route.params?.initialFilter]);

  useEffect(() => {
    setActiveHistorialFilter(filter);
  }, [filter]);

  const filteredMovements = [...movements]
    .filter((m) => m.type === filter)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const sortedHuchaMovements = [...huchaMovements]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const sortedRecurring = [...recurringMovements]
    .sort((a, b) => a.recurringDay - b.recurringDay);

  const filters: { key: FilterType; label: string; color: string }[] = [
    { key: 'income', label: t('movementsList.income'), color: colors.income },
    { key: 'expense', label: t('movementsList.expenses'), color: colors.expense },
    { key: 'hucha', label: t('movementsList.hucha'), color: colors.savings },
    { key: 'recurring', label: t('movementsList.fixed'), color: dc.primary },
  ];

  const handleFilterPress = (key: FilterType) => {
    setFilter(key);
    const x = filterPositions.current[key] ?? 0;
    scrollRef.current?.scrollTo({ x: x - 16, animated: true });
  };

  const filterChips = (
    <View style={[styles.filtersWrapper, { backgroundColor: dc.background, borderBottomColor: dc.border }]}>
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
            onLayout={(e) => { filterPositions.current[f.key] = e.nativeEvent.layout.x; }}
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
    </View>
  );

  const emptyMovements = (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>{filter === 'hucha' ? '🐷' : '🔍'}</Text>
      <Text style={[styles.emptyText, { color: dc.textPrimary }]}>
        {t('movementsList.noMovements')}
      </Text>
    </View>
  );

  const emptyRecurring = (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>🔄</Text>
      <Text style={[styles.emptyText, { color: dc.textPrimary }]}>
        {t('recurring.noRecurring')}
      </Text>
      <Text style={[styles.emptySubtext, { color: dc.textSecondary }]}>
        {t('recurring.noRecurringSubtitle')}
      </Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: dc.background }]}>
      <AppHeader title={t('header.historial')} />
      {filterChips}

      {filter === 'hucha' ? (
        <FlatList
          data={sortedHuchaMovements}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => <HuchaMovementRow movement={item} />}
          ListEmptyComponent={emptyMovements}
        />
      ) : filter === 'recurring' ? (
        <ScrollView
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {sortedRecurring.length === 0
            ? emptyRecurring
            : sortedRecurring.map((item) => (
                <RecurringCard key={item.id} item={item} onDelete={deleteRecurringMovement} />
              ))
          }
        </ScrollView>
      ) : (
        <FlatList
          data={filteredMovements}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <MovementRow movement={item} onDelete={deleteMovement} />
          )}
          ListEmptyComponent={emptyMovements}
        />
      )}

      <AddRecurringModal
        visible={showRecurringModal}
        onDismiss={() => setShowRecurringModal(false)}
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
  filtersWrapper: { borderBottomWidth: 0.5 },
  listContent: { paddingHorizontal: 16, paddingBottom: 100, paddingTop: 8 },
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
  recurringBadge: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  movementDate: { fontSize: 11, fontFamily: 'Poppins_400Regular', marginTop: 3 },
  movementAmount: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', marginLeft: 8 },
  recurringCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 16, padding: 14, marginBottom: 8, borderWidth: 0.5, gap: 10,
  },
  dayBadge: {
    width: 40, height: 40, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  dayNumber: { fontSize: 14, fontFamily: 'Poppins_700Bold', lineHeight: 16 },
  dayLabel: { fontSize: 9, fontFamily: 'Poppins_400Regular' },
  deleteButton: { padding: 4 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyText: { fontSize: 18, fontFamily: 'Poppins_600SemiBold' },
  emptySubtext: {
    fontSize: 13, fontFamily: 'Poppins_400Regular',
    textAlign: 'center', paddingHorizontal: 32, marginTop: 8,
  },
});

export default MovementsScreen;
