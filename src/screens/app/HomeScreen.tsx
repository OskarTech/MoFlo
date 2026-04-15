import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useMovementStore } from '../../store/movementStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useCategoryStore } from '../../store/categoryStore';
import { useTheme } from '../../hooks/useTheme';
import { colors } from '../../theme';
import { Movement } from '../../types';
import AppHeader from '../../components/common/AppHeader';
import { formatDate } from '../../utils/dateFormat';

const BalanceCard = ({
  balance, month, year, currencySymbol,
}: {
  balance: number; month: number; year: number; currencySymbol: string;
}) => {
  const { t } = useTranslation();
  const { isDark } = useTheme();

  const bgColor = balance > 0
    ? isDark ? '#065F46' : '#166534'
    : balance < 0
    ? isDark ? '#7F1D1D' : '#991B1B'
    : isDark ? '#1F2937' : '#1F2937';

  return (
    <View style={[styles.balanceCard, { backgroundColor: bgColor }]}>
      <Text style={styles.balanceMonth}>
        {t(`home.month_${month - 1}`)} {year}
      </Text>
      <Text style={styles.balanceLabel}>{t('home.balance')}</Text>
      <Text style={styles.balanceAmount}>
        {balance >= 0 ? '+' : ''}{balance.toFixed(2)} {currencySymbol}
      </Text>
    </View>
  );
};

const SummaryCard = ({
  label, amount, icon, color, currencySymbol,
}: {
  label: string; amount: number;
  icon: keyof typeof Ionicons.glyphMap;
  color: string; currencySymbol: string;
}) => {
  const { colors: dc } = useTheme();
  return (
    <View style={[styles.summaryCard, { backgroundColor: dc.surface, borderColor: dc.border }]}>
      <View style={[styles.summaryIcon, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={[styles.summaryAmount, { color: dc.textPrimary }]}>
        {amount.toFixed(2)} {currencySymbol}
      </Text>
      <Text style={[styles.summaryLabel, { color: dc.textSecondary }]}>{label}</Text>
    </View>
  );
};

const MovementRow = ({ movement }: { movement: Movement }) => {
  const { t } = useTranslation();
  const { getCurrencySymbol } = useSettingsStore();
  const { getCategoryName } = useCategoryStore();
  const { colors: dc } = useTheme();
  const currencySymbol = getCurrencySymbol();
  const isIncome = movement.type === 'income';
  const isSaving = movement.type === 'saving';
  const color = isIncome ? colors.income : isSaving ? colors.savings : colors.expense;
  const icon: keyof typeof Ionicons.glyphMap = isIncome
    ? 'arrow-down-circle' : isSaving ? 'save' : 'arrow-up-circle';

  return (
    <View style={[styles.movementRow, { backgroundColor: dc.surface, borderColor: dc.border }]}>
      <View style={[styles.movementIcon, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <View style={styles.movementInfo}>
        <Text style={[styles.movementDescription, { color: dc.textPrimary }]} numberOfLines={1}>
          {getCategoryName(movement.category, movement.type, t)}
        </Text>
        <Text style={[styles.movementDate, { color: dc.textSecondary }]}>
          {formatDate(movement.date)}
        </Text>
      </View>
      <Text style={[styles.movementAmount, { color }]}>
        {isIncome ? '+' : '-'}{movement.amount.toFixed(2)} {currencySymbol}
      </Text>
    </View>
  );
};

const HomeScreen = () => {
  const { t } = useTranslation();
  const { getMonthlySummary, getRecentMovements } = useMovementStore();
  const { getCurrencySymbol } = useSettingsStore();
  const { colors: dc } = useTheme();

  const summary = getMonthlySummary();
  const recentMovements = getRecentMovements(5);
  const currencySymbol = getCurrencySymbol();

  return (
    <View style={[styles.container, { backgroundColor: dc.background }]}>
      <AppHeader title={t('header.home')} showAccountSelector={true} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <BalanceCard
          balance={summary.balance}
          month={summary.month}
          year={summary.year}
          currencySymbol={currencySymbol}
        />

        <View style={styles.summaryRow}>
          <SummaryCard
            label={t('home.income')}
            amount={summary.totalIncome}
            icon="arrow-down-circle"
            color={colors.income}
            currencySymbol={currencySymbol}
          />
          <SummaryCard
            label={t('home.expenses')}
            amount={summary.totalExpense}
            icon="arrow-up-circle"
            color={colors.expense}
            currencySymbol={currencySymbol}
          />
          <SummaryCard
            label={t('home.savings')}
            amount={summary.totalSavings}
            icon="save"
            color={colors.savings}
            currencySymbol={currencySymbol}
          />
        </View>

        <View style={styles.recentSection}>
          <Text style={[styles.sectionTitle, { color: dc.textPrimary }]}>
            {t('home.recentMovements')}
          </Text>
          {recentMovements.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>💸</Text>
              <Text style={[styles.emptyText, { color: dc.textPrimary }]}>
                {t('home.noMovements')}
              </Text>
              <Text style={[styles.emptySubtext, { color: dc.textSecondary }]}>
                {t('home.noMovementsSubtitle')}
              </Text>
            </View>
          ) : (
            recentMovements.map((movement) => (
              <MovementRow key={movement.id} movement={movement} />
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 100 },
  balanceCard: {
    margin: 16, borderRadius: 24, padding: 28,
    alignItems: 'center', overflow: 'hidden',
    elevation: 8, shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8,
  },
  balanceMonth: {
    color: 'rgba(255,255,255,0.6)', fontSize: 12,
    fontFamily: 'Poppins_500Medium', textTransform: 'uppercase',
    letterSpacing: 1.5, marginBottom: 8,
  },
  balanceLabel: {
    color: 'rgba(255,255,255,0.6)', fontSize: 13,
    fontFamily: 'Poppins_400Regular', marginBottom: 4,
  },
  balanceAmount: {
    color: '#FFFFFF', fontSize: 40,
    fontFamily: 'Poppins_700Bold', letterSpacing: -1,
  },
  summaryRow: {
    flexDirection: 'row', paddingHorizontal: 16,
    gap: 10, marginBottom: 24,
  },
  summaryCard: {
    flex: 1, borderRadius: 16, padding: 14,
    alignItems: 'center', borderWidth: 0.5,
  },
  summaryIcon: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  summaryAmount: {
    fontSize: 13, fontFamily: 'Poppins_600SemiBold', textAlign: 'center',
  },
  summaryLabel: {
    fontSize: 10, fontFamily: 'Poppins_400Regular',
    marginTop: 2, textAlign: 'center',
  },
  recentSection: { paddingHorizontal: 16 },
  sectionTitle: {
    fontSize: 18, fontFamily: 'Poppins_600SemiBold', marginBottom: 16,
  },
  movementRow: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 16, padding: 14, marginBottom: 8, borderWidth: 0.5,
  },
  movementIcon: {
    width: 42, height: 42, borderRadius: 21,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  movementInfo: { flex: 1 },
  movementDescription: {
    fontSize: 14, fontFamily: 'Poppins_500Medium',
  },
  movementDate: {
    fontSize: 11, fontFamily: 'Poppins_400Regular', marginTop: 2,
  },
  movementAmount: { fontSize: 14, fontFamily: 'Poppins_600SemiBold' },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyText: { fontSize: 18, fontFamily: 'Poppins_600SemiBold', marginBottom: 8 },
  emptySubtext: {
    fontSize: 13, fontFamily: 'Poppins_400Regular', textAlign: 'center',
  },
});

export default HomeScreen;