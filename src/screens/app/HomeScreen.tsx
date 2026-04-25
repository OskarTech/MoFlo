import React, { useMemo } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
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
import AppHeader from '../../components/common/AppHeader';

const BalanceCard = ({
  balance, month, currencySymbol, totalIncome, totalExpense, onPressIncome, onPressExpense,
}: {
  balance: number; month: number; currencySymbol: string;
  totalIncome: number; totalExpense: number;
  onPressIncome: () => void; onPressExpense: () => void;
}) => {
  const { t } = useTranslation();
  const { colors: dc } = useTheme();
  const { colorPalette } = useSettingsStore();

  const spentPct = totalIncome > 0 ? Math.min(100, Math.round((totalExpense / totalIncome) * 100)) : 0;
  const absBalance = Math.abs(balance);
  const [intPart, decPart] = absBalance.toFixed(2).replace('.', ',').split(',');

  return (
    <View style={[styles.balanceCard, { backgroundColor: colorPalette === 'earth' ? '#2D4A3E' : dc.balanceCard }]}>
      <Text style={styles.balanceLabelTop}>{t('home.availableBalance').toUpperCase()}</Text>
      <View style={styles.balanceAmountRow}>
        {balance < 0 && <Text style={styles.balanceSign}>-</Text>}
        <Text style={styles.balanceInt} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.4}>{intPart}</Text>
        <Text style={styles.balanceDec}>,{decPart} {currencySymbol}</Text>
      </View>
      <View style={styles.progressRow}>
        <Text style={styles.progressMonth}>{t(`home.month_${month - 1}`)}</Text>
        {totalIncome > 0 && (
          <Text style={styles.progressPct}>{spentPct}% {t('home.ofIncomeSpent')}</Text>
        )}
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${spentPct}%` as any }]} />
      </View>
      <View style={styles.statsRow}>
        <TouchableOpacity onPress={onPressIncome} activeOpacity={0.7}>
          <View style={styles.statLabelRow}>
            <View style={[styles.statDot, { backgroundColor: colors.income }]} />
            <Text style={styles.statLabelText}>{t('home.income').toUpperCase()}</Text>
          </View>
          <Text style={styles.statAmount}>+{totalIncome.toFixed(2).replace('.', ',')} {currencySymbol}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onPressExpense} activeOpacity={0.7}>
          <View style={styles.statLabelRow}>
            <View style={[styles.statDot, { backgroundColor: colors.expense }]} />
            <Text style={styles.statLabelText}>{t('home.expenses').toUpperCase()}</Text>
          </View>
          <Text style={styles.statAmount}>-{totalExpense.toFixed(2).replace('.', ',')} {currencySymbol}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};


const HomeScreen = () => {
  const { t } = useTranslation();
  const { colors: dc } = useTheme();
  const { getCurrencySymbol, displayName, language } = useSettingsStore();
  const { getCategoryName, getCategoriesForType } = useCategoryStore();
  const { isSharedMode, getSharedCurrencySymbol } = useSharedAccountStore();
  const { getSharedCategoryName, getSharedCategoriesForType } = useSharedCategoryStore();
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

  const getCatIcon = (id: string): keyof typeof Ionicons.glyphMap => {
    const cats = isSharedMode
      ? getSharedCategoriesForType('expense')
      : getCategoriesForType('expense');
    return ((cats.find(c => c.id === id)?.icon ?? 'ellipsis-horizontal') + '-outline') as keyof typeof Ionicons.glyphMap;
  };

  const CAT_COLORS = ['#E8735A', '#4A6FD9', '#7BC67E', '#F5A623', '#9B59B6', '#E74C3C', '#2ECC71', '#F39C12'];

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
        {(() => {
          const today = new Date();
          const locale = language === 'pl' ? 'pl-PL' : language === 'en' ? 'en-US' : 'es-ES';
          const dayName = today.toLocaleDateString(locale, { weekday: 'long' }).toUpperCase();
          const monthName = t(`home.month_${today.getMonth()}`).toUpperCase();
          return (
            <View style={styles.dateHeader}>
              <Text style={[styles.dateText, { color: dc.textSecondary }]}>
                {dayName} · {today.getDate()} {monthName}
              </Text>
              <Text style={[styles.greetingText, { color: dc.textPrimary }]}>
                {t('home.hello')}, {displayName || 'Usuario'}
              </Text>
            </View>
          );
        })()}

        <BalanceCard
          balance={displayBalance}
          month={summary.month}
          currencySymbol={currencySymbol}
          totalIncome={summary.totalIncome}
          totalExpense={summary.totalExpense}
          onPressIncome={() => navigation.navigate('HistorialTab', { initialFilter: 'income' })}
          onPressExpense={() => navigation.navigate('HistorialTab', { initialFilter: 'expense' })}
        />

        {/* TOP CATEGORÍAS DE GASTO */}
        <View style={styles.topSection}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: dc.textPrimary }]}>
              {t('home.whereMoneyGoes')}
            </Text>
            <Text style={[styles.sectionMonth, { color: dc.textSecondary }]}>
              {t(`home.month_${summary.month - 1}`)}
            </Text>
          </View>
          {topExpenseCategories.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: dc.surface, borderColor: dc.border }]}>
              <Text style={[styles.emptyText, { color: dc.textSecondary }]}>
                {t('home.noExpenses')}
              </Text>
            </View>
          ) : (
            <View style={[styles.catCard, { backgroundColor: dc.surface, borderColor: dc.border }]}>
              {topExpenseCategories.map(({ category, amount, percentage }, index) => {
                const catColor = CAT_COLORS[index % CAT_COLORS.length];
                return (
                  <View key={category}>
                    {index > 0 && <View style={[styles.catDivider, { backgroundColor: dc.border }]} />}
                    <View style={styles.catRow}>
                      <View style={[styles.catIconCircle, { backgroundColor: catColor + '20' }]}>
                        <Ionicons name={getCatIcon(category)} size={18} color={catColor} />
                      </View>
                      <View style={styles.catContent}>
                        <View style={styles.catHeader}>
                          <Text style={[styles.categoryName, { color: dc.textPrimary }]} numberOfLines={1}>
                            {getCatName(category, 'expense')}
                          </Text>
                          <Text style={[styles.categoryAmount, { color: dc.textPrimary }]}>
                            {amount.toFixed(2)} {currencySymbol}
                          </Text>
                        </View>
                        <View style={[styles.barTrack, { backgroundColor: dc.border }]}>
                          <View style={[styles.barFill, { width: `${percentage}%`, backgroundColor: catColor }]} />
                        </View>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 100 },

  // Date header
  dateHeader: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  dateText: { fontSize: 12, fontFamily: 'Poppins_500Medium', letterSpacing: 0.5, marginBottom: 4 },
  greetingText: { fontSize: 26, fontFamily: 'Poppins_700Bold' },

  // Balance card
  balanceCard: {
    marginHorizontal: 16, marginBottom: 20, borderRadius: 24, padding: 24,
    overflow: 'hidden', elevation: 6, shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6,
  },
  balanceLabelTop: {
    color: 'rgba(255,255,255,0.6)', fontSize: 11,
    fontFamily: 'Poppins_600SemiBold', letterSpacing: 1.5, marginBottom: 12,
  },
  balanceAmountRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 20 },
  balanceSign: {
    color: '#FFFFFF', fontSize: 40, fontFamily: 'Poppins_700Bold',
    lineHeight: 52, marginRight: 2,
  },
  balanceInt: {
    color: '#FFFFFF', fontSize: 52, fontFamily: 'Poppins_700Bold',
    letterSpacing: -2, lineHeight: Platform.OS === 'ios' ? 66 : 56, flexShrink: 1,
  },
  balanceDec: {
    color: 'rgba(255,255,255,0.8)', fontSize: 26,
    fontFamily: 'Poppins_500Medium', marginBottom: 5, marginLeft: 1,
  },
  progressRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6,
  },
  progressMonth: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontFamily: 'Poppins_500Medium' },
  progressPct: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontFamily: 'Poppins_400Regular' },
  progressTrack: {
    height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: 20, overflow: 'hidden',
  },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: colors.income },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 },
  statDot: { width: 6, height: 6, borderRadius: 3 },
  statLabelText: {
    color: 'rgba(255,255,255,0.7)', fontSize: 10,
    fontFamily: 'Poppins_600SemiBold', letterSpacing: 0.8,
  },
  statAmount: { color: '#FFFFFF', fontSize: 16, fontFamily: 'Poppins_700Bold' },
  topSection: { paddingHorizontal: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontFamily: 'Poppins_600SemiBold' },
  sectionMonth: { fontSize: 13, fontFamily: 'Poppins_500Medium' },
  emptyCard: { borderRadius: 16, padding: 24, borderWidth: 0.5, alignItems: 'center' },
  emptyText: { fontSize: 13, fontFamily: 'Poppins_400Regular' },
  catCard: { borderRadius: 16, borderWidth: 0.5, overflow: 'hidden' },
  catRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
  catIconCircle: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  catContent: { flex: 1 },
  catHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  catDivider: { height: 0.5, marginLeft: 66 },
  categoryName: { fontSize: 14, fontFamily: 'Poppins_500Medium', flex: 1, marginRight: 8 },
  categoryAmount: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
  barTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },

});

export default HomeScreen;
