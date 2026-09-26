import React, { useState, useMemo } from 'react';
import {
  View, StyleSheet, TouchableOpacity,
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
import { useCategoryColors } from '../../hooks/useCategoryColors';
import { MovementType } from '../../types';
import StrikeText from '../../components/common/StrikeText';
import { formatAmount } from '../../utils/formatAmount';
import { withAlpha } from '../../utils/color';
import SwipeNavigator from '../../components/common/SwipeNavigator';
import { SegmentedControl } from '../../components/common/BottomSheet';
import { HeroScrollScreen } from '../../components/layout/HeroScreen';
import { HeroTitleBar, MonthSelector } from '../../components/layout/HeroBar';
import { SectionHeader } from '../../components/layout/SheetSection';
import RhythmChart from '../../components/summary/RhythmChart';
import { lightHaptic } from '../../utils/haptics';

type SummaryTab = 'expense' | 'income' | 'hucha';

const FLOW_BAR_H = 70;
const STACK_BAR_H = 80;

// Índice absoluto del mes (año * 12 + mes 0-11)
const monthIndexOf = (year: number, month1: number) => year * 12 + (month1 - 1);

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
  const { t, i18n } = useTranslation();
  const { colors: dc, ui } = useTheme();
  const catColors = useCategoryColors();
  // Selectores en vez del store entero, para no renderizar la pantalla ante
  // cambios que no le afectan
  const movements = useMovementStore((s) => s.movements);
  const huchas = useSavingsStore((s) => s.huchas);
  const huchaMovements = useSavingsStore((s) => s.huchaMovements);
  const isSharedMode = useSharedAccountStore((s) => s.isSharedMode);
  // Aquí el selector devuelve el símbolo ya resuelto y no la función:
  // getCurrencySymbol lee de get() por dentro, así que su identidad nunca cambia
  // y suscribirse a ella dejaría el símbolo obsoleto al cambiar de moneda
  const personalCurrencySymbol = useSettingsStore((s) => s.getCurrencySymbol());
  const sharedCurrencySymbol = useSharedAccountStore((s) => s.getSharedCurrencySymbol());
  // Los stores de categorías se quedan enteros a propósito: getCategoryName y
  // getCategoryIcon también leen de get(), y aquí sí se usan en el render,
  // así que suscribirse solo a ellas dejaría nombres e iconos obsoletos al
  // renombrar o crear una categoría
  const { getCategoryName, getCategoryIcon, isCategoryDeleted } = useCategoryStore();
  const { getSharedCategoryName, getSharedCategoryIcon, isSharedCategoryDeleted } = useSharedCategoryStore();

  // Local period state — independent of HomeScreen
  const nowDate = new Date();
  const [selectedMonth, setSelectedMonthLocal] = useState(nowDate.getMonth() + 1);
  const [selectedYear, setSelectedYearLocal] = useState(nowDate.getFullYear());
  const [activeTab, setActiveTab] = useState<SummaryTab>('expense');
  // Resumen de todo el año
  const [yearMode, setYearMode] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showCatMovements, setShowCatMovements] = useState(false);
  const [selectedIncomeCategory, setSelectedIncomeCategory] = useState<string | null>(null);
  const [showIncomeCatMovements, setShowIncomeCatMovements] = useState(false);

  const selectPeriod = (month: number, year: number) => {
    setYearMode(false);
    setSelectedMonthLocal(month);
    setSelectedYearLocal(year);
  };

  const currencySymbol = isSharedMode ? sharedCurrencySymbol : personalCurrencySymbol;

  const getCatName = (id: string, type: MovementType) =>
    isSharedMode ? getSharedCategoryName(id, type, t) : getCategoryName(id, type, t);

  // Tachada si la categoría está borrada, igual que en el historial
  const renderCatName = (id: string, type: MovementType) => (
    <StrikeText struck={isSharedMode ? isSharedCategoryDeleted(id, type) : isCategoryDeleted(id, type)}>
      {getCatName(id, type)}
    </StrikeText>
  );

  const getCatIcon = (id: string, type: MovementType): keyof typeof Ionicons.glyphMap => {
    const icon = isSharedMode ? getSharedCategoryIcon(id, type) : getCategoryIcon(id, type);
    return (icon + '-outline') as keyof typeof Ionicons.glyphMap;
  };

  const shortMonth = (m: number) => t(`home.month_${m - 1}`).slice(0, 3);
  const fullMonth = (m: number) => t(`home.month_${m - 1}`);

  // ── LÍMITES DEL SELECTOR ──────────────────────────────────────────────────
  // Del primer mes con movimientos al mes actual
  const currentIndex = monthIndexOf(nowDate.getFullYear(), nowDate.getMonth() + 1);
  const firstIndex = useMemo(() => {
    let first = currentIndex;
    movements.forEach((m) => {
      const d = new Date(m.date);
      first = Math.min(first, monthIndexOf(d.getFullYear(), d.getMonth() + 1));
    });
    huchaMovements.forEach((m) => {
      const d = new Date(m.date);
      first = Math.min(first, monthIndexOf(d.getFullYear(), d.getMonth() + 1));
    });
    return first;
  }, [movements, huchaMovements, currentIndex]);
  const selectedIndex = monthIndexOf(selectedYear, selectedMonth);
  const firstYear = Math.floor(firstIndex / 12);

  // ── SELECTED MONTH DATA ────────────────────────────────────────────────────
  const monthMovements = useMemo(() =>
    movements.filter(m => {
      const d = new Date(m.date);
      if (d.getFullYear() !== selectedYear) return false;
      return yearMode || d.getMonth() + 1 === selectedMonth;
    }),
    [movements, selectedMonth, selectedYear, yearMode],
  );

  const totalIncome = useMemo(() =>
    monthMovements.filter(m => m.type === 'income').reduce((s, m) => s + m.amount, 0),
    [monthMovements],
  );
  const totalExpense = useMemo(() =>
    monthMovements.filter(m => m.type === 'expense').reduce((s, m) => s + m.amount, 0),
    [monthMovements],
  );
  const balance = totalIncome - totalExpense;

  // ── PREVIOUS MONTH COMPARISON ─────────────────────────────────────────────
  const prevSelMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
  const prevSelYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear;
  const prevMonthMovements = useMemo(() =>
    movements.filter(m => {
      const d = new Date(m.date);
      if (yearMode) return d.getFullYear() === selectedYear - 1;
      return d.getMonth() + 1 === prevSelMonth && d.getFullYear() === prevSelYear;
    }),
    [movements, prevSelMonth, prevSelYear, yearMode, selectedYear],
  );
  const prevBalance = useMemo(() => {
    if (prevMonthMovements.length === 0) return null;
    const inc = prevMonthMovements.filter(m => m.type === 'income').reduce((s, m) => s + m.amount, 0);
    const exp = prevMonthMovements.filter(m => m.type === 'expense').reduce((s, m) => s + m.amount, 0);
    return inc - exp;
  }, [prevMonthMovements]);
  const balanceDiff = prevBalance !== null ? balance - prevBalance : null;
  const savedPct = totalIncome > 0
    ? Math.round((balance / totalIncome) * 100)
    : 0;

  // ── RITMO DEL MES: gasto acumulado día a día, frente al mes anterior ─────
  const rhythm = useMemo(() => {
    if (yearMode) return null;
    const y = selectedYear;
    const m = selectedMonth - 1;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const isCurrent = y === nowDate.getFullYear() && m === nowDate.getMonth();
    const lastDay = isCurrent ? nowDate.getDate() : daysInMonth;
    const prevY = m === 0 ? y - 1 : y;
    const prevM = m === 0 ? 11 : m - 1;
    const prevDays = new Date(prevY, prevM + 1, 0).getDate();
    const cumulative = (yy: number, mm: number, upto: number) => {
      const daily = new Array(upto).fill(0);
      movements.forEach((mv) => {
        if (mv.type !== 'expense') return;
        const d = new Date(mv.date);
        if (d.getFullYear() === yy && d.getMonth() === mm && d.getDate() <= upto) daily[d.getDate() - 1] += mv.amount;
      });
      let acc = 0;
      return daily.map((v) => (acc += v));
    };
    const current = cumulative(y, m, lastDay);
    const previousRaw = cumulative(prevY, prevM, prevDays);
    const previous = previousRaw[previousRaw.length - 1] > 0 ? previousRaw : null;
    if (!previous && current[current.length - 1] === 0) return null;
    // Se compara el mismo día de los dos meses (o el último del anterior, si es más corto)
    const compareDay = Math.min(lastDay, prevDays);
    const diff = previous ? current[compareDay - 1] - previous[compareDay - 1] : null;
    return { current, previous, daysInMonth, compareDay, diff, prevMonth: prevM };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- nowDate es la fecha de este render
  }, [movements, selectedMonth, selectedYear, yearMode]);

  // ── EXPENSE BREAKDOWN ─────────────────────────────────────────────────────
  const expenseBreakdown = useMemo(() => {
    const byCategory: Record<string, number> = {};
    monthMovements
      .filter(m => m.type === 'expense')
      .forEach(m => { byCategory[m.category] = (byCategory[m.category] ?? 0) + m.amount; });
    return Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: totalExpense > 0 ? (amount / totalExpense) * 100 : 0,
        color: catColors.expense(category),
      }));
  }, [monthMovements, totalExpense, catColors]);

  // ── INCOME BREAKDOWN ──────────────────────────────────────────────────────
  const incomeBreakdown = useMemo(() => {
    const byCategory: Record<string, number> = {};
    monthMovements
      .filter(m => m.type === 'income')
      .forEach(m => { byCategory[m.category] = (byCategory[m.category] ?? 0) + m.amount; });
    return Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([category, amount], i) => ({
        category,
        amount,
        percentage: totalIncome > 0 ? (amount / totalIncome) * 100 : 0,
        color: catColors.income(i, category),
      }));
  }, [monthMovements, totalIncome, catColors]);

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
        isSelected: yearMode ? y === selectedYear : (m === selectedMonth && y === selectedYear),
      };
    });
    // i18n.language: las etiquetas salen de t(), hay que recalcularlas al
    // cambiar de idioma
  // eslint-disable-next-line react-hooks/exhaustive-deps -- nowDate es la fecha de este render y shortMonth solo cambia con el idioma, que ya está en la lista
  }, [movements, selectedMonth, selectedYear, yearMode, i18n.language]);

  const flowMax = useMemo(() =>
    Math.max(1, ...flowData.map(d => Math.max(d.income, d.expense))),
    [flowData],
  );

  // ── HUCHAS DATA ────────────────────────────────────────────────────────────
  const currentMonth = nowDate.getMonth() + 1;
  const currentYear = nowDate.getFullYear();

  const getHuchaThisMonth = (huchaId: string) =>
    huchaMovements
      .filter(m => m.huchaId === huchaId)
      .filter(m => {
        const d = new Date(m.date);
        return d.getMonth() + 1 === currentMonth && d.getFullYear() === currentYear;
      })
      .reduce((s, m) => s + (m.type === 'deposit' ? m.amount : -m.amount), 0);

  const getHuchaThisYear = (huchaId: string) =>
    huchaMovements
      .filter(m => m.huchaId === huchaId && new Date(m.date).getFullYear() === currentYear)
      .reduce((s, m) => s + (m.type === 'deposit' ? m.amount : -m.amount), 0);

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
      const net: Record<string, number> = {};
      huchaMovements
        .filter(mv => {
          const md = new Date(mv.date);
          return md.getMonth() + 1 === m && md.getFullYear() === y;
        })
        .forEach(mv => {
          const delta = mv.type === 'deposit' ? mv.amount : -mv.amount;
          net[mv.huchaId] = (net[mv.huchaId] ?? 0) + delta;
        });
      return { month: m, year: y, label: shortMonth(m), net };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- nowDate es la fecha de este render y shortMonth solo cambia con el idioma, que ya está en la lista
  }, [huchaMovements, i18n.language]);

  const huchasBarMax = useMemo(() =>
    Math.max(1, ...huchasFlowData.map(d =>
      Object.values(d.net).reduce((s, v) => s + Math.max(0, v), 0)
    )),
    [huchasFlowData],
  );

  const huchasTotalThisMonth = huchas.reduce((acc, h) => acc + getHuchaThisMonth(h.id), 0);
  const huchasTotalThisYear = huchas.reduce((acc, h) => acc + getHuchaThisYear(h.id), 0);

  // ── PIE DATA ──────────────────────────────────────────────────────────────
  // Los gastos, siempre en el mismo orden en el gráfico: cada categoría conserva
  // su color y su sitio aunque cambie de puesto (la lista de abajo va por importe)
  const pieData = expenseBreakdown.length > 0
    ? [...expenseBreakdown]
      .sort((a, b) => catColors.expenseOrder(a.category) - catColors.expenseOrder(b.category))
      .map(item => ({ value: item.amount, color: item.color }))
    : [{ value: 1, color: ui.hair }];

  const incomePieData = incomeBreakdown.length > 0
    ? incomeBreakdown.map(item => ({ value: item.amount, color: item.color }))
    : [{ value: 1, color: ui.hair }];

  // ── CATEGORY DETAIL (6 meses) ─────────────────────────────────────────────
  const buildCategoryDetail = (type: MovementType, category: string | null) => {
    if (!category) return null;
    const catMovs = movements.filter(m => m.type === type && m.category === category);

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
  };

  const incomeCategoryMonthlyData = useMemo(
    () => buildCategoryDetail('income', selectedIncomeCategory),
  // eslint-disable-next-line react-hooks/exhaustive-deps -- nowDate es la fecha de este render y shortMonth solo cambia con el idioma, que ya está en la lista
    [selectedIncomeCategory, movements, i18n.language],
  );
  const categoryMonthlyData = useMemo(
    () => buildCategoryDetail('expense', selectedCategory),
  // eslint-disable-next-line react-hooks/exhaustive-deps -- nowDate es la fecha de este render y shortMonth solo cambia con el idioma, que ya está en la lista
    [selectedCategory, movements, i18n.language],
  );

  // ── NAVEGACIÓN ENTRE MESES ────────────────────────────────────────────────
  const goOlderMonth = () => {
    if (yearMode) {
      if (selectedYear > firstYear) setSelectedYearLocal(selectedYear - 1);
      return;
    }
    if (selectedIndex <= firstIndex) return;
    const prev = selectedIndex - 1;
    selectPeriod((prev % 12) + 1, Math.floor(prev / 12));
  };
  const goNewerMonth = () => {
    if (yearMode) {
      if (selectedYear < currentYear) setSelectedYearLocal(selectedYear + 1);
      return;
    }
    if (selectedIndex >= currentIndex) return;
    const next = selectedIndex + 1;
    selectPeriod((next % 12) + 1, Math.floor(next / 12));
  };
  const canOlder = yearMode ? selectedYear > firstYear : selectedIndex > firstIndex;
  const canNewer = yearMode ? selectedYear < currentYear : selectedIndex < currentIndex;

  // En modo anual la cabecera muestra solo el año
  const periodLabel = yearMode
    ? String(selectedYear)
    : `${fullMonth(selectedMonth)} ${selectedYear}`;
  const selectorLabel = yearMode
    ? String(selectedYear)
    : selectedYear === currentYear ? fullMonth(selectedMonth) : `${shortMonth(selectedMonth)} ${selectedYear}`;

  const subTabLabel = (tab: SummaryTab) =>
    tab === 'expense' ? t('resumen.gastos')
    : tab === 'income' ? t('resumen.ingresos')
    : t('resumen.huchas');

  // ── PIEZAS ─────────────────────────────────────────────────────────────────
  const renderCategoryDetail = (
    item: { category: string; color: string },
    type: MovementType,
    data: NonNullable<ReturnType<typeof buildCategoryDetail>>,
    showMovs: boolean,
    toggleMovs: () => void,
  ) => {
    const isIncome = type === 'income';
    const catMonthMovs = monthMovements
      .filter(mv => mv.type === type && mv.category === item.category)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return (
      <View style={[styles.detail, { backgroundColor: ui.field }]}>
        <View style={styles.detailHeader}>
          <Text style={[styles.detailLabel, { color: dc.textSecondary }]}>{t('resumen.evolution6Months')}</Text>
          <View style={styles.detailAvgBox}>
            <Text style={[styles.detailLabel, { color: dc.textSecondary }]}>{t('resumen.avgPerMonth')}</Text>
            <Text style={[styles.detailAvg, { color: dc.textPrimary }]}>
              {formatAmount(data.monthlyAvg, 0)} {currencySymbol}
            </Text>
          </View>
        </View>

        <View style={styles.detailBarsRow}>
          {data.bars.map((bar, idx) => {
            const bh = Math.max(4, (bar.amt / data.barMax) * 60);
            const isCurrent = bar.month === nowDate.getMonth() + 1 && bar.year === nowDate.getFullYear();
            return (
              <View key={idx} style={styles.detailBarGroup}>
                <Text style={[styles.detailBarVal, { color: dc.textSecondary }]} numberOfLines={1}>
                  {bar.amt > 0 ? formatAmount(bar.amt, 0) : ''}
                </Text>
                <View style={[styles.detailBarTrack, { height: 60 }]}>
                  <View style={[styles.detailBar, { height: bh, backgroundColor: isCurrent ? item.color : ui.hair2 }]} />
                </View>
                <Text style={[styles.detailBarLabel, { color: dc.textSecondary }]}>{bar.label}</Text>
              </View>
            );
          })}
        </View>

        <View style={[styles.detailDivider, { backgroundColor: ui.hair }]} />
        <View style={styles.detailYearsRow}>
          {data.sortedYears.map(([yr, amt]) => (
            <View key={yr}>
              <Text style={[styles.detailYearLbl, { color: dc.textSecondary }]}>{yr}</Text>
              <Text style={[styles.detailYearVal, { color: dc.textPrimary }]}>
                {formatAmount(amt as number, 0)} {currencySymbol}
              </Text>
            </View>
          ))}
          <View>
            <Text style={[styles.detailYearLbl, { color: dc.textSecondary }]}>{t('resumen.total')}</Text>
            <Text style={[styles.detailYearVal, { color: dc.textPrimary }]}>
              {formatAmount(data.total, 0)} {currencySymbol}
            </Text>
          </View>
        </View>

        <View style={[styles.detailDivider, { backgroundColor: ui.hair }]} />
        <TouchableOpacity style={styles.detailToggle} onPress={toggleMovs} activeOpacity={0.7}>
          <Text style={[styles.detailToggleText, { color: ui.accent }]}>{t('resumen.viewAllMovements')}</Text>
          <Ionicons name={showMovs ? 'chevron-up' : 'chevron-down'} size={16} color={ui.accent} />
        </TouchableOpacity>

        {showMovs && (catMonthMovs.length === 0 ? (
          <Text style={[styles.detailEmpty, { color: dc.textSecondary }]}>
            {t(isIncome ? 'resumen.noIncome' : 'resumen.noExpenses')}
          </Text>
        ) : catMonthMovs.map((mv, idx) => {
          const d = new Date(mv.date);
          const dayText = `${d.getDate()} ${shortMonth(d.getMonth() + 1)}`;
          return (
            <View key={mv.id} style={[styles.movRow, idx > 0 && { borderTopColor: ui.hair, borderTopWidth: StyleSheet.hairlineWidth }]}>
              <Text style={[styles.movDay, { color: dc.textSecondary }]}>{dayText}</Text>
              <Text style={[styles.movTitle, { color: dc.textPrimary }]} numberOfLines={1}>
                {mv.note || renderCatName(item.category, type)}
              </Text>
              <Text style={[styles.movAmount, { color: isIncome ? ui.incomeText : dc.textPrimary }]}>
                {isIncome ? '+' : '-'}{formatAmount(mv.amount)} {currencySymbol}
              </Text>
            </View>
          );
        }))}
      </View>
    );
  };

  const renderBreakdown = (type: MovementType) => {
    const isIncome = type === 'income';
    const breakdown = isIncome ? incomeBreakdown : expenseBreakdown;
    const total = isIncome ? totalIncome : totalExpense;
    const selected = isIncome ? selectedIncomeCategory : selectedCategory;
    const setSelected = isIncome ? setSelectedIncomeCategory : setSelectedCategory;
    const showMovs = isIncome ? showIncomeCatMovements : showCatMovements;
    const setShowMovs = isIncome ? setShowIncomeCatMovements : setShowCatMovements;
    const detail = isIncome ? incomeCategoryMonthlyData : categoryMonthlyData;

    if (breakdown.length === 0) {
      return (
        <View style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: ui.accentSoft }]}>
            <Ionicons name={isIncome ? 'trending-up-outline' : 'receipt-outline'} size={28} color={ui.accent} />
          </View>
          <Text style={[styles.emptyText, { color: dc.textSecondary }]}>
            {t(isIncome ? 'resumen.noIncome' : 'resumen.noExpenses')}
          </Text>
        </View>
      );
    }

    return (
      <>
        {/* Donut + info */}
        <View style={styles.pieRow}>
          <DonutChart data={isIncome ? incomePieData : pieData} size={140} innerRadius={46}>
            <View style={styles.pieCenterBox}>
              <Text style={[styles.pieCenterNum, { color: dc.textPrimary }]}>{breakdown.length}</Text>
              <Text style={[styles.pieCenterSub, { color: dc.textSecondary }]}>{t('resumen.categAbbr')}</Text>
            </View>
          </DonutChart>
          <View style={styles.pieInfoCol}>
            <Text style={[styles.pieInfoLabel, { color: dc.textSecondary }]}>
              {subTabLabel(type)} · {periodLabel}
            </Text>
            <Text style={[styles.pieInfoAmount, { color: dc.textPrimary }]} numberOfLines={1}>
              {formatAmount(total)} {currencySymbol}
            </Text>
            <Text style={[styles.pieInfoSub, { color: dc.textSecondary }]}>
              {breakdown.length} {t('resumen.categories')}
            </Text>
          </View>
        </View>

        {/* Desglose */}
        <SectionHeader title={t('resumen.desglose')} style={styles.blockHeader} />
        <View style={styles.pad}>
          {breakdown.map((item) => {
            const isSelected = selected === item.category;
            return (
              <View key={item.category}>
                <TouchableOpacity
                  style={styles.catRow}
                  onPress={() => {
                    setSelected(prev => prev === item.category ? null : item.category);
                    setShowMovs(false);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.catIcon, { backgroundColor: withAlpha(item.color, 0.15) }]}>
                    <Ionicons name={getCatIcon(item.category, type)} size={19} color={item.color} />
                  </View>
                  <View style={styles.catContent}>
                    <View style={styles.catTitleRow}>
                      <Text style={[styles.catName, { color: dc.textPrimary }]} numberOfLines={1}>
                        {renderCatName(item.category, type)}
                      </Text>
                      <Text style={[styles.catAmount, { color: dc.textPrimary }]}>
                        {formatAmount(item.amount, 0)} {currencySymbol}
                      </Text>
                    </View>
                    <Text style={[styles.catPct, { color: dc.textSecondary }]}>
                      {Math.round(item.percentage)}% {t(isIncome ? 'resumen.ofIncome' : 'resumen.ofExpense')}
                    </Text>
                    <View style={[styles.catBarTrack, { backgroundColor: withAlpha(item.color, 0.15) }]}>
                      <View style={[styles.catBarFill, { width: `${item.percentage}%`, backgroundColor: item.color }]} />
                    </View>
                  </View>
                  <Ionicons
                    name={isSelected ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={isSelected ? item.color : dc.textSecondary}
                  />
                </TouchableOpacity>
                {isSelected && detail && renderCategoryDetail(
                  item, type, detail, showMovs, () => setShowMovs(prev => !prev),
                )}
              </View>
            );
          })}
        </View>
      </>
    );
  };

  const renderHuchas = () => (
    <>
      {/* Total del año + barras apiladas */}
      <View style={[styles.block, { backgroundColor: ui.field }]}>
        <Text style={[styles.blockLabel, { color: dc.textSecondary }]}>
          {t('resumen.aportadoHuchas')} · {currentYear}
        </Text>
        <View style={styles.huchaTotalRow}>
          <Text style={[styles.huchaTotal, { color: dc.textPrimary }]}>
            {formatAmount(huchasTotalThisYear, 0)} {currencySymbol}
          </Text>
          {huchasTotalThisMonth > 0 && (
            <Text style={[styles.huchaThisMonth, { color: ui.incomeText }]}>
              +{formatAmount(huchasTotalThisMonth, 0)} {t('resumen.thisMonth')}
            </Text>
          )}
        </View>

        {huchas.length > 0 && (
          <>
            <View style={styles.huchasChartRow}>
              {huchasFlowData.map((item) => (
                <View key={`${item.year}-${item.month}`} style={styles.huchaBarGroup}>
                  <View style={[styles.huchaStack, { height: STACK_BAR_H }]}>
                    {huchas.map(h => {
                      const amt = Math.max(0, item.net[h.id] ?? 0);
                      if (amt === 0) return null;
                      const segH = Math.max(2, (amt / huchasBarMax) * STACK_BAR_H);
                      return <View key={h.id} style={[styles.huchaStackSeg, { height: segH, backgroundColor: h.color }]} />;
                    })}
                  </View>
                  <Text style={[styles.detailBarLabel, { color: dc.textSecondary }]}>{item.label}</Text>
                </View>
              ))}
            </View>
            <View style={styles.huchasLegendRow}>
              {huchas.map(h => (
                <View key={h.id} style={styles.huchaLegendItem}>
                  <View style={[styles.legendDot, { backgroundColor: h.color }]} />
                  <Text style={[styles.legendText, { color: dc.textSecondary }]} numberOfLines={1}>{h.name}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </View>

      <SectionHeader title={t('resumen.huchaContrib')} style={styles.blockHeader} />
      {huchas.length === 0 ? (
        <View style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: ui.accentSoft }]}>
            <Ionicons name="wallet-outline" size={28} color={ui.accent} />
          </View>
          <Text style={[styles.emptyText, { color: dc.textSecondary }]}>{t('resumen.noHuchaMovements')}</Text>
        </View>
      ) : huchas.map(h => {
        const thisMonth = getHuchaThisMonth(h.id);
        const thisYear = getHuchaThisYear(h.id);
        const streak = getHuchaStreak(h.id);
        return (
          <View key={h.id} style={[styles.huchaCard, { backgroundColor: ui.field }]}>
            <View style={styles.huchaCardHeader}>
              <View style={[styles.huchaCardIcon, { backgroundColor: withAlpha(h.color, 0.16) }]}>
                <Ionicons name={h.icon as keyof typeof Ionicons.glyphMap} size={21} color={h.color} />
              </View>
              <View style={styles.huchaCardMeta}>
                <Text style={[styles.huchaCardName, { color: dc.textPrimary }]}>{h.name}</Text>
                {streak > 0 && (
                  <View style={styles.streakRow}>
                    <Ionicons name="flame" size={13} color={ui.savingsText} />
                    <Text style={[styles.streakText, { color: dc.textSecondary }]}>
                      {t('resumen.streak', { count: streak })}
                    </Text>
                  </View>
                )}
              </View>
            </View>
            <View style={[styles.huchaStatsRow, { borderTopColor: ui.hair }]}>
              {[
                [t('resumen.thisMonthLabel'), `${formatAmount(thisMonth, 0)} ${currencySymbol}`],
                [t('resumen.enYear', { year: currentYear }), `${formatAmount(thisYear, 0)} ${currencySymbol}`],
                [t('resumen.automatic'), h.isAutomatic && h.monthlyAmount
                  ? `${formatAmount(h.monthlyAmount, 0)} ${currencySymbol}` : t('resumen.manual')],
              ].map(([label, value], i) => (
                <React.Fragment key={i}>
                  {i > 0 && <View style={[styles.huchaStatSep, { backgroundColor: ui.hair }]} />}
                  <View style={styles.huchaStat}>
                    <Text style={[styles.huchaStatLabel, { color: dc.textSecondary }]}>{label}</Text>
                    <Text style={[styles.huchaStatValue, { color: dc.textPrimary }]}>{value}</Text>
                  </View>
                </React.Fragment>
              ))}
            </View>
          </View>
        );
      })}
    </>
  );

  // ── CABECERA ───────────────────────────────────────────────────────────────
  const hero = (
    <>
      <HeroTitleBar
        title={t('header.annual')}
        right={(
          <MonthSelector
            label={selectorLabel}
            onPrev={() => { lightHaptic(); goOlderMonth(); }}
            onNext={() => { lightHaptic(); goNewerMonth(); }}
            canPrev={canOlder}
            canNext={canNewer}
          />
        )}
      />
      {/* Deslizar a los lados también cambia de mes */}
      <SwipeNavigator onSwipeLeft={goOlderMonth} onSwipeRight={goNewerMonth}>
        <View style={styles.heroTop}>
          <View style={styles.heroBalance}>
            <Text style={[styles.heroLabel, { color: ui.onHeroSoft }]} numberOfLines={1}>
              {t('resumen.balance')} · {selectorLabel}
            </Text>
            <Text style={[styles.heroAmount, { color: ui.onHero }]} numberOfLines={1}>
              {balance >= 0 ? '+' : ''}{formatAmount(balance)} {currencySymbol}
            </Text>
          </View>
          <View style={[styles.modeToggle, { backgroundColor: 'rgba(255,255,255,0.14)' }]}>
            {[false, true].map((isYear) => {
              const on = yearMode === isYear;
              return (
                <TouchableOpacity
                  key={String(isYear)}
                  style={[styles.modeBtn, on && { backgroundColor: '#FFFFFF' }]}
                  onPress={() => {
                    lightHaptic();
                    if (isYear) setYearMode(true);
                    else selectPeriod(selectedYear === currentYear ? currentMonth : selectedMonth, selectedYear);
                  }}
                  activeOpacity={0.8}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.modeText, { color: on ? ui.hero : 'rgba(255,255,255,0.88)' }]}>
                    {t(isYear ? 'resumen.year' : 'resumen.month')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        <View style={styles.heroStats}>
          {totalIncome > 0 && (
            <View style={styles.heroPill}>
              <Text style={[styles.heroPillText, { color: ui.onHero }]}>{savedPct}% {t('resumen.saved')}</Text>
            </View>
          )}
          {balanceDiff !== null && (
            <View style={styles.heroPill}>
              <Ionicons
                name={balanceDiff >= 0 ? 'trending-up-outline' : 'trending-down-outline'}
                size={12}
                color={ui.onHero}
              />
              <Text style={[styles.heroPillText, { color: ui.onHero }]}>
                {balanceDiff >= 0 ? '+' : ''}{formatAmount(balanceDiff, 0)} {currencySymbol} vs {yearMode ? selectedYear - 1 : shortMonth(prevSelMonth)}
              </Text>
            </View>
          )}
        </View>
      </SwipeNavigator>

      {/* Flujo de los últimos 12 meses: tocar una barra elige ese mes */}
      <View style={styles.flowRow}>
        {flowData.map((item) => {
          const incH = Math.max(3, (item.income / flowMax) * FLOW_BAR_H);
          const expH = Math.max(3, (item.expense / flowMax) * FLOW_BAR_H);
          return (
            <TouchableOpacity
              key={`${item.year}-${item.month}`}
              style={[styles.flowGroup, { opacity: item.isSelected ? 1 : 0.5 }]}
              onPress={() => { lightHaptic(); selectPeriod(item.month, item.year); }}
              activeOpacity={0.7}
            >
              <View style={[styles.flowPair, { height: FLOW_BAR_H }]}>
                <View style={[styles.flowBar, { height: incH, backgroundColor: '#FFFFFF' }]} />
                <View style={[styles.flowBar, { height: expH, backgroundColor: 'rgba(255,255,255,0.45)' }]} />
              </View>
              <Text
                style={[styles.flowLabel, { color: ui.onHero }, item.isSelected && styles.flowLabelOn]}
                numberOfLines={1}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.flowLegend}>
        <View style={styles.flowLegendItem}>
          <View style={[styles.flowLegendDot, { backgroundColor: '#FFFFFF' }]} />
          <Text style={[styles.flowLegendText, { color: ui.onHeroSoft }]}>{t('resumen.ingresos')}</Text>
        </View>
        <View style={styles.flowLegendItem}>
          <View style={[styles.flowLegendDot, { backgroundColor: 'rgba(255,255,255,0.45)' }]} />
          <Text style={[styles.flowLegendText, { color: ui.onHeroSoft }]}>{t('resumen.gastos')}</Text>
        </View>
      </View>
    </>
  );

  return (
    <HeroScrollScreen hero={hero}>
      {/* RITMO DEL MES */}
      {rhythm && (
        <View style={styles.rhythm}>
          <SectionHeader title={t('resumen.rhythmTitle')} style={styles.rhythmHeader} />
          {rhythm.diff !== null && Math.round(rhythm.diff) !== 0 && (
            <View style={styles.pad}>
              <View style={[
                styles.badge,
                { backgroundColor: withAlpha(rhythm.diff < 0 ? dc.income : dc.expense, 0.15) },
              ]}>
                <Ionicons
                  name={rhythm.diff < 0 ? 'arrow-down' : 'arrow-up'}
                  size={12}
                  color={rhythm.diff < 0 ? ui.incomeText : ui.expenseText}
                />
                <Text style={[styles.badgeText, { color: rhythm.diff < 0 ? ui.incomeText : ui.expenseText }]}>
                  {t(rhythm.diff < 0 ? 'resumen.lessThanPrev' : 'resumen.moreThanPrev', {
                    amount: `${formatAmount(Math.abs(rhythm.diff))} ${currencySymbol}`,
                    day: rhythm.compareDay,
                  })}
                </Text>
              </View>
            </View>
          )}
          <View style={[styles.pad, styles.rhythmChart]}>
            <RhythmChart current={rhythm.current} previous={rhythm.previous} daysInMonth={rhythm.daysInMonth} />
            <View style={styles.rhythmLegend}>
              <View style={styles.flowLegendItem}>
                <View style={[styles.lineSolid, { backgroundColor: ui.accent }]} />
                <Text style={[styles.legendText, { color: dc.textSecondary }]}>{fullMonth(selectedMonth)}</Text>
              </View>
              {rhythm.previous && (
                <View style={styles.flowLegendItem}>
                  <View style={[styles.lineDash, { borderColor: dc.textSecondary }]} />
                  <Text style={[styles.legendText, { color: dc.textSecondary }]}>{fullMonth(rhythm.prevMonth + 1)}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      )}

      {/* PESTAÑAS */}
      <View style={styles.pad}>
        <SegmentedControl
          options={(['expense', 'income', 'hucha'] as SummaryTab[]).map((tab) => ({ key: tab, label: subTabLabel(tab) }))}
          value={activeTab}
          onChange={(tab) => { lightHaptic(); setActiveTab(tab); }}
        />
      </View>

      {activeTab === 'expense' && renderBreakdown('expense')}
      {activeTab === 'income' && renderBreakdown('income')}
      {activeTab === 'hucha' && renderHuchas()}
    </HeroScrollScreen>
  );
};

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 20 },

  // Cabecera
  heroTop: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10,
    paddingHorizontal: 20, paddingTop: 14,
  },
  heroBalance: { flex: 1, minWidth: 0 },
  heroLabel: { fontSize: 13, fontFamily: 'Poppins_400Regular' },
  heroAmount: { fontSize: 30, fontFamily: 'Poppins_700Bold', letterSpacing: -0.8 },
  modeToggle: { flexDirection: 'row', borderRadius: 10, padding: 3, marginBottom: 6 },
  modeBtn: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  modeText: { fontSize: 12, fontFamily: 'Poppins_600SemiBold' },
  heroStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, marginTop: 8 },
  heroPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4,
  },
  heroPillText: { fontSize: 12, fontFamily: 'Poppins_500Medium' },
  flowRow: { flexDirection: 'row', gap: 4, paddingHorizontal: 20, marginTop: 18 },
  flowGroup: { flex: 1, alignItems: 'center' },
  flowPair: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  flowBar: { width: 7, borderTopLeftRadius: 3, borderTopRightRadius: 3, borderBottomLeftRadius: 1, borderBottomRightRadius: 1 },
  flowLabel: { fontSize: 9.5, fontFamily: 'Poppins_400Regular', marginTop: 5 },
  flowLabelOn: { fontFamily: 'Poppins_700Bold' },
  flowLegend: { flexDirection: 'row', gap: 16, paddingHorizontal: 20, marginTop: 10 },
  flowLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  flowLegendDot: { width: 10, height: 10, borderRadius: 3 },
  flowLegendText: { fontSize: 11.5, fontFamily: 'Poppins_400Regular' },

  // Ritmo del mes
  rhythm: { marginBottom: 22 },
  rhythmHeader: { marginBottom: 6 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    borderRadius: 999, paddingLeft: 8, paddingRight: 10, paddingVertical: 4,
  },
  badgeText: { fontSize: 12, fontFamily: 'Poppins_600SemiBold' },
  rhythmChart: { marginTop: 10 },
  rhythmLegend: { flexDirection: 'row', gap: 16, marginTop: 6 },
  lineSolid: { width: 16, height: 2.5, borderRadius: 2 },
  lineDash: { width: 16, height: 0, borderTopWidth: 2, borderStyle: 'dashed', opacity: 0.7 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11.5, fontFamily: 'Poppins_400Regular' },

  // Bloques
  blockHeader: { marginTop: 22 },
  block: { marginHorizontal: 20, marginTop: 16, borderRadius: 20, padding: 16 },
  blockLabel: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', marginBottom: 4 },

  // Vacío
  empty: { alignItems: 'center', paddingVertical: 36, gap: 10 },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 13.5, fontFamily: 'Poppins_400Regular' },

  // Donut
  pieRow: { flexDirection: 'row', alignItems: 'center', gap: 18, paddingHorizontal: 20, paddingTop: 18 },
  pieCenterBox: { alignItems: 'center' },
  pieCenterNum: { fontSize: 22, fontFamily: 'Poppins_700Bold', lineHeight: 26 },
  pieCenterSub: { fontSize: 10, fontFamily: 'Poppins_500Medium' },
  pieInfoCol: { flex: 1, minWidth: 0 },
  pieInfoLabel: { fontSize: 12, fontFamily: 'Poppins_500Medium', marginBottom: 2 },
  pieInfoAmount: { fontSize: 24, fontFamily: 'Poppins_700Bold', letterSpacing: -0.5 },
  pieInfoSub: { fontSize: 12, fontFamily: 'Poppins_400Regular' },

  // Desglose
  catRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  catIcon: { width: 40, height: 40, borderRadius: 13, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  catContent: { flex: 1, minWidth: 0 },
  catTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  catName: { fontSize: 14.5, fontFamily: 'Poppins_500Medium', flexShrink: 1 },
  catAmount: { fontSize: 14.5, fontFamily: 'Poppins_600SemiBold' },
  catPct: { fontSize: 11.5, fontFamily: 'Poppins_400Regular', marginBottom: 6 },
  catBarTrack: { height: 5, borderRadius: 3, overflow: 'hidden' },
  catBarFill: { height: 5, borderRadius: 3 },

  // Detalle de una categoría
  detail: { borderRadius: 18, padding: 14, marginTop: 4, marginBottom: 10 },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  detailLabel: { fontSize: 11, fontFamily: 'Poppins_600SemiBold', marginBottom: 2 },
  detailAvgBox: { alignItems: 'flex-end' },
  detailAvg: { fontSize: 16, fontFamily: 'Poppins_700Bold' },
  detailBarsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  detailBarGroup: { alignItems: 'center', flex: 1 },
  detailBarVal: { fontSize: 9, fontFamily: 'Poppins_400Regular', marginBottom: 4 },
  detailBarTrack: { width: '100%', justifyContent: 'flex-end', paddingHorizontal: 3 },
  detailBar: { borderTopLeftRadius: 3, borderTopRightRadius: 3, width: '100%' },
  detailBarLabel: { fontSize: 9.5, fontFamily: 'Poppins_400Regular', marginTop: 5 },
  detailDivider: { height: StyleSheet.hairlineWidth, marginTop: 12 },
  detailYearsRow: { flexDirection: 'row', gap: 20, paddingTop: 12 },
  detailYearLbl: { fontSize: 11, fontFamily: 'Poppins_500Medium', marginBottom: 2 },
  detailYearVal: { fontSize: 15, fontFamily: 'Poppins_700Bold' },
  detailToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  detailToggleText: { fontSize: 12.5, fontFamily: 'Poppins_600SemiBold' },
  detailEmpty: { fontSize: 12, fontFamily: 'Poppins_400Regular', textAlign: 'center', paddingVertical: 12 },
  movRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 },
  movDay: { fontSize: 11, fontFamily: 'Poppins_500Medium', width: 52 },
  movTitle: { flex: 1, fontSize: 13, fontFamily: 'Poppins_500Medium' },
  movAmount: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },

  // Huchas
  huchaTotalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' },
  huchaTotal: { fontSize: 28, fontFamily: 'Poppins_700Bold', letterSpacing: -0.6 },
  huchaThisMonth: { fontSize: 13, fontFamily: 'Poppins_500Medium' },
  huchasChartRow: {
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', marginTop: 16, marginBottom: 12,
  },
  huchaBarGroup: { alignItems: 'center', gap: 4 },
  huchaStack: {
    width: 20, borderRadius: 4, overflow: 'hidden',
    flexDirection: 'column-reverse', justifyContent: 'flex-start',
  },
  huchaStackSeg: { width: '100%' },
  huchasLegendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  huchaLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  huchaCard: { marginHorizontal: 20, marginBottom: 10, borderRadius: 20, overflow: 'hidden' },
  huchaCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  huchaCardIcon: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  huchaCardMeta: { flex: 1 },
  huchaCardName: { fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  streakText: { fontSize: 12, fontFamily: 'Poppins_400Regular' },
  huchaStatsRow: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 12 },
  huchaStat: { flex: 1, alignItems: 'center' },
  huchaStatSep: { width: StyleSheet.hairlineWidth, marginVertical: 4 },
  huchaStatLabel: { fontSize: 11, fontFamily: 'Poppins_500Medium', marginBottom: 3 },
  huchaStatValue: { fontSize: 14, fontFamily: 'Poppins_700Bold' },
});

export default AnnualScreen;
