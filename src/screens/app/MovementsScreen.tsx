import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View, StyleSheet, FlatList, TouchableOpacity,
  Alert, ScrollView, TextInput as RNTextInput,
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
import { Movement, MovementType, HuchaMovement, RecurringMovement } from '../../types';
import AppHeader from '../../components/common/AppHeader';
import AddRecurringModal from '../../components/movements/AddRecurringModal';
import AddMovementModal from '../../components/movements/AddMovementModal';
import { formatDate } from '../../utils/dateFormat';
import { formatAmount } from '../../utils/formatAmount';
import SwipeableRow, { closeOpenSwipeable } from '../../components/common/SwipeableRow';
import { lightHaptic, warningHaptic } from '../../utils/haptics';

type FilterType = MovementType | 'hucha' | 'recurring';

const MovementRow = ({
  movement, onDelete, onEdit,
}: {
  movement: Movement;
  onDelete: (id: string) => void;
  onEdit: (movement: Movement) => void;
}) => {
  const { t } = useTranslation();
  const { getCurrencySymbol, language } = useSettingsStore();
  const { getCategoryName } = useCategoryStore();
  const { isSharedMode, getSharedCurrencySymbol, sharedAccount } = useSharedAccountStore();
  const { getSharedCategoryName } = useSharedCategoryStore();
  const { colors: dc } = useTheme();

  const currencySymbol = isSharedMode ? getSharedCurrencySymbol() : getCurrencySymbol();
  const userName = isSharedMode && movement.isRecurring
    ? t(movement.type === 'income' ? 'movementsList.recurringIncome' : 'movementsList.recurringExpense')
    : isSharedMode && movement.addedBy
      ? sharedAccount?.memberNames?.[movement.addedBy]
      : undefined;

  const getCatName = (id: string, type: MovementType) =>
    isSharedMode ? getSharedCategoryName(id, type, t) : getCategoryName(id, type, t);

  const formatRelativeTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayMidnight = new Date(todayMidnight);
    yesterdayMidnight.setDate(yesterdayMidnight.getDate() - 1);
    const movMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    if (movMidnight.getTime() === todayMidnight.getTime()) {
      const hh = date.getHours().toString().padStart(2, '0');
      const mm = date.getMinutes().toString().padStart(2, '0');
      return `${t('home.today')}, ${hh}:${mm}`;
    }
    if (movMidnight.getTime() === yesterdayMidnight.getTime()) return t('home.yesterday');
    const locale = language === 'pl' ? 'pl-PL' : language === 'en' ? 'en-US' : 'es-ES';
    return date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  };

  const isIncome = movement.type === 'income';
  const isSaving = (movement.type as string) === 'saving';
  const color = isIncome ? dc.income : isSaving ? dc.savings : dc.expense;
  const icon: keyof typeof Ionicons.glyphMap = isIncome
    ? 'arrow-down-circle' : isSaving ? 'save' : 'arrow-up-circle';

  const catName = getCatName(movement.category, movement.type);
  const title = movement.note || catName;
  const timeLabel = formatRelativeTime(movement.date);
  const dateAndCat = movement.note ? `${timeLabel} · ${catName}` : timeLabel;
  const subtitle = userName ? `${userName} · ${dateAndCat}` : dateAndCat;

  // Deslizar hasta la papelera no borra directamente: se confirma antes, por si
  // el gesto ha sido accidental
  const handleDelete = () => {
    warningHaptic();
    Alert.alert(
      t('movementsList.deleteConfirm'),
      `${title} · ${formatAmount(movement.amount)} ${currencySymbol}`,
      [
        { text: t('movements.cancel'), style: 'cancel' },
        {
          text: t('movementsList.delete'),
          style: 'destructive',
          onPress: () => onDelete(movement.id),
        },
      ]
    );
  };

  return (
    <SwipeableRow
      containerStyle={styles.swipeContainer}
      actions={[
        { icon: 'pencil', background: dc.primary, onPress: () => onEdit(movement) },
        { icon: 'trash', background: dc.expense, onPress: handleDelete },
      ]}
    >
    <View style={[styles.movementRow, { backgroundColor: dc.surface, borderColor: dc.border }]}>
      <View style={[styles.movementIcon, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <View style={styles.movementInfo}>
        <View style={styles.movementTitleRow}>
          <Text style={[styles.movementCategory, { color: dc.textPrimary }]} numberOfLines={1}>
            {title}
          </Text>
          {movement.isRecurring && (
            <View style={[styles.recurringBadge, { backgroundColor: dc.primary + '15' }]}>
              <Ionicons name="repeat" size={10} color={dc.primary} />
            </View>
          )}
        </View>
        <Text style={[styles.movementDate, { color: dc.textSecondary }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <Text style={[styles.movementAmount, { color }]}>
        {isIncome ? '+' : '-'}{formatAmount(movement.amount)} {currencySymbol}
      </Text>
    </View>
    </SwipeableRow>
  );
};

const HuchaMovementRow = ({ movement }: { movement: HuchaMovement }) => {
  const { getCurrencySymbol } = useSettingsStore();
  const { isSharedMode, getSharedCurrencySymbol } = useSharedAccountStore();
  const { colors: dc } = useTheme();
  const { t } = useTranslation();

  const currencySymbol = isSharedMode ? getSharedCurrencySymbol() : getCurrencySymbol();
  const isDeposit = movement.type === 'deposit';
  const huchaColor = movement.huchaColor || dc.savings;
  const amountColor = isDeposit ? huchaColor : dc.expense;

  return (
    <View style={[styles.movementRow, { backgroundColor: dc.surface, borderColor: dc.border }]}>
      <View style={[styles.movementIcon, { backgroundColor: huchaColor + '20' }]}>
        <Ionicons
          name={isDeposit ? 'arrow-down-circle' : 'arrow-up-circle'}
          size={22}
          color={huchaColor}
        />
      </View>
      <View style={styles.movementInfo}>
        <View style={styles.movementTitleRow}>
          <Text style={[styles.movementCategory, { color: dc.textPrimary }]} numberOfLines={1}>
            {movement.huchaName}
          </Text>
          <View style={[styles.recurringBadge, { backgroundColor: huchaColor + '20' }]}>
            <Ionicons name="wallet" size={10} color={huchaColor} />
          </View>
        </View>
        <Text style={[styles.movementDate, { color: dc.textSecondary }]}>
          {t(isDeposit ? 'hucha.depositLabel' : 'hucha.withdrawalLabel')} · {formatDate(movement.date)}
        </Text>
      </View>
      <Text style={[styles.movementAmount, { color: amountColor }]}>
        {isDeposit ? '+' : '-'}{formatAmount(movement.amount)} {currencySymbol}
      </Text>
    </View>
  );
};

const RecurringCard = ({
  item, onDelete, onEdit,
}: {
  item: RecurringMovement;
  onDelete: (id: string) => void;
  onEdit: (item: RecurringMovement) => void;
}) => {
  const { t } = useTranslation();
  const { getCurrencySymbol } = useSettingsStore();
  const { isSharedMode, getSharedCurrencySymbol } = useSharedAccountStore();
  const { colors: dc } = useTheme();

  const color = item.type === 'income' ? dc.income : dc.expense;
  const icon: keyof typeof Ionicons.glyphMap = item.type === 'income'
    ? 'arrow-down-circle' : 'arrow-up-circle';
  const currencySymbol = isSharedMode ? getSharedCurrencySymbol() : getCurrencySymbol();

  const handleDelete = () => {
    warningHaptic();
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
    <SwipeableRow
      containerStyle={styles.swipeContainer}
      actions={[
        { icon: 'pencil', background: dc.primary, onPress: () => onEdit(item) },
        { icon: 'trash', background: dc.expense, onPress: handleDelete },
      ]}
    >
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
        {!!item.note && (
          <Text style={[styles.movementDate, { color: dc.textSecondary }]} numberOfLines={1}>
            {item.note}
          </Text>
        )}
      </View>
      {/* El importe a la derecha, igual que en los movimientos normales */}
      <Text style={[styles.movementAmount, { color }]}>
        {item.type === 'income' ? '+' : '-'}{formatAmount(item.amount)} {currencySymbol}
      </Text>
    </View>
    </SwipeableRow>
  );
};

const MovementsScreen = () => {
  const { t } = useTranslation();
  const {
    movements, deleteMovement, setShowMovementModal,
    recurringMovements, deleteRecurringMovement,
    showRecurringModal, setShowRecurringModal,
    setActiveHistorialFilter,
  } = useMovementStore();
  const { huchaMovements } = useSavingsStore();
  const { getCurrencySymbol } = useSettingsStore();
  const { isSharedMode, getSharedCurrencySymbol } = useSharedAccountStore();
  const { colors: dc } = useTheme();
  const recurringCurrencySymbol = isSharedMode ? getSharedCurrencySymbol() : getCurrencySymbol();
  const recurringIncomeTotal = recurringMovements
    .filter((m) => m.type === 'income')
    .reduce((s, m) => s + m.amount, 0);
  const recurringExpenseTotal = recurringMovements
    .filter((m) => m.type === 'expense')
    .reduce((s, m) => s + m.amount, 0);
  const recurringNet = recurringIncomeTotal - recurringExpenseTotal;
  const { getCategoryName } = useCategoryStore();
  const { getSharedCategoryName } = useSharedCategoryStore();
  const route = useRoute<any>();
  const [filter, setFilter] = useState<FilterType>(route.params?.initialFilter ?? 'income');
  const [editingRecurring, setEditingRecurring] = useState<RecurringMovement | null>(null);
  const [editingMovement, setEditingMovement] = useState<Movement | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const handleEditRecurring = (item: RecurringMovement) => {
    setEditingRecurring(item);
    setShowRecurringModal(true);
  };
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

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const isCurrentMonth = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  };

  const handleEditMovement = (movement: Movement) => {
    setEditingMovement(movement);
  };

  const filteredMovements = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...movements]
      .filter(m => m.type === filter && isCurrentMonth(m.date))
      .filter(m => {
        if (!q) return true;
        const note = (m.note || '').toLowerCase();
        const desc = (m.description || '').toLowerCase();
        const catName = (isSharedMode
          ? getSharedCategoryName(m.category, m.type as MovementType, t)
          : getCategoryName(m.category, m.type as MovementType, t)
        ).toLowerCase();
        // Se busca por el valor crudo (6555.00) y por el formateado que ve el
        // usuario (6.555,00), para que ambas formas de teclearlo funcionen
        const amountRaw = m.amount.toFixed(2);
        const amountShown = formatAmount(m.amount);
        return note.includes(q) || desc.includes(q) || catName.includes(q)
          || amountRaw.includes(q) || amountShown.includes(q);
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [movements, filter, searchQuery, isSharedMode]);

  const sortedHuchaMovements = [...huchaMovements]
    .filter((m) => isCurrentMonth(m.date))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const sortedRecurring = [...recurringMovements]
    .sort((a, b) => a.recurringDay - b.recurringDay);

  const filters: { key: FilterType; label: string; color: string }[] = [
    { key: 'income', label: t('movementsList.income'), color: dc.income },
    { key: 'expense', label: t('movementsList.expenses'), color: dc.expense },
    { key: 'hucha', label: t('movementsList.hucha'), color: dc.savings },
    { key: 'recurring', label: t('movementsList.fixed'), color: dc.primary },
  ];

  const handleFilterPress = (key: FilterType) => {
    setFilter(key);
    setSearchQuery('');
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
      {/* En el filtro de huchas la acción no es añadir un movimiento suelto */}
      {filter !== 'hucha' && (
        <TouchableOpacity
          style={[styles.emptyAction, { backgroundColor: dc.primary }]}
          onPress={() => { lightHaptic(); setShowMovementModal(true); }}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={16} color="#FFFFFF" />
          <Text style={styles.emptyActionText}>{t('movements.add')}</Text>
        </TouchableOpacity>
      )}
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
      <TouchableOpacity
        style={[styles.emptyAction, { backgroundColor: dc.primary }]}
        onPress={() => { lightHaptic(); setShowRecurringModal(true); }}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={16} color="#FFFFFF" />
        <Text style={styles.emptyActionText}>{t('recurring.addFirst')}</Text>
      </TouchableOpacity>
    </View>
  );

  const searchBar = (filter === 'income' || filter === 'expense') ? (
    <View style={[styles.searchWrapper, { backgroundColor: dc.background, borderBottomColor: dc.border }]}>
      <View style={[styles.searchInner, { backgroundColor: dc.surface, borderColor: dc.border }]}>
        <Ionicons name="search-outline" size={16} color={dc.textSecondary} />
        <RNTextInput
          style={[styles.searchInput, { color: dc.textPrimary }]}
          placeholder={t('movementsList.searchPlaceholder')}
          placeholderTextColor={dc.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={16} color={dc.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  ) : null;

  return (
    <View
      style={[styles.container, { backgroundColor: dc.background }]}
      // Cualquier toque de la pantalla cierra la fila deslizada. Devuelve false,
      // así que no se queda con el gesto y el toque llega igual a su destino.
      onStartShouldSetResponderCapture={closeOpenSwipeable}
    >
      <AppHeader title={t('header.historial')} />

      {filterChips}
      {searchBar}

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
          onScrollBeginDrag={closeOpenSwipeable}
        >
          <View style={[styles.summaryCard, { backgroundColor: dc.surface, borderColor: dc.border }]}>
            <Text style={[styles.summaryTitle, { color: dc.textSecondary }]}>
              {t('recurring.summaryTitle').toUpperCase()}
            </Text>
            <View style={styles.summaryRow}>
              <View style={styles.summaryCol}>
                <View style={styles.summaryColHeader}>
                  <Ionicons name="arrow-down-circle" size={14} color={dc.income} />
                  <Text style={[styles.summaryColLabel, { color: dc.textSecondary }]}>
                    {t('recurring.income')}
                  </Text>
                </View>
                <Text style={[styles.summaryColValue, { color: dc.income }]}>
                  +{formatAmount(recurringIncomeTotal)} {recurringCurrencySymbol}
                </Text>
              </View>
              <View style={[styles.summarySep, { backgroundColor: dc.border }]} />
              <View style={styles.summaryCol}>
                <View style={styles.summaryColHeader}>
                  <Ionicons name="arrow-up-circle" size={14} color={dc.expense} />
                  <Text style={[styles.summaryColLabel, { color: dc.textSecondary }]}>
                    {t('recurring.expense')}
                  </Text>
                </View>
                <Text style={[styles.summaryColValue, { color: dc.expense }]}>
                  -{formatAmount(recurringExpenseTotal)} {recurringCurrencySymbol}
                </Text>
              </View>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: dc.border }]} />
            <View style={styles.summaryNetRow}>
              <Text style={[styles.summaryNetLabel, { color: dc.textSecondary }]}>
                {t('recurring.net')}
              </Text>
              <Text style={[styles.summaryNetValue, { color: recurringNet >= 0 ? dc.income : dc.expense }]}>
                {recurringNet >= 0 ? '+' : ''}{formatAmount(recurringNet)} {recurringCurrencySymbol}
              </Text>
            </View>
          </View>

          {sortedRecurring.length === 0
            ? emptyRecurring
            : sortedRecurring.map((item) => (
                <RecurringCard
                  key={item.id}
                  item={item}
                  onDelete={deleteRecurringMovement}
                  onEdit={handleEditRecurring}
                />
              ))
          }
        </ScrollView>
      ) : (
        <FlatList
          data={filteredMovements}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={closeOpenSwipeable}
          renderItem={({ item }) => (
            <MovementRow
              movement={item}
              onDelete={deleteMovement}
              onEdit={handleEditMovement}
            />
          )}
          ListEmptyComponent={emptyMovements}
        />
      )}

      <AddMovementModal
        visible={!!editingMovement}
        onDismiss={() => setEditingMovement(null)}
        editingMovement={editingMovement}
      />
      <AddRecurringModal
        visible={showRecurringModal}
        onDismiss={() => {
          setShowRecurringModal(false);
          setEditingRecurring(null);
        }}
        editingRecurring={editingRecurring}
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
  searchWrapper: { paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 0.5 },
  searchInner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12, borderWidth: 0.5,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  searchInput: {
    flex: 1, fontSize: 14, fontFamily: 'Poppins_400Regular',
    paddingVertical: 0,
  },
  listContent: { paddingHorizontal: 16, paddingBottom: 100, paddingTop: 8 },
  swipeContainer: { marginBottom: 8, borderRadius: 16 },
  emptyAction: {
    marginTop: 16, paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  emptyActionText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: '#FFFFFF' },
  movementRow: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 16, padding: 14, borderWidth: 0.5,
  },
  movementIcon: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  movementInfo: { flex: 1 },
  movementTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  movementCategory: { fontSize: 14, fontFamily: 'Poppins_500Medium', flexShrink: 1 },
  recurringBadge: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  movementDate: { fontSize: 11, fontFamily: 'Poppins_400Regular', marginTop: 2 },
  movementAmount: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', marginLeft: 8 },
  recurringCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 16, padding: 14, borderWidth: 0.5, gap: 10,
  },
  dayBadge: {
    width: 40, height: 40, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  dayNumber: { fontSize: 14, fontFamily: 'Poppins_700Bold', lineHeight: 16 },
  dayLabel: { fontSize: 9, fontFamily: 'Poppins_400Regular' },
  recurringActions: { flexDirection: 'row', gap: 4, marginLeft: 4 },
  actionButton: { padding: 4 },
  deleteButton: { padding: 4 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyText: { fontSize: 18, fontFamily: 'Poppins_600SemiBold' },
  emptySubtext: {
    fontSize: 13, fontFamily: 'Poppins_400Regular',
    textAlign: 'center', paddingHorizontal: 32, marginTop: 8,
  },
  summaryCard: {
    borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 0.5,
  },
  summaryTitle: {
    fontSize: 10, fontFamily: 'Poppins_600SemiBold',
    letterSpacing: 0.8, marginBottom: 12,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryCol: { flex: 1 },
  summaryColHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4,
  },
  summaryColLabel: { fontSize: 11, fontFamily: 'Poppins_500Medium' },
  summaryColValue: { fontSize: 17, fontFamily: 'Poppins_700Bold' },
  summarySep: { width: 0.5, alignSelf: 'stretch', marginHorizontal: 12 },
  summaryDivider: { height: 0.5, marginVertical: 12 },
  summaryNetRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  summaryNetLabel: { fontSize: 12, fontFamily: 'Poppins_500Medium' },
  summaryNetValue: { fontSize: 16, fontFamily: 'Poppins_700Bold' },
});

export default MovementsScreen;
