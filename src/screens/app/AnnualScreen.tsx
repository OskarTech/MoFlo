import React, { useState, useMemo } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Circle } from 'react-native-svg';
import { useMovementStore } from '../../store/movementStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useCategoryStore } from '../../store/categoryStore';
import { useSharedAccountStore } from '../../store/sharedAccountStore';
import { useSharedCategoryStore } from '../../store/sharedCategoryStore';
import { useSavingsStore } from '../../store/savingsStore';
import { useTheme } from '../../hooks/useTheme';
import { MovementType } from '../../types';
import AppHeader from '../../components/common/AppHeader';

type SummaryTab = 'expense' | 'income' | 'hucha';

const CAT_COLORS = [
  '#E8735A', '#4A6FD9', '#7BC67E', '#F5A623',
  '#9B59B6', '#E74C3C', '#2ECC71', '#F39C12',
  '#1ABC9C', '#E67E22', '#3498DB', '#8E44AD',
];

const FLOW_BAR_H = 72;
const STACK_BAR_H = 80;

// ── DONUT CHART ──────────────────────────────────────────────────────────────
const DonutChart = ({
  data, size = 152, innerRadius = 50, children,
}: {
  data: { value: number; color: string }[];
  size?: number;
  innerRadius?: number;
  children?: React.ReactNode;
}) => {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;

  const r = size / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;

  const centerOverlay = children ? (
    <View style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      justifyContent: 'center', alignItems: 'center',
    }}>
      {children}
    </View>
  ) : null;

  if (data.length === 1) {
    const strokeW = r - innerRadius;
    return (
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle
            cx={cx} cy={cy}
            r={(r + innerRadius) / 2}
            fill="none"
            stroke={data[0].color}
            strokeWidth={strokeW}
          />
        </Svg>
        {centerOverlay}
      </View>
    );
  }

  let angle = -Math.PI / 2;
  const paths = data.map((item) => {
    const portion = item.value / total;
    const startA = angle;
    const endA = angle + portion * 2 * Math.PI;
    angle = endA;

    const x1 = cx + r * Math.cos(startA);
    const y1 = cy + r * Math.sin(startA);
    const x2 = cx + r * Math.cos(endA);
    const y2 = cy + r * Math.sin(endA);
    const x3 = cx + innerRadius * Math.cos(endA);
    const y3 = cy + innerRadius * Math.sin(endA);
    const x4 = cx + innerRadius * Math.cos(startA);
    const y4 = cy + innerRadius * Math.sin(startA);
    const large = portion > 0.5 ? 1 : 0;

    return {
      color: item.color,
      d: `M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large},1 ${x2.toFixed(2)},${y2.toFixed(2)} L${x3.toFixed(2)},${y3.toFixed(2)} A${innerRadius},${innerRadius} 0 ${large},0 ${x4.toFixed(2)},${y4.toFixed(2)} Z`,
    };
  });

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {paths.map((p, i) => <Path key={i} d={p.d} fill={p.color} />)}
      </Svg>
      {centerOverlay}
    </View>
  );
};

