import React, { useMemo } from 'react';
import {
  View, StyleSheet, ScrollView,
  TouchableOpacity, Dimensions,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { BarChart } from 'react-native-gifted-charts';
import { useMovementStore } from '../../store/movementStore';
import { useTheme } from '../../hooks/useTheme';
import { colors } from '../../theme';
import AppHeader from '../../components/common/AppHeader';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SHORT_MONTHS = ['E','F','M','A','M','J','J','A','S','O','N','D'];

const AnnualCard = ({
  label, amount, color, icon,
}: {
  label: string; amount: number; color: string;
  icon: keyof typeof Ionicons.glyphMap;
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
          {amount.toFixed(2)} €
        </Text>
        <Text style={[styles.annualCardLabel, { color: dc.textSecondary }]}>{label}</Text>
      </View>
    </View>
  );
};

const AnnualScreen = () => {
  const { t } = useTranslation();
  const { selectedAnnualYear, setSelectedAnnualYear, getAnnualSummary } = useMovementStore();
  const { isDark, colors: dc } = useTheme();

  const annualData = getAnnualSummary();

  const totals = useMemo(() => {
    return annualData.reduce(
      (acc, m) => ({
        income: acc.income + m.income,
        expense: acc.expense + m.expense,
        saving: acc.saving + m.saving,
        balance: acc.balance + m.balance,
      }),
      { income: 0, expense: 0, saving: 0, balance: 0 }
    );
  }, [annualData]);

  const bestMonth = useMemo(() => {
    return annualData.reduce((best, m) =>
      m.balance > best.balance ? m : best, annualData[0]);
  }, [annualData]);

  const worstMonth = useMemo(() => {
    return annualData.reduce((worst, m) =>
      m.expense > worst.expense ? m : worst, annualData[0]);
  }, [annualData]);

  const hasData = totals.income > 0 || totals.expense > 0 || totals.saving > 0;

  const barData = annualData.flatMap((m, i) => [
    { value: m.income, label: SHORT_MONTHS[i], frontColor: colors.income, spacing: 2 },
    { value: m.expense, frontColor: colors.expense, spacing: 12 },
  ]);

  return (
    <View style={[styles.container, { backgroundColor: dc.background }]}>
      <AppHeader title={t('header.annual')} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* SELECTOR DE AÑO */}
        <View style={styles.yearRow}>
          <TouchableOpacity
            onPress={() => setSelectedAnnualYear(selectedAnnualYear - 1)}
            style={[styles.yearButton, { backgroundColor: dc.surface, borderColor: dc.border }]}
          >
            <Ionicons name="chevron-back" size={20} color={colors.primary} />
          </TouchableOpacity>
          <Text style={[styles.yearText, { color: dc.textPrimary }]}>{selectedAnnualYear}</Text>
          <TouchableOpacity
            onPress={() => setSelectedAnnualYear(selectedAnnualYear + 1)}
            style={[styles.yearButton, { backgroundColor: dc.surface, borderColor: dc.border }]}
          >
            <Ionicons name="chevron-forward" size={20} color={colors.primary} />
          </TouchableOpacity>
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

            {/* TOTALES */}
            <Text style={[styles.sectionTitle, { color: dc.textPrimary, marginBottom: 12 }]}>
              {t('annual.year')} {selectedAnnualYear}
            </Text>
            <AnnualCard label={t('annual.totalIncome')} amount={totals.income}
              color={colors.income} icon="arrow-down-circle" />
            <AnnualCard label={t('annual.totalExpenses')} amount={totals.expense}
              color={colors.expense} icon="arrow-up-circle" />
            <AnnualCard label={t('annual.totalSavings')} amount={totals.saving}
              color={colors.savings} icon="save" />
            <AnnualCard
              label={t('annual.netBalance')}
              amount={totals.balance}
              color={totals.balance >= 0 ? colors.income : colors.expense}
              icon="wallet"
            />

            {/* MEJOR / PEOR MES */}
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
                  +{bestMonth.balance.toFixed(0)} €
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
                  -{worstMonth.expense.toFixed(0)} €
                </Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  yearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 20,
  },
  yearButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 0.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  yearText: {
    fontSize: 20,
    fontFamily: 'Poppins_700Bold',
    minWidth: 60,
    textAlign: 'center',
  },
  chartCard: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
    borderWidth: 0.5,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
    marginBottom: 12,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginTop: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
  },
  annualCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderWidth: 0.5,
    gap: 14,
  },
  annualCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  annualCardAmount: {
    fontSize: 18,
    fontFamily: 'Poppins_700Bold',
  },
  annualCardLabel: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    marginTop: 2,
  },
  highlightsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  highlightCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  highlightEmoji: { fontSize: 28, marginBottom: 8 },
  highlightLabel: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    marginBottom: 4,
    textAlign: 'center',
  },
  highlightMonth: {
    fontSize: 16,
    fontFamily: 'Poppins_700Bold',
    marginBottom: 4,
  },
  highlightAmount: {
    fontSize: 13,
    fontFamily: 'Poppins_600SemiBold',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyText: {
    fontSize: 18,
    fontFamily: 'Poppins_600SemiBold',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});

export default AnnualScreen;