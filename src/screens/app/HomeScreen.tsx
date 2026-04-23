import React, { useMemo } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useMovementStore } from '../../store/movementStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useCategoryStore } from '../../store/categoryStore';
import { useSharedAccountStore } from '../../store/sharedAccountStore';
import { useSharedCategoryStore } from '../../store/sharedCategoryStore';
import { useSavingsStore } from '../../store/savingsStore';
import { useTheme } from '../../hooks/useTheme';
import { colors } from '../../theme';
import { MovementType } from '../../types';
import AppHeader from '../../components/common/AppHeader';

const BalanceCard = ({
  balance, month, year, currencySymbol,
}: {
  balance: number; month: number; year: number; currencySymbol: string;
}) => {
  const { t } = useTranslation();
  const { isDark, colors: dc } = useTheme();

  const bgColor = balance > 0
    ? dc.balanceCard
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
  label, amount, icon, color, currencySymbol, onPress,
}: {
  label: string; amount: number;
  icon: keyof typeof Ionicons.glyphMap;
  color: string; currencySymbol: string;
  onPress?: () => void;
}) => {
  const { colors: dc } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.summaryCard, { backgroundColor: dc.surface, borderColor: dc.border }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress}
    >
      <View style={[styles.summaryIcon, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={[styles.summaryAmount, { color: dc.textPrimary }]}>
        {amount.toFixed(2)} {currencySymbol}
      </Text>
      <Text style={[styles.summaryLabel, { color: dc.textSecondary }]}>{label}</Text>
    </TouchableOpacity>
  );
};

const HomeScreen = () => {
  const { t } = useTranslation();
  const { colors: dc } = useTheme();
  const { getCurrencySymbol } = useSettingsStore();
  const { getCategoryName } = useCategoryStore();
  const { isSharedMode, getSharedCurrencySymbol } = useSharedAccountStore();
  const { getSharedCategoryName } = useSharedCategoryStore();
  const navigation = useNavigation<any>();

  const { getMonthlySummary, getMovementsForSelectedMonth } = useMovementStore();
  const { huchaMovements } = useSavingsStore();

  const summary = getMonthlySummary();
  const monthMovements = getMovementsForSelectedMonth();
  const currencySymbol = isSharedMode ? getSharedCurrencySymbol() : getCurrencySymbol();

  const huchaNetThisMonth = useMemo(() => {
    return huchaMovements
      .filter(m => {
        const d = new Date(m.date);
        return d.getMonth() + 1 === summary.month && d.getFullYear() === summary.year;
      })
      .reduce((acc, m) => acc + (m.type === 'withdrawal' ? m.amount : -m.amount), 0);
  }, [huchaMovements, summary.month, summary.year]);

  const displayBalance = summary.balance + huchaNetThisMonth;

  const getCatName = (id: string, type: MovementType) =>
    isSharedMode ? getSharedCategoryName(id, type, t) : getCategoryName(id, type, t);

  const topExpenseCategories = useMemo(() => {
    const expenses = monthMovements.filter(m => m.type === 'expense');
    const byCategory: Record<string, number> = {};
    expenses.forEach(m => {
      byCategory[m.category] = (byCategory[m.category] ?? 0) + m.amount;
    });
    const total = summary.totalExpense;
    return Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: total > 0 ? (amount / total) * 100 : 0,
      }));
  }, [monthMovements, summary.totalExpense]);

  return (
    <View style={[styles.container, { backgroundColor: dc.background }]}>
      <AppHeader title={t('header.home')} showAccountSelector={true} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <BalanceCard
          balance={displayBalance}
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
            onPress={() => navigation.navigate('HistorialTab', { initialFilter: 'income' })}
          />
          <SummaryCard
            label={t('home.expenses')}
            amount={summary.totalExpense}
            icon="arrow-up-circle"
            color={colors.expense}
            currencySymbol={currencySymbol}
            onPress={() => navigation.navigate('HistorialTab', { initialFilter: 'expense' })}
          />
        </View>

        {/* TOP CATEGORÍAS DE GASTO */}
        <View style={styles.topSection}>
          <Text style={[styles.sectionTitle, { color: dc.textPrimary }]}>
            {t('home.whereMoneyGoes')}
          </Text>
          {topExpenseCategories.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: dc.surface, borderColor: dc.border }]}>
              <Text style={[styles.emptyText, { color: dc.textSecondary }]}>
                {t('home.noExpenses')}
              </Text>
            </View>
          ) : (
            topExpenseCategories.map(({ category, amount, percentage }) => (
              <View key={category} style={styles.categoryItem}>
                <View style={styles.categoryHeader}>
                  <Text style={[styles.categoryName, { color: dc.textPrimary }]} numberOfLines={1}>
                    {getCatName(category, 'expense')}
                  </Text>
                  <View style={styles.categoryRight}>
                    <Text style={[styles.categoryPercent, { color: dc.textSecondary }]}>
                      {Math.round(percentage)}%
                    </Text>
                    <Text style={[styles.categoryAmount, { color: colors.expense }]}>
                      {amount.toFixed(2)} {currencySymbol}
                    </Text>
                  </View>
                </View>
                <View style={[styles.barTrack, { backgroundColor: dc.border }]}>
                  <View
                    style={[
                      styles.barFill,
                      { width: `${percentage}%`, backgroundColor: colors.expense },
                    ]}
                  />
                </View>
              </View>
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
  summaryAmount: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', textAlign: 'center' },
  summaryLabel: { fontSize: 10, fontFamily: 'Poppins_400Regular', marginTop: 2, textAlign: 'center' },
  topSection: { paddingHorizontal: 16 },
  sectionTitle: { fontSize: 18, fontFamily: 'Poppins_600SemiBold', marginBottom: 16 },
  emptyCard: {
    borderRadius: 16, padding: 24, borderWidth: 0.5, alignItems: 'center',
  },
  emptyText: { fontSize: 13, fontFamily: 'Poppins_400Regular' },
  categoryItem: { marginBottom: 16 },
  categoryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  categoryName: { fontSize: 14, fontFamily: 'Poppins_500Medium', flex: 1, marginRight: 12 },
  categoryRight: { alignItems: 'flex-end' },
  categoryPercent: { fontSize: 11, fontFamily: 'Poppins_400Regular' },
  categoryAmount: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
  barTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
});

export default HomeScreen;