// ── MAIN SCREEN ───────────────────────────────────────────────────────────────
const AnnualScreen = () => {
  const { t } = useTranslation();
  const { colors: dc } = useTheme();
  const { getCurrencySymbol } = useSettingsStore();
  const { getCategoryName, getCategoriesForType } = useCategoryStore();
  const { isSharedMode, getSharedCurrencySymbol } = useSharedAccountStore();
  const { getSharedCategoryName, getSharedCategoriesForType } = useSharedCategoryStore();
  const { huchas, huchaMovements } = useSavingsStore();
  const { movements } = useMovementStore();

  // Local period state — independent of HomeScreen
  const nowDate = new Date();
  const [selectedMonth, setSelectedMonthLocal] = useState(nowDate.getMonth() + 1);
  const [selectedYear, setSelectedYearLocal] = useState(nowDate.getFullYear());
  const [activeTab, setActiveTab] = useState<SummaryTab>('expense');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const selectPeriod = (month: number, year: number) => {
    setSelectedMonthLocal(month);
    setSelectedYearLocal(year);
  };

  const currencySymbol = isSharedMode ? getSharedCurrencySymbol() : getCurrencySymbol();

  const getCatName = (id: string, type: MovementType) =>
    isSharedMode ? getSharedCategoryName(id, type, t) : getCategoryName(id, type, t);

  const getCatIcon = (id: string, type: MovementType): keyof typeof Ionicons.glyphMap => {
    const cats = isSharedMode ? getSharedCategoriesForType(type) : getCategoriesForType(type);
    return ((cats.find(c => c.id === id)?.icon ?? 'ellipsis-horizontal') + '-outline') as keyof typeof Ionicons.glyphMap;
  };

  const shortMonth = (m: number) => t(`home.month_${m - 1}`).slice(0, 3);
  const fullMonth = (m: number) => t(`home.month_${m - 1}`);

  // ── MONTH CHIPS (last 12) ─────────────────────────────────────────────────
  const monthChips = useMemo(() => {
    const result: { month: number; year: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(nowDate.getFullYear(), nowDate.getMonth() - i, 1);
      result.push({ month: d.getMonth() + 1, year: d.getFullYear() });
    }
    return result;
  }, []);

  // ── SELECTED MONTH DATA ────────────────────────────────────────────────────
  const monthMovements = useMemo(() =>
    movements.filter(m => {
      const d = new Date(m.date);
      return d.getMonth() + 1 === selectedMonth && d.getFullYear() === selectedYear;
    }),
    [movements, selectedMonth, selectedYear],
  );

  const totalIncome = useMemo(() =>
    monthMovements.filter(m => m.type === 'income').reduce((s, m) => s + m.amount, 0),
    [monthMovements],
  );
  const totalExpense = useMemo(() =>
    monthMovements.filter(m => m.type === 'expense').reduce((s, m) => s + m.amount, 0),
    [monthMovements],
  );
  const huchaNetForMonth = useMemo(() =>
    huchaMovements
      .filter(m => {
        const d = new Date(m.date);
        return d.getMonth() + 1 === selectedMonth && d.getFullYear() === selectedYear;
      })
      .reduce((acc, m) => acc + (m.type === 'withdrawal' ? m.amount : -m.amount), 0),
    [huchaMovements, selectedMonth, selectedYear],
  );
  const balance = totalIncome - totalExpense + huchaNetForMonth;
  const savedPct = totalIncome > 0
    ? Math.round((balance / totalIncome) * 100)
    : 0;

  // ── EXPENSE BREAKDOWN ─────────────────────────────────────────────────────
  const expenseBreakdown = useMemo(() => {
    const byCategory: Record<string, number> = {};
    monthMovements
      .filter(m => m.type === 'expense')
      .forEach(m => { byCategory[m.category] = (byCategory[m.category] ?? 0) + m.amount; });
    return Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([category, amount], i) => ({
        category,
        amount,
        percentage: totalExpense > 0 ? (amount / totalExpense) * 100 : 0,
        color: CAT_COLORS[i % CAT_COLORS.length],
      }));
  }, [monthMovements, totalExpense]);

  // ── INCOME MOVEMENTS ──────────────────────────────────────────────────────
  const incomeMovements = useMemo(() =>
    monthMovements
      .filter(m => m.type === 'income')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [monthMovements],
  );

  // ── MONTHLY FLOW (last 12 months) ─────────────────────────────────────────
  const flowData = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(nowDate.getFullYear(), nowDate.getMonth() - (11 - i), 1);
      const m = d.getMonth() + 1;
      const y = d.getFullYear();
      const mMovs = movements.filter(mv => {
        const md = new Date(mv.date);
        return md.getMonth() + 1 === m && md.getFullYear() === y;
      });
      return {
        month: m, year: y,
        income: mMovs.filter(mv => mv.type === 'income').reduce((s, mv) => s + mv.amount, 0),
        expense: mMovs.filter(mv => mv.type === 'expense').reduce((s, mv) => s + mv.amount, 0),
        label: shortMonth(m),
        isSelected: m === selectedMonth && y === selectedYear,
      };
    });
  }, [movements, selectedMonth, selectedYear]);

  const flowMax = useMemo(() =>
    Math.max(1, ...flowData.map(d => Math.max(d.income, d.expense))),
    [flowData],
  );

  // ── HUCHAS DATA ────────────────────────────────────────────────────────────
  const currentMonth = nowDate.getMonth() + 1;
  const currentYear = nowDate.getFullYear();

  const getHuchaThisMonth = (huchaId: string) =>
    huchaMovements
      .filter(m => m.huchaId === huchaId && m.type === 'deposit')
      .filter(m => {
        const d = new Date(m.date);
        return d.getMonth() + 1 === currentMonth && d.getFullYear() === currentYear;
      })
      .reduce((s, m) => s + m.amount, 0);

  const getHuchaThisYear = (huchaId: string) =>
    huchaMovements
      .filter(m => m.huchaId === huchaId && m.type === 'deposit' && new Date(m.date).getFullYear() === currentYear)
      .reduce((s, m) => s + m.amount, 0);

  const getHuchaStreak = (huchaId: string): number => {
    let streak = 0;
    let mo = nowDate.getMonth();
    let yr = nowDate.getFullYear();
    for (let i = 0; i < 24; i++) {
      const hasDeposit = huchaMovements.some(m => {
        if (m.huchaId !== huchaId || m.type !== 'deposit') return false;
        const d = new Date(m.date);
        return d.getMonth() === mo && d.getFullYear() === yr;
      });
      if (!hasDeposit) break;
      streak++;
      mo--;
      if (mo < 0) { mo = 11; yr--; }
    }
    return streak;
  };

  // Stacked bar data: last 6 months
  const huchasFlowData = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(nowDate.getFullYear(), nowDate.getMonth() - (5 - i), 1);
      const m = d.getMonth() + 1;
      const y = d.getFullYear();
      const deposits: Record<string, number> = {};
      huchaMovements
        .filter(mv => mv.type === 'deposit')
        .filter(mv => {
          const md = new Date(mv.date);
          return md.getMonth() + 1 === m && md.getFullYear() === y;
        })
        .forEach(mv => { deposits[mv.huchaId] = (deposits[mv.huchaId] ?? 0) + mv.amount; });
      return { month: m, year: y, label: shortMonth(m), deposits };
    });
  }, [huchaMovements]);

  const huchasBarMax = useMemo(() =>
    Math.max(1, ...huchasFlowData.map(d =>
      Object.values(d.deposits).reduce((s, v) => s + v, 0)
    )),
    [huchasFlowData],
  );

  const huchasTotalThisMonth = huchas.reduce((acc, h) => acc + getHuchaThisMonth(h.id), 0);
  const huchasTotalThisYear = huchas.reduce((acc, h) => acc + getHuchaThisYear(h.id), 0);

  // ── PIE DATA ──────────────────────────────────────────────────────────────
  const pieData = expenseBreakdown.length > 0
    ? expenseBreakdown.map(item => ({ value: item.amount, color: item.color }))
    : [{ value: 1, color: dc.border }];

  // ── CATEGORY DETAIL ────────────────────────────────────────────────────────
  const selectedCategoryItem = useMemo(
    () => expenseBreakdown.find(e => e.category === selectedCategory) ?? null,
    [expenseBreakdown, selectedCategory],
  );

  const categoryMonthlyData = useMemo(() => {
    if (!selectedCategory) return null;
    const catMovs = movements.filter(m => m.type === 'expense' && m.category === selectedCategory);

    const bars = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(nowDate.getFullYear(), nowDate.getMonth() - (5 - i), 1);
      const mo = d.getMonth() + 1;
      const yr = d.getFullYear();
      const amt = catMovs
        .filter(m => { const md = new Date(m.date); return md.getMonth() + 1 === mo && md.getFullYear() === yr; })
        .reduce((s, m) => s + m.amount, 0);
      return { month: mo, year: yr, amt, label: shortMonth(mo) };
    });

    const monthlyAvg = bars.reduce((s, b) => s + b.amt, 0) / 6;
    const barMax = Math.max(1, ...bars.map(b => b.amt));

    const byYear: Record<number, number> = {};
    catMovs.forEach(m => {
      const y = new Date(m.date).getFullYear();
      byYear[y] = (byYear[y] ?? 0) + m.amount;
    });
    const total = catMovs.reduce((s, m) => s + m.amount, 0);
    const sortedYears = Object.entries(byYear)
      .sort((a, b) => Number(b[0]) - Number(a[0]))
      .slice(0, 2);

    return { bars, monthlyAvg, barMax, sortedYears, total };
  }, [selectedCategory, movements]);

  // ── RENDER ─────────────────────────────────────────────────────────────────
  const balanceBg = dc.balanceCard;
  const subTabs: SummaryTab[] = ['expense', 'income', 'hucha'];
  const subTabLabel = (tab: SummaryTab) =>
    tab === 'expense' ? t('resumen.gastos')
    : tab === 'income' ? t('resumen.ingresos')
    : t('resumen.huchas');

  return (
    <View style={[styles.container, { backgroundColor: dc.background }]}>
      <AppHeader title={t('header.annual')} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* MONTH SELECTOR */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.monthRow}
        >
          {monthChips.map(({ month, year }, i) => {
            const isSelected = month === selectedMonth && year === selectedYear;
            const prev = monthChips[i - 1];
            const showYear = i > 0 && prev && prev.year !== year;
            return (
              <React.Fragment key={`${year}-${month}`}>
                {showYear && (
                  <View style={[styles.monthChip, { backgroundColor: dc.surface, borderColor: dc.border }]}>
                    <Text style={[styles.monthChipText, { color: dc.textSecondary }]}>{year}</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={[
                    styles.monthChip,
                    { backgroundColor: dc.surface, borderColor: dc.border },
                    isSelected && { backgroundColor: dc.primary, borderColor: dc.primary },
                  ]}
                  onPress={() => selectPeriod(month, year)}
                >
                  <Text style={[
                    styles.monthChipText,
                    { color: dc.textSecondary },
                    isSelected && { color: '#FFFFFF' },
                  ]}>
                    {shortMonth(month)}
                  </Text>
                </TouchableOpacity>
              </React.Fragment>
            );
          })}
        </ScrollView>

        {/* BALANCE CARD */}
        <View style={[styles.balanceCard, { backgroundColor: balanceBg }]}>
          <View style={styles.balanceTopRow}>
            <Text style={styles.balancePeriodLabel}>
              {t('resumen.balance').toUpperCase()} · {fullMonth(selectedMonth).toUpperCase()} {selectedYear}
            </Text>
            {totalIncome > 0 && (
              <Text style={styles.savedPctText}>{savedPct}% {t('resumen.saved')}</Text>
            )}
          </View>
          <Text style={styles.balanceAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
            {balance >= 0 ? '+' : ''}{balance.toFixed(2).replace('.', ',')} {currencySymbol}
          </Text>
          <View style={styles.balanceStatsRow}>
            <View>
              <Text style={styles.balanceStatLabel}>{t('resumen.ingresos').toUpperCase()}</Text>
              <Text style={styles.balanceStatValue}>
                +{totalIncome.toFixed(2).replace('.', ',')} {currencySymbol}
              </Text>
            </View>
            <View>
              <Text style={styles.balanceStatLabel}>{t('resumen.gastos').toUpperCase()}</Text>
              <Text style={styles.balanceStatValue}>
                -{totalExpense.toFixed(2).replace('.', ',')} {currencySymbol}
              </Text>
            </View>
          </View>
        </View>

        {/* MONTHLY FLOW CHART */}
        <View style={[styles.card, { backgroundColor: dc.surface, borderColor: dc.border }]}>
          <View style={styles.chartHeader}>
            <Text style={[styles.cardTitle, { color: dc.textPrimary }]}>
              {t('resumen.monthlyFlow')}
            </Text>
            <View style={styles.chartLegend}>
              <View style={[styles.legendDot, { backgroundColor: dc.income }]} />
              <Text style={[styles.legendText, { color: dc.textSecondary }]}>{t('resumen.ing')}</Text>
              <View style={[styles.legendDot, { backgroundColor: dc.expense }]} />
              <Text style={[styles.legendText, { color: dc.textSecondary }]}>{t('resumen.gasto')}</Text>
            </View>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.flowChartContent}
          >
            {flowData.map((item) => {
              const incH = Math.max(4, (item.income / flowMax) * FLOW_BAR_H);
              const expH = Math.max(4, (item.expense / flowMax) * FLOW_BAR_H);
              const op = item.isSelected ? 1 : 0.4;
              return (
                <TouchableOpacity
                  key={`${item.year}-${item.month}`}
                  style={styles.flowBarGroup}
                  onPress={() => selectPeriod(item.month, item.year)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.flowBarPair, { height: FLOW_BAR_H }]}>
                    <View style={[styles.flowBar, { height: incH, backgroundColor: dc.income, opacity: op }]} />
                    <View style={[styles.flowBar, { height: expH, backgroundColor: dc.expense, opacity: op }]} />
                  </View>
                  <Text style={[
                    styles.flowBarLabel,
                    { color: item.isSelected ? dc.textPrimary : dc.textSecondary },
                    item.isSelected && { fontFamily: 'Poppins_600SemiBold' },
                  ]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* SUB-TABS */}
        <View style={styles.subTabsRow}>
          {subTabs.map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[
                styles.subTab,
                { backgroundColor: dc.surface, borderColor: dc.border },
                activeTab === tab && { backgroundColor: dc.primary, borderColor: dc.primary },
              ]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[
                styles.subTabText,
                { color: dc.textSecondary },
                activeTab === tab && { color: '#FFFFFF' },
              ]}>
                {subTabLabel(tab)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── GASTOS TAB ──────────────────────────────────────────────────── */}
        {activeTab === 'expense' && (
          expenseBreakdown.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: dc.surface, borderColor: dc.border }]}>
              <Ionicons name="receipt-outline" size={32} color={dc.textSecondary} style={{ marginBottom: 8 }} />
              <Text style={[styles.emptyText, { color: dc.textSecondary }]}>
                {t('resumen.noExpenses')}
              </Text>
            </View>
          ) : (
            <>
              {/* Donut + info */}
              <View style={[styles.card, { backgroundColor: dc.surface, borderColor: dc.border }]}>
                <View style={styles.pieRow}>
                  <DonutChart data={pieData} size={152} innerRadius={50}>
                    <View style={styles.pieCenterBox}>
                      <Text style={[styles.pieCenterNum, { color: dc.textPrimary }]}>
                        {expenseBreakdown.length}
                      </Text>
                      <Text style={[styles.pieCenterSub, { color: dc.textSecondary }]}>
                        CATEG.
                      </Text>
                    </View>
                  </DonutChart>
                  <View style={styles.pieInfoCol}>
                    <Text style={[styles.pieInfoLabel, { color: dc.textSecondary }]}>
                      {t('resumen.gastos').toUpperCase()} · {fullMonth(selectedMonth).toUpperCase()} {selectedYear}
                    </Text>
                    <Text style={[styles.pieInfoAmount, { color: dc.textPrimary }]}>
                      {totalExpense.toFixed(2).replace('.', ',')} {currencySymbol}
                    </Text>
                    <Text style={[styles.pieInfoSub, { color: dc.textSecondary }]}>
                      {expenseBreakdown.length} {t('resumen.categories')}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Category detail — appears when a row is tapped */}
              {selectedCategory && categoryMonthlyData && selectedCategoryItem && (
                <View style={[styles.card, { backgroundColor: dc.surface, borderColor: dc.border }]}>
                  <View style={styles.catDetailHeader}>
                    <View style={[styles.catIcon, { backgroundColor: selectedCategoryItem.color + '20' }]}>
                      <Ionicons name={getCatIcon(selectedCategory, 'expense')} size={18} color={selectedCategoryItem.color} />
                    </View>
                    <View style={styles.catDetailMeta}>
                      <Text style={[styles.catDetailEvol, { color: dc.textSecondary }]}>
                        EVOLUCIÓN · 6 MESES
                      </Text>
                      <Text style={[styles.catDetailName, { color: dc.textPrimary }]}>
                        {getCatName(selectedCategory, 'expense')}
                      </Text>
                    </View>
                    <View style={styles.catDetailAvgBox}>
                      <Text style={[styles.catDetailEvol, { color: dc.textSecondary }]}>MEDIA/MES</Text>
                      <Text style={[styles.catDetailAvg, { color: dc.textPrimary }]}>
                        {categoryMonthlyData.monthlyAvg.toFixed(0)} {currencySymbol}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.catDetailBarsRow}>
                    {categoryMonthlyData.bars.map((bar, i) => {
                      const bh = Math.max(4, (bar.amt / categoryMonthlyData.barMax) * 60);
                      const isCurrent = bar.month === nowDate.getMonth() + 1 && bar.year === nowDate.getFullYear();
                      return (
                        <View key={i} style={styles.catDetailBarGroup}>
                          <Text style={[styles.catDetailBarVal, { color: dc.textSecondary }]}>
                            {bar.amt > 0 ? bar.amt.toFixed(0) : ''}
                          </Text>
                          <View style={[styles.catDetailBarTrack, { height: 60 }]}>
                            <View style={[
                              styles.catDetailBar,
                              { height: bh, backgroundColor: isCurrent ? selectedCategoryItem.color : dc.textSecondary + '30' },
                            ]} />
                          </View>
                          <Text style={[styles.flowBarLabel, { color: dc.textSecondary }]}>{bar.label}</Text>
                        </View>
                      );
                    })}
                  </View>

                  <View style={[styles.rowDivider, { backgroundColor: dc.border, marginLeft: 0, marginTop: 12 }]} />
                  <View style={styles.catDetailYearsRow}>
                    {categoryMonthlyData.sortedYears.map(([yr, amt]) => (
                      <View key={yr}>
                        <Text style={[styles.catDetailYearLbl, { color: dc.textSecondary }]}>{yr}</Text>
                        <Text style={[styles.catDetailYearVal, { color: dc.textPrimary }]}>
                          {(amt as number).toFixed(0)} {currencySymbol}
                        </Text>
                      </View>
                    ))}
                    <View>
                      <Text style={[styles.catDetailYearLbl, { color: dc.textSecondary }]}>TOTAL</Text>
                      <Text style={[styles.catDetailYearVal, { color: dc.textPrimary }]}>
                        {categoryMonthlyData.total.toFixed(0)} {currencySymbol}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Desglose */}
              <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
                {t('resumen.desglose').toUpperCase()} · {fullMonth(selectedMonth).toUpperCase()} {selectedYear}
              </Text>
              <View style={[styles.card, { backgroundColor: dc.surface, borderColor: dc.border }]}>
                {expenseBreakdown.map((item, i) => {
                  const isSelected = selectedCategory === item.category;
                  return (
                    <View key={item.category}>
                      {i > 0 && <View style={[styles.rowDivider, { backgroundColor: dc.border }]} />}
                      <TouchableOpacity
                        style={[styles.catRow, isSelected && { backgroundColor: item.color + '12', borderRadius: 10 }]}
                        onPress={() => setSelectedCategory(prev => prev === item.category ? null : item.category)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.catIcon, { backgroundColor: item.color + '20' }]}>
                          <Ionicons name={getCatIcon(item.category, 'expense')} size={18} color={item.color} />
                        </View>
                        <View style={styles.catContent}>
                          <View style={styles.catTitleRow}>
                            <Text style={[styles.catName, { color: dc.textPrimary }]} numberOfLines={1}>
                              {getCatName(item.category, 'expense')}
                            </Text>
                            <Text style={[styles.catAmount, { color: dc.textPrimary }]}>
                              {item.amount.toFixed(0)} {currencySymbol}
                            </Text>
                          </View>
                          <Text style={[styles.catPct, { color: dc.textSecondary }]}>
                            {Math.round(item.percentage)}% {t('resumen.ofExpense')}
                          </Text>
                          <View style={[styles.catBarTrack, { backgroundColor: item.color + '25' }]}>
                            <View style={[
                              styles.catBarFill,
                              { width: `${item.percentage}%` as any, backgroundColor: item.color },
                            ]} />
                          </View>
                        </View>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            </>
          )
        )}

        {/* ── INGRESOS TAB ─────────────────────────────────────────────────── */}
        {activeTab === 'income' && (
          <View style={[styles.card, { backgroundColor: dc.surface, borderColor: dc.border }]}>
            <Text style={[styles.incomeHeaderLabel, { color: dc.textSecondary }]}>
              {t('resumen.ingresos').toUpperCase()} · {fullMonth(selectedMonth).toUpperCase()} {selectedYear}
            </Text>
            <Text style={[styles.incomeTotalAmount, { color: dc.textPrimary }]}>
              {totalIncome.toFixed(2).replace('.', ',')} {currencySymbol}
            </Text>

            {incomeMovements.length === 0 ? (
              <View style={styles.emptyInline}>
                <Ionicons name="trending-up-outline" size={28} color={dc.textSecondary} style={{ marginBottom: 6 }} />
                <Text style={[styles.emptyText, { color: dc.textSecondary }]}>
                  {t('resumen.noIncome')}
                </Text>
              </View>
            ) : (
              <>
                <View style={[styles.rowDivider, { backgroundColor: dc.border, marginLeft: 0, marginTop: 14 }]} />
                {incomeMovements.map((m, i) => {
                  const catName = getCatName(m.category, 'income');
                  const icon = getCatIcon(m.category, 'income');
                  const subtitle = m.isRecurring && m.recurringDay
                    ? `${t('resumen.recurring')} · ${t('resumen.day')} ${m.recurringDay}`
                    : catName;
                  const title = m.description || catName;
                  return (
                    <View key={m.id}>
                      {i > 0 && <View style={[styles.rowDivider, { backgroundColor: dc.border }]} />}
                      <View style={styles.movRow}>
                        <View style={[styles.movIcon, { backgroundColor: dc.income + '20' }]}>
                          <Ionicons name={icon} size={18} color={dc.income} />
                        </View>
                        <View style={styles.movInfo}>
                          <Text style={[styles.movTitle, { color: dc.textPrimary }]} numberOfLines={1}>
                            {title}
                          </Text>
                          <Text style={[styles.movSubtitle, { color: dc.textSecondary }]} numberOfLines={1}>
                            {subtitle}
                          </Text>
                        </View>
                        <Text style={[styles.movAmount, { color: dc.income }]}>
                          +{m.amount.toFixed(2).replace('.', ',')} {currencySymbol}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </>
            )}
          </View>
        )}

        {/* ── HUCHAS TAB ───────────────────────────────────────────────────── */}
        {activeTab === 'hucha' && (
          <>
            {/* Year total header + stacked bar chart — single card */}
            <View style={[styles.card, { backgroundColor: dc.surface, borderColor: dc.border }]}>
              <Text style={[styles.incomeHeaderLabel, { color: dc.textSecondary }]}>
                {t('resumen.aportadoHuchas').toUpperCase()} · {currentYear}
              </Text>
              <View style={styles.huchaTotalRow}>
                <Text style={[styles.incomeTotalAmount, { color: dc.textPrimary }]}>
                  {huchasTotalThisYear.toFixed(0)} {currencySymbol}
                </Text>
                {huchasTotalThisMonth > 0 && (
                  <Text style={[styles.huchaThisMonthBadge, { color: dc.income }]}>
                    +{huchasTotalThisMonth.toFixed(0)} {t('resumen.thisMonth')}
                  </Text>
                )}
              </View>

              {huchas.length > 0 && (
                <>
                  <View style={[styles.rowDivider, { backgroundColor: dc.border, marginLeft: 0, marginTop: 14, marginBottom: 14 }]} />
                  <View style={styles.huchasChartRow}>
                    {huchasFlowData.map((item) => (
                      <View key={`${item.year}-${item.month}`} style={styles.huchaBarGroup}>
                        <View style={[styles.huchaStack, { height: STACK_BAR_H }]}>
                          {huchas.map(h => {
                            const amt = item.deposits[h.id] ?? 0;
                            if (amt === 0) return null;
                            const segH = Math.max(2, (amt / huchasBarMax) * STACK_BAR_H);
                            return (
                              <View
                                key={h.id}
                                style={[styles.huchaStackSeg, { height: segH, backgroundColor: h.color }]}
                              />
                            );
                          })}
                        </View>
                        <Text style={[styles.flowBarLabel, { color: dc.textSecondary }]}>
                          {item.label}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <View style={styles.huchasLegendRow}>
                    {huchas.map(h => (
                      <View key={h.id} style={styles.huchaLegendItem}>
                        <View style={[styles.legendDot, { backgroundColor: h.color }]} />
                        <Text style={[styles.legendText, { color: dc.textSecondary }]} numberOfLines={1}>
                          {h.name}
                        </Text>
                      </View>
                    ))}
                  </View>
                </>
              )}
            </View>

            {/* Per-hucha contribution cards */}
            <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
              {t('resumen.huchaContrib').toUpperCase()}
            </Text>

            {huchas.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: dc.surface, borderColor: dc.border }]}>
                <Ionicons name="wallet-outline" size={32} color={dc.textSecondary} style={{ marginBottom: 8 }} />
                <Text style={[styles.emptyText, { color: dc.textSecondary }]}>
                  {t('resumen.noHuchaMovements')}
                </Text>
              </View>
            ) : (
              huchas.map(h => {
                const thisMonth = getHuchaThisMonth(h.id);
                const thisYear = getHuchaThisYear(h.id);
                const streak = getHuchaStreak(h.id);
                return (
                  <View key={h.id} style={[styles.huchaCard, { backgroundColor: dc.surface, borderColor: dc.border }]}>
                    <View style={styles.huchaCardHeader}>
                      <View style={[styles.huchaCardIcon, { backgroundColor: h.color + '20' }]}>
                        <Ionicons name={h.icon as keyof typeof Ionicons.glyphMap} size={22} color={h.color} />
                      </View>
                      <View style={styles.huchaCardMeta}>
                        <Text style={[styles.huchaCardName, { color: dc.textPrimary }]}>
                          {h.name}
                        </Text>
                        {streak > 0 && (
                          <View style={styles.streakRow}>
                            <Text style={styles.streakFire}>🔥</Text>
                            <Text style={[styles.streakText, { color: dc.textSecondary }]}>
                              {t('resumen.streak', { count: streak })}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <View style={[styles.huchaStatsRow, { borderTopColor: dc.border }]}>
                      <View style={styles.huchaStat}>
                        <Text style={[styles.huchaStatLabel, { color: dc.textSecondary }]}>
                          {t('resumen.thisMonthLabel').toUpperCase()}
                        </Text>
                        <Text style={[styles.huchaStatValue, { color: dc.textPrimary }]}>
                          {thisMonth.toFixed(0)} {currencySymbol}
                        </Text>
                      </View>
                      <View style={[styles.huchaStatSep, { backgroundColor: dc.border }]} />
                      <View style={styles.huchaStat}>
                        <Text style={[styles.huchaStatLabel, { color: dc.textSecondary }]}>
                          {t('resumen.enYear', { year: currentYear }).toUpperCase()}
                        </Text>
                        <Text style={[styles.huchaStatValue, { color: dc.textPrimary }]}>
                          {thisYear.toFixed(0)} {currencySymbol}
                        </Text>
                      </View>
                      <View style={[styles.huchaStatSep, { backgroundColor: dc.border }]} />
                      <View style={styles.huchaStat}>
                        <Text style={[styles.huchaStatLabel, { color: dc.textSecondary }]}>
                          {t('resumen.automatic').toUpperCase()}
                        </Text>
                        <Text style={[styles.huchaStatValue, { color: dc.textPrimary }]}>
                          {h.isAutomatic && h.monthlyAmount
                            ? `${h.monthlyAmount.toFixed(0)} ${currencySymbol}`
                            : t('resumen.manual')
                          }
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}

      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 100 },

  // Month selector
  monthRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8, flexDirection: 'row' },
  monthChip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, borderWidth: 0.5,
  },
  monthChipText: { fontSize: 13, fontFamily: 'Poppins_500Medium' },

  // Balance card
  balanceCard: {
    marginHorizontal: 16, marginBottom: 12, borderRadius: 20, padding: 20,
    elevation: 4, shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4,
  },
  balanceTopRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 8,
  },
  balancePeriodLabel: {
    color: 'rgba(255,255,255,0.6)', fontSize: 10,
    fontFamily: 'Poppins_600SemiBold', letterSpacing: 1,
  },
  savedPctText: {
    color: 'rgba(255,255,255,0.7)', fontSize: 12,
    fontFamily: 'Poppins_500Medium',
  },
  balanceAmount: {
    color: '#FFFFFF', fontSize: 38, fontFamily: 'Poppins_700Bold',
    letterSpacing: -1, marginBottom: 16,
  },
  balanceStatsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  balanceStatLabel: {
    color: 'rgba(255,255,255,0.6)', fontSize: 10,
    fontFamily: 'Poppins_600SemiBold', letterSpacing: 0.8, marginBottom: 2,
  },
  balanceStatValue: { color: '#FFFFFF', fontSize: 15, fontFamily: 'Poppins_700Bold' },

  // Generic card
  card: {
    marginHorizontal: 16, marginBottom: 12,
    borderRadius: 16, borderWidth: 0.5,
    padding: 16, overflow: 'hidden',
  },

  // Chart header
  chartHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 12,
  },
  cardTitle: { fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  chartLegend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, fontFamily: 'Poppins_400Regular' },

  // Flow chart
  flowChartContent: { paddingRight: 8, alignItems: 'flex-end' },
  flowBarGroup: { alignItems: 'center', marginHorizontal: 5 },
  flowBarPair: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  flowBar: { width: 8, borderRadius: 3 },
  flowBarLabel: { fontSize: 9, fontFamily: 'Poppins_400Regular', marginTop: 5 },

  // Sub-tabs
  subTabsRow: {
    marginHorizontal: 16, marginBottom: 12,
    flexDirection: 'row', gap: 8,
  },
  subTab: {
    flex: 1, paddingVertical: 10, borderRadius: 24, borderWidth: 0.5,
    alignItems: 'center', justifyContent: 'center',
  },
  subTabText: { fontSize: 13, fontFamily: 'Poppins_500Medium' },

  // Empty state
  emptyCard: {
    marginHorizontal: 16, marginBottom: 12,
    borderRadius: 16, borderWidth: 0.5,
    padding: 40, alignItems: 'center',
  },
  emptyInline: { alignItems: 'center', paddingTop: 24, paddingBottom: 8 },
  emptyText: { fontSize: 13, fontFamily: 'Poppins_400Regular' },

  // Section label
  sectionLabel: {
    marginHorizontal: 16, marginBottom: 8,
    fontSize: 11, fontFamily: 'Poppins_600SemiBold', letterSpacing: 0.8,
  },

  // Pie
  pieRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  pieCenterBox: { alignItems: 'center' },
  pieCenterNum: { fontSize: 22, fontFamily: 'Poppins_700Bold', lineHeight: 26 },
  pieCenterSub: { fontSize: 9, fontFamily: 'Poppins_600SemiBold', letterSpacing: 0.5 },
  pieInfoCol: { flex: 1 },
  pieInfoLabel: { fontSize: 9, fontFamily: 'Poppins_600SemiBold', letterSpacing: 0.5, marginBottom: 4 },
  pieInfoAmount: { fontSize: 24, fontFamily: 'Poppins_700Bold', marginBottom: 2 },
  pieInfoSub: { fontSize: 12, fontFamily: 'Poppins_400Regular' },

  // Category breakdown
  catRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  catIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  catContent: { flex: 1 },
  catTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  catName: { fontSize: 14, fontFamily: 'Poppins_500Medium', flex: 1, marginRight: 8 },
  catAmount: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
  catPct: { fontSize: 11, fontFamily: 'Poppins_400Regular', marginBottom: 6 },
  catBarTrack: { height: 5, borderRadius: 3, overflow: 'hidden' },
  catBarFill: { height: 5, borderRadius: 3 },
  rowDivider: { height: 0.5, marginLeft: 52 },

  // Income
  incomeHeaderLabel: {
    fontSize: 10, fontFamily: 'Poppins_600SemiBold',
    letterSpacing: 0.8, marginBottom: 6,
  },
  incomeTotalAmount: { fontSize: 30, fontFamily: 'Poppins_700Bold' },
  movRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  movIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  movInfo: { flex: 1 },
  movTitle: { fontSize: 14, fontFamily: 'Poppins_500Medium' },
  movSubtitle: { fontSize: 11, fontFamily: 'Poppins_400Regular', marginTop: 2 },
  movAmount: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', marginLeft: 4 },

  // Huchas
  huchaTotalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  huchaThisMonthBadge: { fontSize: 13, fontFamily: 'Poppins_500Medium' },
  huchasChartRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', marginBottom: 12 },
  huchaBarGroup: { alignItems: 'center', gap: 4 },
  huchaStack: {
    width: 20, borderRadius: 4, overflow: 'hidden',
    flexDirection: 'column-reverse', justifyContent: 'flex-start',
  },
  huchaStackSeg: { width: '100%' },
  huchasLegendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  huchaLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },

  // Category detail
  catDetailHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  catDetailMeta: { flex: 1 },
  catDetailEvol: { fontSize: 9, fontFamily: 'Poppins_600SemiBold', letterSpacing: 0.5, marginBottom: 2 },
  catDetailName: { fontSize: 16, fontFamily: 'Poppins_700Bold' },
  catDetailAvgBox: { alignItems: 'flex-end' },
  catDetailAvg: { fontSize: 16, fontFamily: 'Poppins_700Bold' },
  catDetailBarsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  catDetailBarGroup: { alignItems: 'center', flex: 1 },
  catDetailBarVal: { fontSize: 9, fontFamily: 'Poppins_400Regular', marginBottom: 4 },
  catDetailBarTrack: { width: '100%', justifyContent: 'flex-end', paddingHorizontal: 3 },
  catDetailBar: { borderTopLeftRadius: 3, borderTopRightRadius: 3, width: '100%' },
  catDetailYearsRow: { flexDirection: 'row', gap: 20, paddingTop: 12 },
  catDetailYearLbl: { fontSize: 11, fontFamily: 'Poppins_500Medium', marginBottom: 2 },
  catDetailYearVal: { fontSize: 15, fontFamily: 'Poppins_700Bold' },

  // Hucha card
  huchaCard: {
    marginHorizontal: 16, marginBottom: 10,
    borderRadius: 16, borderWidth: 0.5, overflow: 'hidden',
  },
  huchaCardHeader: {
    flexDirection: 'row', alignItems: 'center',
    gap: 12, padding: 14,
  },
  huchaCardIcon: {
    width: 46, height: 46, borderRadius: 23,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  huchaCardMeta: { flex: 1 },
  huchaCardName: { fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  streakFire: { fontSize: 12 },
  streakText: { fontSize: 12, fontFamily: 'Poppins_400Regular' },
  huchaStatsRow: {
    flexDirection: 'row', borderTopWidth: 0.5, paddingVertical: 12,
  },
  huchaStat: { flex: 1, alignItems: 'center' },
  huchaStatSep: { width: 0.5, marginVertical: 4 },
  huchaStatLabel: { fontSize: 9, fontFamily: 'Poppins_600SemiBold', letterSpacing: 0.5, marginBottom: 4 },
  huchaStatValue: { fontSize: 14, fontFamily: 'Poppins_700Bold' },
});

export default AnnualScreen;
