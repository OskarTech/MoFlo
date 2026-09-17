import React, { useState, useCallback, useMemo, memo } from 'react';
import {
  View, StyleSheet, FlatList,
  TouchableOpacity, Alert,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useMovementStore } from '../../store/movementStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useSharedAccountStore } from '../../store/sharedAccountStore';
import { useTheme } from '../../hooks/useTheme';
import { colors } from '../../theme';
import { RecurringMovement } from '../../types';
import AppHeader from '../../components/common/AppHeader';
import AddRecurringModal from '../../components/movements/AddRecurringModal';
import { formatAmount } from '../../utils/formatAmount';
import SwipeableRow, { closeOpenSwipeable } from '../../components/common/SwipeableRow';
import { lightHaptic, warningHaptic } from '../../utils/haptics';

const TYPE_COLORS = {
  income: colors.income,
  saving: colors.savings,
  expense: colors.expense,
};

const TYPE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  income: 'arrow-down-circle',
  saving: 'save',
  expense: 'arrow-up-circle',
};

const RecurringCardBase = ({
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

  const color = TYPE_COLORS[item.type];
  const icon = TYPE_ICONS[item.type];
  const currencySymbol = isSharedMode
    ? getSharedCurrencySymbol()
    : getCurrencySymbol();

  const handleDelete = () => {
    warningHaptic();
    Alert.alert(
      t('recurring.deleteConfirm'),
      item.description,
      [
        { text: t('movements.cancel'), style: 'cancel' },
        {
          text: 'OK',
          style: 'destructive',
          onPress: () => onDelete(item.id),
        },
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
    <View style={[styles.card, { backgroundColor: dc.surface, borderColor: dc.border }]}>
      <View style={[styles.dayBadge, { backgroundColor: colors.primary + '20' }]}>
        <Text style={[styles.dayNumber, { color: colors.primary }]}>
          {item.recurringDay}
        </Text>
        <Text style={[styles.dayLabel, { color: colors.primary }]}>
          {t('recurring.dayShort') ?? 'día'}
        </Text>
      </View>
      <View style={[styles.cardIcon, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <View style={styles.cardInfo}>
        <Text style={[styles.cardDescription, { color: dc.textPrimary }]}>
          {item.description}
        </Text>
      </View>
      <View style={styles.cardRight}>
        <Text style={[styles.cardAmount, { color }]}>
          {item.type === 'income' ? '+' : '-'}{formatAmount(item.amount)} {currencySymbol}
        </Text>
      </View>
    </View>
    </SwipeableRow>
  );
};

// Memoizada: cada tarjeta monta un Swipeable con dos gestos nativos
const RecurringCard = memo(RecurringCardBase);

const RecurringScreen = () => {
  const { t } = useTranslation();
  const {
    recurringMovements,
    deleteRecurringMovement,
    showRecurringModal,
    setShowRecurringModal,
  } = useMovementStore();
  const { getCurrencySymbol } = useSettingsStore();
  const { isSharedMode, getSharedCurrencySymbol } = useSharedAccountStore();
  const { colors: dc } = useTheme();
  const [editingRecurring, setEditingRecurring] = useState<RecurringMovement | null>(null);
  // Solo se monta con el foco: MovementsScreen monta otro AddRecurringModal con la
  // misma bandera del store y con las dos pantallas montadas se dibujaba duplicado
  const isFocused = useIsFocused();

  const currencySymbol = isSharedMode
    ? getSharedCurrencySymbol()
    : getCurrencySymbol();

  const handleEdit = useCallback((item: RecurringMovement) => {
    setEditingRecurring(item);
    setShowRecurringModal(true);
  }, [setShowRecurringModal]);

  const sortedRecurring = useMemo(
    () => [...recurringMovements].sort((a, b) => a.recurringDay - b.recurringDay),
    [recurringMovements],
  );

  const totalIncome = recurringMovements
    .filter((m) => m.type === 'income')
    .reduce((s, m) => s + m.amount, 0);
  const totalExpense = recurringMovements
    .filter((m) => m.type === 'expense')
    .reduce((s, m) => s + m.amount, 0);
  const net = totalIncome - totalExpense;

  const renderRecurringItem = useCallback(
    ({ item }: { item: RecurringMovement }) => (
      <RecurringCard item={item} onDelete={deleteRecurringMovement} onEdit={handleEdit} />
    ),
    [deleteRecurringMovement, handleEdit],
  );

  // Cabecera fija de la lista: se muestra siempre, también sin fijos, igual que antes
  const summaryCard = (
    <View style={[styles.summaryCard, { backgroundColor: dc.surface, borderColor: dc.border }]}>
      <Text style={[styles.summaryTitle, { color: dc.textSecondary }]}>
        {t('recurring.summaryTitle').toUpperCase()}
      </Text>
      <View style={styles.summaryRow}>
        <View style={styles.summaryCol}>
          <View style={styles.summaryColHeader}>
            <Ionicons name="arrow-down-circle" size={14} color={colors.income} />
            <Text style={[styles.summaryColLabel, { color: dc.textSecondary }]}>
              {t('recurring.income')}
            </Text>
          </View>
          <Text style={[styles.summaryColValue, { color: colors.income }]}>
            +{formatAmount(totalIncome)} {currencySymbol}
          </Text>
        </View>
        <View style={[styles.summarySep, { backgroundColor: dc.border }]} />
        <View style={styles.summaryCol}>
          <View style={styles.summaryColHeader}>
            <Ionicons name="arrow-up-circle" size={14} color={colors.expense} />
            <Text style={[styles.summaryColLabel, { color: dc.textSecondary }]}>
              {t('recurring.expense')}
            </Text>
          </View>
          <Text style={[styles.summaryColValue, { color: colors.expense }]}>
            -{formatAmount(totalExpense)} {currencySymbol}
          </Text>
        </View>
      </View>
      <View style={[styles.summaryDivider, { backgroundColor: dc.border }]} />
      <View style={styles.summaryNetRow}>
        <Text style={[styles.summaryNetLabel, { color: dc.textSecondary }]}>
          {t('recurring.net')}
        </Text>
        <Text style={[styles.summaryNetValue, { color: net >= 0 ? colors.income : colors.expense }]}>
          {net >= 0 ? '+' : ''}{formatAmount(net)} {currencySymbol}
        </Text>
      </View>
    </View>
  );

  const emptyState = (
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

  return (
    <View
      style={[styles.container, { backgroundColor: dc.background }]}
      // Cualquier toque de la pantalla cierra la fila deslizada. Devuelve false,
      // así que no se queda con el gesto y el toque llega igual a su destino.
      onStartShouldSetResponderCapture={closeOpenSwipeable}
    >
      <AppHeader title={t('recurring.title')} />
      <FlatList
        data={sortedRecurring}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={closeOpenSwipeable}
        initialNumToRender={8}
        maxToRenderPerBatch={6}
        windowSize={7}
        renderItem={renderRecurringItem}
        ListHeaderComponent={summaryCard}
        ListEmptyComponent={emptyState}
      />

      {isFocused && (
        <AddRecurringModal
          visible={showRecurringModal}
          onDismiss={() => {
            setShowRecurringModal(false);
            setEditingRecurring(null);
          }}
          editingRecurring={editingRecurring}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 100 },
  card: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 16, padding: 14,
    borderWidth: 0.5, gap: 10,
  },
  swipeContainer: { marginBottom: 10, borderRadius: 16 },
  emptyAction: {
    marginTop: 16, paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  emptyActionText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: '#FFFFFF' },
  dayBadge: {
    width: 40, height: 40, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  dayNumber: { fontSize: 14, fontFamily: 'Poppins_700Bold', lineHeight: 16 },
  dayLabel: { fontSize: 9, fontFamily: 'Poppins_400Regular' },
  cardIcon: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  cardInfo: { flex: 1 },
  cardDescription: { fontSize: 14, fontFamily: 'Poppins_500Medium' },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  cardAmount: { fontSize: 14, fontFamily: 'Poppins_600SemiBold' },
  cardActions: { flexDirection: 'row', gap: 4 },
  actionButton: { padding: 4 },
  deleteButton: { padding: 4 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyText: { fontSize: 18, fontFamily: 'Poppins_600SemiBold', marginBottom: 8 },
  emptySubtext: {
    fontSize: 13, fontFamily: 'Poppins_400Regular',
    textAlign: 'center', paddingHorizontal: 32,
  },
  summaryCard: {
    borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 0.5,
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

export default RecurringScreen;