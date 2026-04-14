import React, { useMemo, useState } from 'react';
import {
  View, StyleSheet, ScrollView,
  TouchableOpacity, Dimensions,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { BarChart } from 'react-native-gifted-charts';
import { useMovementStore } from '../../store/movementStore';
import { useSettingsStore } from '../../store/settingsStore';
import { usePremium } from '../../hooks/usePremium';
import { useTheme } from '../../hooks/useTheme';
import { colors } from '../../theme';
import AppHeader from '../../components/common/AppHeader';
import PremiumModal from '../../components/common/PremiumModal';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SHORT_MONTHS = ['E','F','M','A','M','J','J','A','S','O','N','D'];

const AnnualCard = ({
  label, amount, color, icon, currencySymbol,
}: {
  label: string; amount: number; color: string;
  icon: keyof typeof Ionicons.glyphMap; currencySymbol: string;
}) => {
  const { colors: dc } = useTheme();
  return (
    <View style={[styles.annualCard, {
      backgroundColor: dc.surface,
      borderLeftColor: color,
      borderColor: dc.border,
    }]}>
      <View style={[styles.annualCardIcon, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <View>
        <Text style={[styles.annualCardAmount, { color: dc.textPrimary }]}>
          {amount.toFixed(2)} {currencySymbol}
        </Text>
        <Text style={[styles.annualCardLabel, { color: dc.textSecondary }]}>{label}</Text>
      </View>
    </View>
  );
};

const AnnualScreen = () => {
  const { t } = useTranslation();
  const {
    selectedAnnualYear, setSelectedAnnualYear,
    getAnnualSummary, movements,
  } = useMovementStore();
  const { getCurrencySymbol } = useSettingsStore();
  const { isPremium, showModal, setShowModal, requirePremium } = usePremium();
  const { colors: dc } = useTheme();
  const currencySymbol = getCurrencySymbol();

  const [selectedMonth, setSelectedMonth] = useState<number | null>(
    new Date().getMonth() + 1
  );
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const annualData = getAnnualSummary();

  const MONTH_NAMES = [
    t('home.month_0'), t('home.month_1'), t('home.month_2'),
    t('home.month_3'), t('home.month_4'), t('home.month_5'),
    t('home.month_6'), t('home.month_7'), t('home.month_8'),
    t('home.month_9'), t('home.month_10'), t('home.month_11'),
  ];

  const monthMovements = useMemo(() => {
    if (!selectedMonth) return [];
    return movements.filter((m) => {
      const d = new Date(m.date);
      return d.getMonth() + 1 === selectedMonth &&
        d.getFullYear() === selectedAnnualYear;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [selectedMonth, movements, selectedAnnualYear]);

  const filteredMonthMovements = useMemo(() => {
    if (!selectedCategory) return monthMovements;
    return monthMovements.filter(m => m.category === selectedCategory);
  }, [monthMovements, selectedCategory]);

  const monthCategories = useMemo(() => {
    const cats = new Set(monthMovements.map(m => m.category));
    return Array.from(cats);
  }, [monthMovements]);

  const monthSummary = useMemo(() => ({
    income: filteredMonthMovements.filter(m => m.type === 'income').reduce((s, m) => s + m.amount, 0),
    expense: filteredMonthMovements.filter(m => m.type === 'expense').reduce((s, m) => s + m.amount, 0),
    saving: filteredMonthMovements.filter(m => m.type === 'saving').reduce((s, m) => s + m.amount, 0),
  }), [filteredMonthMovements]);

  const totals = useMemo(() => annualData.reduce(
    (acc, m) => ({
      income: acc.income + m.income,
      expense: acc.expense + m.expense,
      saving: acc.saving + m.saving,
      balance: acc.balance + m.balance,
    }),
    { income: 0, expense: 0, saving: 0, balance: 0 }
  ), [annualData]);

  const bestMonth = useMemo(() =>
    annualData.reduce((best, m) => m.balance > best.balance ? m : best, annualData[0]),
    [annualData]
  );

  const worstMonth = useMemo(() =>
    annualData.reduce((worst, m) => m.expense > worst.expense ? m : worst, annualData[0]),
    [annualData]
  );

  const hasData = totals.income > 0 || totals.expense > 0 || totals.saving > 0;

  const barData = annualData.flatMap((m, i) => [
    { value: m.income, label: SHORT_MONTHS[i], frontColor: colors.income, spacing: 2 },
    { value: m.expense, frontColor: colors.expense, spacing: 12 },
  ]);

  const handlePrevMonth = () => {
    if (selectedMonth === null) setSelectedMonth(12);
    else if (selectedMonth === 1) setSelectedMonth(null);
    else setSelectedMonth(selectedMonth - 1);
    setSelectedCategory(null);
  };

  const handleNextMonth = () => {
    if (selectedMonth === null) setSelectedMonth(1);
    else if (selectedMonth === 12) setSelectedMonth(null);
    else setSelectedMonth(selectedMonth + 1);
    setSelectedCategory(null);
  };

  const handleCategoryFilter = (cat: string) => {
    requirePremium(() => {
      setSelectedCategory(selectedCategory === cat ? null : cat);
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: dc.background }]}>
      <AppHeader title={t('header.annual')} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* SELECTORES AÑO Y MES */}
        <View style={styles.filtersRow}>
          <View style={styles.selectorRow}>
            <TouchableOpacity
              onPress={() => { setSelectedAnnualYear(selectedAnnualYear - 1); setSelectedMonth(null); }}
              style={[styles.selectorButton, { backgroundColor: dc.surface, borderColor: dc.border }]}
            >
              <Ionicons name="chevron-back" size={18} color={colors.primary} />
            </TouchableOpacity>
            <Text style={[styles.selectorText, { color: dc.textPrimary }]}>
              {selectedAnnualYear}
            </Text>
            <TouchableOpacity
              onPress={() => { setSelectedAnnualYear(selectedAnnualYear + 1); setSelectedMonth(null); }}
              style={[styles.selectorButton, { backgroundColor: dc.surface, borderColor: dc.border }]}
            >
              <Ionicons name="chevron-forward" size={18} color={colors.primary} />
            </TouchableOpacity>
          </View>

          <View style={styles.selectorRow}>
            <TouchableOpacity
              onPress={handlePrevMonth}
              style={[styles.selectorButton, { backgroundColor: dc.surface, borderColor: dc.border }]}
            >
              <Ionicons name="chevron-back" size={18} color={colors.primary} />
            </TouchableOpacity>
            <Text style={[styles.selectorText, { color: dc.textPrimary }]}>
              {selectedMonth ? MONTH_NAMES[selectedMonth - 1] : t('annual.allYear')}
            </Text>
            <TouchableOpacity
              onPress={handleNextMonth}
              style={[styles.selectorButton, { backgroundColor: dc.surface, borderColor: dc.border }]}
            >
              <Ionicons name="chevron-forward" size={18} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {!hasData ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📊</Text>
            <Text style={[styles.emptyText, { color: dc.textPrimary }]}>{t('annual.noData')}</Text>
            <Text style={[styles.emptySubtext, { color: dc.textSecondary }]}>
              {t('annual.noDataSubtitle')}
            </Text>
          </View>
        ) : (
          <>
            {/* GRÁFICA */}
            <View style={[styles.chartCard, { backgroundColor: dc.surface, borderColor: dc.border }]}>
              <Text style={[styles.sectionTitle, { color: dc.textPrimary }]}>
                {t('annual.monthlyChart')}
              </Text>
              <Text style={[styles.chartHint, { color: dc.textSecondary }]}>
                {t('annual.tapMonthHint')}
              </Text>
              <BarChart
                data={barData}
                barWidth={10}
                spacing={2}
                roundedTop
                hideRules
                xAxisThickness={1}
                yAxisThickness={0}
                xAxisColor={dc.border}
                yAxisTextStyle={{ color: dc.textSecondary, fontSize: 10 }}
                noOfSections={4}
                maxValue={
                  Math.max(...annualData.map((m) => Math.max(m.income, m.expense))) * 1.2 || 100
                }
                width={SCREEN_WIDTH - 80}
                height={180}
                labelWidth={24}
                xAxisLabelTextStyle={{ color: dc.textSecondary, fontSize: 9 }}
                backgroundColor={dc.surface}
              />
              <View style={styles.legend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: colors.income }]} />
                  <Text style={[styles.legendText, { color: dc.textSecondary }]}>
                    {t('annual.totalIncome')}
                  </Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: colors.expense }]} />
                  <Text style={[styles.legendText, { color: dc.textSecondary }]}>
                    {t('annual.totalExpenses')}
                  </Text>
                </View>
              </View>
            </View>

            {selectedMonth ? (
              <>
                <Text style={[styles.sectionTitle, { color: dc.textPrimary, marginBottom: 12 }]}>
                  {MONTH_NAMES[selectedMonth - 1]} {selectedAnnualYear}
                </Text>

                {/* FILTRO POR CATEGORÍA — Premium */}
                {monthCategories.length > 0 && (
                  <View style={styles.categoryFilterSection}>
                    <View style={styles.categoryFilterHeader}>
                      <Text style={[styles.categoryFilterTitle, { color: dc.textSecondary }]}>
                        {t('annual.filterByCategory') ?? 'Filtrar por categoría'}
                      </Text>
                      {!isPremium && (
                        <View style={styles.premiumBadge}>
                          <Text style={styles.premiumBadgeText}>⭐ PREMIUM</Text>
                        </View>
                      )}
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={styles.categoryChips}>
                        {monthCategories.map((cat) => (
                          <TouchableOpacity
                            key={cat}
                            style={[
                              styles.categoryChip,
                              { backgroundColor: dc.surface, borderColor: dc.border },
                              selectedCategory === cat && {
                                backgroundColor: colors.primary,
                                borderColor: colors.primary,
                              },
                              !isPremium && styles.categoryChipLocked,
                            ]}
                            onPress={() => handleCategoryFilter(cat)}
                          >
                            {!isPremium && (
                              <Ionicons name="lock-closed" size={10} color={dc.textSecondary} />
                            )}
                            <Text style={[
                              styles.categoryChipText,
                              { color: dc.textSecondary },
                              selectedCategory === cat && { color: '#FFFFFF' },
                            ]}>
                              {t(`movements.categories.${cat}`)}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                )}

                <AnnualCard
                  label={t('annual.totalIncome')} amount={monthSummary.income}
                  color={colors.income} icon="arrow-down-circle" currencySymbol={currencySymbol}
                />
                <AnnualCard
                  label={t('annual.totalExpenses')} amount={monthSummary.expense}
                  color={colors.expense} icon="arrow-up-circle" currencySymbol={currencySymbol}
                />
                <AnnualCard
                  label={t('annual.totalSavings')} amount={monthSummary.saving}
                  color={colors.savings} icon="save" currencySymbol={currencySymbol}
                />
                <AnnualCard
                  label={t('annual.netBalance')}
                  amount={monthSummary.income - monthSummary.expense - monthSummary.saving}
                  color={
                    (monthSummary.income - monthSummary.expense - monthSummary.saving) >= 0
                      ? colors.income : colors.expense
                  }
                  icon="wallet" currencySymbol={currencySymbol}
                />

                {filteredMonthMovements.length > 0 && (
                  <>
                    <Text style={[styles.sectionTitle, {
                      color: dc.textPrimary, marginTop: 8, marginBottom: 12,
                    }]}>
                      {t('home.recentMovements')}
                    </Text>
                    {filteredMonthMovements.map((m) => {
                      const isIncome = m.type === 'income';
                      const isSaving = m.type === 'saving';
                      const color = isIncome ? colors.income
                        : isSaving ? colors.savings : colors.expense;
                      const icon: keyof typeof Ionicons.glyphMap = isIncome
                        ? 'arrow-down-circle' : isSaving ? 'save' : 'arrow-up-circle';
                      return (
                        <View key={m.id} style={[styles.movementRow, {
                          backgroundColor: dc.surface, borderColor: dc.border,
                        }]}>
                          <View style={[styles.movementIcon, { backgroundColor: color + '20' }]}>
                            <Ionicons name={icon} size={18} color={color} />
                          </View>
                          <View style={styles.movementInfo}>
                            <Text style={[styles.movementDesc, { color: dc.textPrimary }]}>
                              {t(`movements.categories.${m.category}`)}
                            </Text>
                            <Text style={[styles.movementDate, { color: dc.textSecondary }]}>
                              {new Date(m.date).toLocaleDateString()}
                            </Text>
                          </View>
                          <Text style={[styles.movementAmount, { color }]}>
                            {isIncome ? '+' : '-'}{m.amount.toFixed(2)} {currencySymbol}
                          </Text>
                        </View>
                      );
                    })}
                  </>
                )}
              </>
            ) : (
              <>
                <Text style={[styles.sectionTitle, { color: dc.textPrimary, marginBottom: 12 }]}>
                  {t('annual.year')} {selectedAnnualYear}
                </Text>
                <AnnualCard
                  label={t('annual.totalIncome')} amount={totals.income}
                  color={colors.income} icon="arrow-down-circle" currencySymbol={currencySymbol}
                />
                <AnnualCard
                  label={t('annual.totalExpenses')} amount={totals.expense}
                  color={colors.expense} icon="arrow-up-circle" currencySymbol={currencySymbol}
                />
                <AnnualCard
                  label={t('annual.totalSavings')} amount={totals.saving}
                  color={colors.savings} icon="save" currencySymbol={currencySymbol}
                />
                <AnnualCard
                  label={t('annual.netBalance')}
                  amount={totals.balance}
                  color={totals.balance >= 0 ? colors.income : colors.expense}
                  icon="wallet" currencySymbol={currencySymbol}
                />
                <View style={styles.highlightsRow}>
                  <View style={[styles.highlightCard, {
                    backgroundColor: dc.surface, borderColor: colors.income,
                  }]}>
                    <Text style={styles.highlightEmoji}>🏆</Text>
                    <Text style={[styles.highlightLabel, { color: dc.textSecondary }]}>
                      {t('annual.bestMonth')}
                    </Text>
                    <Text style={[styles.highlightMonth, { color: colors.income }]}>
                      {t(`home.month_${bestMonth.month - 1}`)}
                    </Text>
                    <Text style={[styles.highlightAmount, { color: dc.textSecondary }]}>
                      +{bestMonth.balance.toFixed(0)} {currencySymbol}
                    </Text>
                  </View>
                  <View style={[styles.highlightCard, {
                    backgroundColor: dc.surface, borderColor: colors.expense,
                  }]}>
                    <Text style={styles.highlightEmoji}>📉</Text>
                    <Text style={[styles.highlightLabel, { color: dc.textSecondary }]}>
                      {t('annual.worstMonth')}
                    </Text>
                    <Text style={[styles.highlightMonth, { color: colors.expense }]}>
                      {t(`home.month_${worstMonth.month - 1}`)}
                    </Text>
                    <Text style={[styles.highlightAmount, { color: dc.textSecondary }]}>
                      -{worstMonth.expense.toFixed(0)} {currencySymbol}
                    </Text>
                  </View>
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>

      <PremiumModal
        visible={showModal}
        onDismiss={() => setShowModal(false)}
        onPurchase={() => setShowModal(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  filtersRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    gap: 12, marginBottom: 20,
  },
  selectorRow: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: 4,
  },
  selectorButton: {
    width: 32, height: 32, borderRadius: 10,
    borderWidth: 0.5, justifyContent: 'center', alignItems: 'center',
  },
  selectorText: {
    fontSize: 13, fontFamily: 'Poppins_600SemiBold',
    textAlign: 'center', flex: 1,
  },
  chartCard: { borderRadius: 20, padding: 16, marginBottom: 16, borderWidth: 0.5 },
  sectionTitle: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', marginBottom: 12 },
  chartHint: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginBottom: 12 },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, fontFamily: 'Poppins_400Regular' },
  categoryFilterSection: { marginBottom: 16 },
  categoryFilterHeader: {
    flexDirection: 'row', alignItems: 'center',
    gap: 8, marginBottom: 10,
  },
  categoryFilterTitle: {
    fontSize: 12, fontFamily: 'Poppins_600SemiBold',
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  premiumBadge: {
    backgroundColor: colors.savings + '20',
    borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2,
  },
  premiumBadgeText: {
    fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: colors.savings,
  },
  categoryChips: { flexDirection: 'row', gap: 8 },
  categoryChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 0.5,
  },
  categoryChipLocked: { opacity: 0.6 },
  categoryChipText: { fontSize: 12, fontFamily: 'Poppins_500Medium' },
  annualCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 16, padding: 16, marginBottom: 10,
    borderLeftWidth: 4, borderWidth: 0.5, gap: 14,
  },
  annualCardIcon: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
  },
  annualCardAmount: { fontSize: 18, fontFamily: 'Poppins_700Bold' },
  annualCardLabel: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 2 },
  highlightsRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  highlightCard: {
    flex: 1, borderRadius: 16, padding: 16,
    alignItems: 'center', borderWidth: 1.5,
  },
  highlightEmoji: { fontSize: 28, marginBottom: 8 },
  highlightLabel: {
    fontSize: 12, fontFamily: 'Poppins_400Regular',
    marginBottom: 4, textAlign: 'center',
  },
  highlightMonth: { fontSize: 16, fontFamily: 'Poppins_700Bold', marginBottom: 4 },
  highlightAmount: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
  movementRow: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 16, padding: 12, marginBottom: 8, borderWidth: 0.5,
  },
  movementIcon: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center', marginRight: 10,
  },
  movementInfo: { flex: 1 },
  movementDesc: { fontSize: 13, fontFamily: 'Poppins_500Medium' },
  movementDate: { fontSize: 11, fontFamily: 'Poppins_400Regular', marginTop: 2 },
  movementAmount: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
  emptyState: { alignItems: 'center', paddingVertical: 80 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyText: { fontSize: 18, fontFamily: 'Poppins_600SemiBold', marginBottom: 8 },
  emptySubtext: {
    fontSize: 13, fontFamily: 'Poppins_400Regular',
    textAlign: 'center', paddingHorizontal: 32,
  },
});

export default AnnualScreen;