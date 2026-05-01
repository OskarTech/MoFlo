import React from 'react';
import {
  View, StyleSheet, ScrollView,
  TouchableOpacity, Alert,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useMovementStore } from '../../store/movementStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useSharedAccountStore } from '../../store/sharedAccountStore';
import { useTheme } from '../../hooks/useTheme';
import { colors } from '../../theme';
import { RecurringMovement } from '../../types';
import AppHeader from '../../components/common/AppHeader';
import AddRecurringModal from '../../components/movements/AddRecurringModal';

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

const RecurringCard = ({
  item, onDelete,
}: {
  item: RecurringMovement; onDelete: (id: string) => void;
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
          {item.type === 'income' ? '+' : '-'}{item.amount.toFixed(2)} {currencySymbol}
        </Text>
        <TouchableOpacity onPress={handleDelete} style={styles.deleteButton}>
          <Ionicons name="trash-outline" size={18} color={colors.expense} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

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

  const currencySymbol = isSharedMode
    ? getSharedCurrencySymbol()
    : getCurrencySymbol();

  const sortedRecurring = [...recurringMovements].sort(
    (a, b) => a.recurringDay - b.recurringDay
  );

  const totalIncome = recurringMovements
    .filter((m) => m.type === 'income')
    .reduce((s, m) => s + m.amount, 0);
  const totalExpense = recurringMovements
    .filter((m) => m.type === 'expense')
    .reduce((s, m) => s + m.amount, 0);
  const net = totalIncome - totalExpense;

  return (
    <View style={[styles.container, { backgroundColor: dc.background }]}>
      <AppHeader title={t('recurring.title')} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
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
                +{totalIncome.toFixed(2)} {currencySymbol}
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
                -{totalExpense.toFixed(2)} {currencySymbol}
              </Text>
            </View>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: dc.border }]} />
          <View style={styles.summaryNetRow}>
            <Text style={[styles.summaryNetLabel, { color: dc.textSecondary }]}>
              {t('recurring.net')}
            </Text>
            <Text style={[styles.summaryNetValue, { color: net >= 0 ? colors.income : colors.expense }]}>
              {net >= 0 ? '+' : ''}{net.toFixed(2)} {currencySymbol}
            </Text>
          </View>
        </View>

        {sortedRecurring.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🔄</Text>
            <Text style={[styles.emptyText, { color: dc.textPrimary }]}>
              {t('recurring.noRecurring')}
            </Text>
            <Text style={[styles.emptySubtext, { color: dc.textSecondary }]}>
              {t('recurring.noRecurringSubtitle')}
            </Text>
          </View>
        ) : (
          sortedRecurring.map((item) => (
            <RecurringCard
              key={item.id}
              item={item}
              onDelete={deleteRecurringMovement}
            />
          ))
        )}
      </ScrollView>

      <AddRecurringModal
        visible={showRecurringModal}
        onDismiss={() => setShowRecurringModal(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 100 },
  card: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 16, padding: 14, marginBottom: 10,
    borderWidth: 0.5, gap: 10,
  },
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