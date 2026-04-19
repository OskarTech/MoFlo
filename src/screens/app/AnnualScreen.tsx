import React, { useMemo, useState } from 'react';
import {
  View, StyleSheet, ScrollView,
  TouchableOpacity, Dimensions, Modal, FlatList,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { BarChart } from 'react-native-gifted-charts';
import { useMovementStore } from '../../store/movementStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useCategoryStore } from '../../store/categoryStore';
import { useSharedAccountStore } from '../../store/sharedAccountStore';
import { useSharedCategoryStore } from '../../store/sharedCategoryStore';
import { usePremium } from '../../hooks/usePremium';
import { useTheme } from '../../hooks/useTheme';
import { colors } from '../../theme';
import { MovementType } from '../../types';
import AppHeader from '../../components/common/AppHeader';
import PremiumModal from '../../components/common/PremiumModal';
import { formatDate } from '../../utils/dateFormat';

const SCREEN_WIDTH = Dimensions.get('window').width;

const AnnualCard = ({
  label, amount, color, icon, currencySymbol,
}: {
  label: string; amount: number; color: string;
  icon: keyof typeof Ionicons.glyphMap; currencySymbol: string;
}) => {
  const { colors: dc } = useTheme();
  return (
    <View style={[styles.annualCard, {
      backgroundColor: dc.surface, borderLeftColor: color, borderColor: dc.border,
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

const DropdownModal = ({
  visible, title, options, selectedValue, onSelect, onDismiss,
}: {
  visible: boolean;
  title: string;
  options: { value: string | null; label: string }[];
  selectedValue: string | null;
  onSelect: (value: string | null) => void;
  onDismiss: () => void;
}) => {
  const { colors: dc } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.dropdownOverlay}>
        <TouchableOpacity style={styles.dropdownBackdrop} activeOpacity={1} onPress={onDismiss} />
        <View style={[styles.dropdownSheet, {
          backgroundColor: dc.surface,
        }]}>
          <View style={[styles.dropdownHandle, { backgroundColor: dc.border }]} />
          <Text style={[styles.dropdownTitle, { color: dc.textPrimary }]}>{title}</Text>
          <FlatList
            data={options}
            keyExtractor={(item) => String(item.value)}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.dropdownOption, { borderBottomColor: dc.border }]}
                onPress={() => { onSelect(item.value); onDismiss(); }}
              >
                <Text style={[
                  styles.dropdownOptionText, { color: dc.textPrimary },
                  item.value === selectedValue && {
                    color: dc.primary,
                    fontFamily: 'Poppins_600SemiBold',
                  },
                ]}>
                  {item.label}
                </Text>
                {item.value === selectedValue && (
                  <Ionicons name="checkmark" size={20} color={dc.primary} />
                )}
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );
};

const AnnualScreen = () => {
  const { t } = useTranslation();
  const {
    selectedAnnualYear, setSelectedAnnualYear,
    getAnnualSummary, movements,
  } = useMovementStore();
  const { getCurrencySymbol } = useSettingsStore();
  const { getCategoryName } = useCategoryStore();
  const { isSharedMode, getSharedCurrencySymbol } = useSharedAccountStore();
  const { getSharedCategoryName } = useSharedCategoryStore();
  const { isPremium, showModal, setShowModal, requirePremium } = usePremium();
  const { colors: dc } = useTheme();

  const currencySymbol = isSharedMode
    ? getSharedCurrencySymbol()
    : getCurrencySymbol();

  const getCatName = (id: string, type: MovementType) =>
    isSharedMode
      ? getSharedCategoryName(id, type, t)
      : getCategoryName(id, type, t);

  const [selectedMonth, setSelectedMonth] = useState<number | null>(
    new Date().getMonth() + 1
  );
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<MovementType | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Filtros vista anual completa
  const [annualTypeFilter, setAnnualTypeFilter] = useState<MovementType | null>(null);
  const [annualCategoryFilter, setAnnualCategoryFilter] = useState<string | null>(null);

  const [showYearModal, setShowYearModal] = useState(false);
  const [showMonthModal, setShowMonthModal] = useState(false);

  const annualData = getAnnualSummary();

  const MONTH_NAMES = [
    t('home.month_0'), t('home.month_1'), t('home.month_2'),
    t('home.month_3'), t('home.month_4'), t('home.month_5'),
    t('home.month_6'), t('home.month_7'), t('home.month_8'),
    t('home.month_9'), t('home.month_10'), t('home.month_11'),
  ];

  const SHORT_MONTHS = MONTH_NAMES.map(m => m[0].toUpperCase());

  const currentYear = new Date().getFullYear();
  const availableYears = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  // ── MOVIMIENTOS DEL MES SELECCIONADO ──────────────────────────
  const monthMovements = useMemo(() => {
    if (!selectedMonth) return [];
    return movements.filter((m) => {
      const d = new Date(m.date);
      return d.getMonth() + 1 === selectedMonth && d.getFullYear() === selectedAnnualYear;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [selectedMonth, movements, selectedAnnualYear]);

  const typeFilteredMovements = useMemo(() => {
    if (!selectedTypeFilter) return monthMovements;
    return monthMovements.filter(m => m.type === selectedTypeFilter);
  }, [monthMovements, selectedTypeFilter]);

  const filteredMonthMovements = useMemo(() => {
    if (!selectedCategory) return typeFilteredMovements;
    return typeFilteredMovements.filter(m => m.category === selectedCategory);
  }, [typeFilteredMovements, selectedCategory]);

  const monthCategories = useMemo(() => {
    const source = selectedTypeFilter
      ? monthMovements.filter(m => m.type === selectedTypeFilter)
      : monthMovements;
    const cats = new Set(source.map(m => m.category));
    return Array.from(cats);
  }, [monthMovements, selectedTypeFilter]);

  const monthSummary = useMemo(() => ({
    income: filteredMonthMovements.filter(m => m.type === 'income').reduce((s, m) => s + m.amount, 0),
    expense: filteredMonthMovements.filter(m => m.type === 'expense').reduce((s, m) => s + m.amount, 0),
    saving: filteredMonthMovements.filter(m => m.type === 'saving').reduce((s, m) => s + m.amount, 0),
  }), [filteredMonthMovements]);

  // ── MOVIMIENTOS DEL AÑO COMPLETO ───────────────────────────────
  const yearMovements = useMemo(() => {
    return movements.filter(m => {
      const d = new Date(m.date);
      return d.getFullYear() === selectedAnnualYear;
    });
  }, [movements, selectedAnnualYear]);

  const annualTypeMovements = useMemo(() => {
    if (!annualTypeFilter) return yearMovements;
    return yearMovements.filter(m => m.type === annualTypeFilter);
  }, [yearMovements, annualTypeFilter]);

  const annualFilteredMovements = useMemo(() => {
    if (!annualCategoryFilter) return annualTypeMovements;
    return annualTypeMovements.filter(m => m.category === annualCategoryFilter);
  }, [annualTypeMovements, annualCategoryFilter]);

  const annualCategories = useMemo(() => {
    const cats = new Set(annualTypeMovements.map(m => m.category));
    return Array.from(cats);
  }, [annualTypeMovements]);

  const annualFilteredTotal = useMemo(() => {
    return annualFilteredMovements.reduce((s, m) => s + m.amount, 0);
  }, [annualFilteredMovements]);

  // ── TOTALES GLOBALES ───────────────────────────────────────────
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

  const TYPE_OPTIONS: {
    type: MovementType; label: string;
    color: string; icon: keyof typeof Ionicons.glyphMap;
  }[] = [
    { type: 'income', label: t('movements.income'), color: colors.income, icon: 'arrow-down-circle' },
    { type: 'expense', label: t('movements.expense'), color: colors.expense, icon: 'arrow-up-circle' },
    { type: 'saving', label: t('movements.saving'), color: colors.savings, icon: 'save' },
  ];

  const yearOptions = availableYears.map(y => ({ value: String(y), label: String(y) }));
  const monthOptions = [
    { value: null, label: t('annual.allYear') },
    ...MONTH_NAMES.map((name, i) => ({ value: String(i + 1), label: name })),
  ];

  const typeColor = annualTypeFilter === 'income' ? colors.income
    : annualTypeFilter === 'expense' ? colors.expense
    : annualTypeFilter === 'saving' ? colors.savings
    : dc.primary;

  const typeIcon: keyof typeof Ionicons.glyphMap = annualTypeFilter === 'income'
    ? 'arrow-down-circle'
    : annualTypeFilter === 'saving' ? 'save' : 'arrow-up-circle';

  return (
    <View style={[styles.container, { backgroundColor: dc.background }]}>
      <AppHeader title={t('header.annual')} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* SELECTORES AÑO Y MES */}
        <View style={styles.filtersRow}>
          <TouchableOpacity
            style={[styles.selectorDropdown, { backgroundColor: dc.surface, borderColor: dc.border }]}
            onPress={() => setShowYearModal(true)}
          >
            <Ionicons name="calendar-outline" size={16} color={dc.primary} />
            <Text style={[styles.selectorDropdownText, { color: dc.textPrimary }]}>
              {selectedAnnualYear}
            </Text>
            <Ionicons name="chevron-down" size={14} color={dc.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.selectorDropdown, { backgroundColor: dc.surface, borderColor: dc.border }]}
            onPress={() => setShowMonthModal(true)}
          >
            <Ionicons name="calendar" size={16} color={dc.primary} />
            <Text style={[styles.selectorDropdownText, { color: dc.textPrimary }]} numberOfLines={1}>
              {selectedMonth ? MONTH_NAMES[selectedMonth - 1] : t('annual.allYear')}
            </Text>
            <Ionicons name="chevron-down" size={14} color={dc.textSecondary} />
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
                  Math.max(...annualData.map(m => Math.max(m.income, m.expense))) * 1.2 || 100
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
                {/* ── VISTA MENSUAL ── */}
                <Text style={[styles.sectionTitle, { color: dc.textPrimary, marginBottom: 12 }]}>
                  {MONTH_NAMES[selectedMonth - 1]} {selectedAnnualYear}
                </Text>

                {/* FILTRO POR TIPO */}
                <View style={styles.typeFilterRow}>
                  {TYPE_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.type}
                      style={[
                        styles.typeFilterChip,
                        { backgroundColor: dc.surface, borderColor: dc.border },
                        selectedTypeFilter === opt.type && {
                          backgroundColor: opt.color,
                          borderColor: opt.color,
                        },
                      ]}
                      onPress={() => {
                        if (selectedTypeFilter === opt.type) {
                          setSelectedTypeFilter(null);
                          setSelectedCategory(null);
                        } else {
                          setSelectedTypeFilter(opt.type);
                          setSelectedCategory(null);
                        }
                      }}
                    >
                      <Ionicons
                        name={opt.icon}
                        size={14}
                        color={selectedTypeFilter === opt.type ? '#FFFFFF' : opt.color}
                      />
                      <Text style={[
                        styles.typeFilterChipText, { color: dc.textSecondary },
                        selectedTypeFilter === opt.type && { color: '#FFFFFF' },
                      ]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* FILTRO CATEGORÍA — solo si hay tipo */}
                {selectedTypeFilter && monthCategories.length > 0 && (
                  <View style={styles.categoryFilterSection}>
                    <View style={styles.categoryFilterHeader}>
                      <Text style={[styles.categoryFilterTitle, { color: dc.textSecondary }]}>
                        {t('annual.filterByCategory')}
                      </Text>
                      {!isPremium && (
                        <View style={styles.premiumBadge}>
                          <Text style={styles.premiumBadgeText}>⭐ PREMIUM</Text>
                        </View>
                      )}
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={styles.categoryChips}>
                        {monthCategories.map((cat) => {
                          const catMovement = monthMovements.find(m => m.category === cat);
                          const catType = catMovement?.type ?? 'expense';
                          return (
                            <TouchableOpacity
                              key={cat}
                              style={[
                                styles.categoryChip,
                                { backgroundColor: dc.surface, borderColor: dc.border },
                                selectedCategory === cat && {
                                  backgroundColor: dc.primary,
                                  borderColor: dc.primary,
                                },
                                !isPremium && styles.categoryChipLocked,
                              ]}
                              onPress={() => requirePremium(() => {
                                setSelectedCategory(selectedCategory === cat ? null : cat);
                              })}
                            >
                              {!isPremium && (
                                <Ionicons name="lock-closed" size={10} color={dc.textSecondary} />
                              )}
                              <Text style={[
                                styles.categoryChipText, { color: dc.textSecondary },
                                selectedCategory === cat && { color: '#FFFFFF' },
                              ]}>
                                {getCatName(cat, catType as MovementType)}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </ScrollView>
                  </View>
                )}

                {/* MOVIMIENTOS DEL MES */}
                {filteredMonthMovements.length > 0 && (
                  <>
                    <Text style={[styles.sectionTitle, { color: dc.textPrimary, marginBottom: 12 }]}>
                      {t('annual.movements')}
                    </Text>
                    {filteredMonthMovements.map((m) => {
                      const isIncome = m.type === 'income';
                      const isSaving = m.type === 'saving';
                      const color = isIncome ? colors.income : isSaving ? colors.savings : colors.expense;
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
                              {getCatName(m.category, m.type)}
                            </Text>
                            <Text style={[styles.movementDate, { color: dc.textSecondary }]}>
                              {formatDate(m.date)}
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

                {/* TOTALES DEL MES */}
                <Text style={[styles.sectionTitle, { color: dc.textPrimary, marginTop: 8, marginBottom: 12 }]}>
                  {t('annual.summary')}
                </Text>
                <AnnualCard label={t('annual.totalIncome')} amount={monthSummary.income} color={colors.income} icon="arrow-down-circle" currencySymbol={currencySymbol} />
                <AnnualCard label={t('annual.totalExpenses')} amount={monthSummary.expense} color={colors.expense} icon="arrow-up-circle" currencySymbol={currencySymbol} />
                <AnnualCard label={t('annual.totalSavings')} amount={monthSummary.saving} color={colors.savings} icon="save" currencySymbol={currencySymbol} />
                <AnnualCard
                  label={t('annual.netBalance')}
                  amount={monthSummary.income - monthSummary.expense - monthSummary.saving}
                  color={(monthSummary.income - monthSummary.expense - monthSummary.saving) >= 0 ? colors.income : colors.expense}
                  icon="wallet" currencySymbol={currencySymbol}
                />
              </>
            ) : (
              <>
                {/* ── VISTA ANUAL COMPLETA ── */}
                <Text style={[styles.sectionTitle, { color: dc.textPrimary, marginBottom: 12 }]}>
                  {t('annual.year')} {selectedAnnualYear}
                </Text>

                {/* FILTRO POR TIPO ANUAL */}
                <View style={styles.typeFilterRow}>
                  {TYPE_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.type}
                      style={[
                        styles.typeFilterChip,
                        { backgroundColor: dc.surface, borderColor: dc.border },
                        annualTypeFilter === opt.type && {
                          backgroundColor: opt.color,
                          borderColor: opt.color,
                        },
                      ]}
                      onPress={() => {
                        if (annualTypeFilter === opt.type) {
                          setAnnualTypeFilter(null);
                          setAnnualCategoryFilter(null);
                        } else {
                          setAnnualTypeFilter(opt.type);
                          setAnnualCategoryFilter(null);
                        }
                      }}
                    >
                      <Ionicons
                        name={opt.icon}
                        size={14}
                        color={annualTypeFilter === opt.type ? '#FFFFFF' : opt.color}
                      />
                      <Text style={[
                        styles.typeFilterChipText, { color: dc.textSecondary },
                        annualTypeFilter === opt.type && { color: '#FFFFFF' },
                      ]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* FILTRO CATEGORÍA ANUAL — solo si hay tipo */}
                {annualTypeFilter && annualCategories.length > 0 && (
                  <View style={styles.categoryFilterSection}>
                    <View style={styles.categoryFilterHeader}>
                      <Text style={[styles.categoryFilterTitle, { color: dc.textSecondary }]}>
                        {t('annual.filterByCategory')}
                      </Text>
                      {!isPremium && (
                        <View style={styles.premiumBadge}>
                          <Text style={styles.premiumBadgeText}>⭐ PREMIUM</Text>
                        </View>
                      )}
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={styles.categoryChips}>
                        {annualCategories.map((cat) => {
                          const catMovement = annualTypeMovements.find(m => m.category === cat);
                          const catType = catMovement?.type ?? annualTypeFilter;
                          return (
                            <TouchableOpacity
                              key={cat}
                              style={[
                                styles.categoryChip,
                                { backgroundColor: dc.surface, borderColor: dc.border },
                                annualCategoryFilter === cat && {
                                  backgroundColor: dc.primary,
                                  borderColor: dc.primary,
                                },
                                !isPremium && styles.categoryChipLocked,
                              ]}
                              onPress={() => requirePremium(() => {
                                setAnnualCategoryFilter(annualCategoryFilter === cat ? null : cat);
                              })}
                            >
                              {!isPremium && (
                                <Ionicons name="lock-closed" size={10} color={dc.textSecondary} />
                              )}
                              <Text style={[
                                styles.categoryChipText, { color: dc.textSecondary },
                                annualCategoryFilter === cat && { color: '#FFFFFF' },
                              ]}>
                                {getCatName(cat, catType as MovementType)}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </ScrollView>
                  </View>
                )}

                {/* TOTAL FILTRADO ANUAL */}
                {annualTypeFilter ? (
                  <>
                    <AnnualCard
                      label={
                        annualCategoryFilter
                          ? `${TYPE_OPTIONS.find(o => o.type === annualTypeFilter)?.label} — ${getCatName(annualCategoryFilter, annualTypeFilter)}`
                          : TYPE_OPTIONS.find(o => o.type === annualTypeFilter)?.label ?? ''
                      }
                      amount={annualFilteredTotal}
                      color={typeColor}
                      icon={typeIcon}
                      currencySymbol={currencySymbol}
                    />

                    <Text style={[styles.sectionTitle, { color: dc.textPrimary, marginTop: 8, marginBottom: 12 }]}>
                      {t('annual.summary')}
                    </Text>
                  </>
                ) : (
                  // Totales globales sin filtro
                  <>
                    <AnnualCard label={t('annual.totalIncome')} amount={totals.income} color={colors.income} icon="arrow-down-circle" currencySymbol={currencySymbol} />
                    <AnnualCard label={t('annual.totalExpenses')} amount={totals.expense} color={colors.expense} icon="arrow-up-circle" currencySymbol={currencySymbol} />
                    <AnnualCard label={t('annual.totalSavings')} amount={totals.saving} color={colors.savings} icon="save" currencySymbol={currencySymbol} />
                    <AnnualCard
                      label={t('annual.netBalance')}
                      amount={totals.balance}
                      color={totals.balance >= 0 ? colors.income : colors.expense}
                      icon="wallet" currencySymbol={currencySymbol}
                    />
                  </>
                )}

                {/* HIGHLIGHTS — siempre visibles */}
                <View style={styles.highlightsRow}>
                  <View style={[styles.highlightCard, { backgroundColor: dc.surface, borderColor: colors.income }]}>
                    <Text style={styles.highlightEmoji}>🏆</Text>
                    <Text style={[styles.highlightLabel, { color: dc.textSecondary }]}>{t('annual.bestMonth')}</Text>
                    <Text style={[styles.highlightMonth, { color: colors.income }]}>{t(`home.month_${bestMonth.month - 1}`)}</Text>
                    <Text style={[styles.highlightAmount, { color: dc.textSecondary }]}>+{bestMonth.balance.toFixed(0)} {currencySymbol}</Text>
                  </View>
                  <View style={[styles.highlightCard, { backgroundColor: dc.surface, borderColor: colors.expense }]}>
                    <Text style={styles.highlightEmoji}>📉</Text>
                    <Text style={[styles.highlightLabel, { color: dc.textSecondary }]}>{t('annual.worstMonth')}</Text>
                    <Text style={[styles.highlightMonth, { color: colors.expense }]}>{t(`home.month_${worstMonth.month - 1}`)}</Text>
                    <Text style={[styles.highlightAmount, { color: dc.textSecondary }]}>-{worstMonth.expense.toFixed(0)} {currencySymbol}</Text>
                  </View>
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* MODAL AÑO */}
      <DropdownModal
        visible={showYearModal}
        title={t('annual.selectYear')}
        options={yearOptions}
        selectedValue={String(selectedAnnualYear)}
        onSelect={(val) => {
          if (val) setSelectedAnnualYear(Number(val));
          setSelectedMonth(null);
          setSelectedTypeFilter(null);
          setSelectedCategory(null);
          setAnnualTypeFilter(null);
          setAnnualCategoryFilter(null);
        }}
        onDismiss={() => setShowYearModal(false)}
      />

      {/* MODAL MES */}
      <DropdownModal
        visible={showMonthModal}
        title={t('annual.selectMonth')}
        options={monthOptions}
        selectedValue={selectedMonth ? String(selectedMonth) : null}
        onSelect={(val) => {
          setSelectedMonth(val ? Number(val) : null);
          setSelectedTypeFilter(null);
          setSelectedCategory(null);
          setAnnualTypeFilter(null);
          setAnnualCategoryFilter(null);
        }}
        onDismiss={() => setShowMonthModal(false)}
      />

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
  filtersRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  selectorDropdown: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    gap: 8, borderRadius: 12, borderWidth: 0.5,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  selectorDropdownText: {
    flex: 1, fontSize: 13, fontFamily: 'Poppins_600SemiBold',
  },
  chartCard: { borderRadius: 20, padding: 16, marginBottom: 16, borderWidth: 0.5 },
  sectionTitle: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', marginBottom: 12 },
  chartHint: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginBottom: 12 },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, fontFamily: 'Poppins_400Regular' },
  typeFilterRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  typeFilterChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6,
    paddingVertical: 8, borderRadius: 12, borderWidth: 0.5,
  },
  typeFilterChipText: { fontSize: 12, fontFamily: 'Poppins_500Medium' },
  categoryFilterSection: { marginBottom: 16 },
  categoryFilterHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  categoryFilterTitle: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.8 },
  premiumBadge: { backgroundColor: colors.savings + '20', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  premiumBadgeText: { fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: colors.savings },
  categoryChips: { flexDirection: 'row', gap: 8 },
  categoryChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 0.5 },
  categoryChipLocked: { opacity: 0.6 },
  categoryChipText: { fontSize: 12, fontFamily: 'Poppins_500Medium' },
  annualCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 16, marginBottom: 10, borderLeftWidth: 4, borderWidth: 0.5, gap: 14 },
  annualCardIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  annualCardAmount: { fontSize: 18, fontFamily: 'Poppins_700Bold' },
  annualCardLabel: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 2 },
  highlightsRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  highlightCard: { flex: 1, borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1.5 },
  highlightEmoji: { fontSize: 28, marginBottom: 8 },
  highlightLabel: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginBottom: 4, textAlign: 'center' },
  highlightMonth: { fontSize: 16, fontFamily: 'Poppins_700Bold', marginBottom: 4 },
  highlightAmount: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
  movementRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 12, marginBottom: 8, borderWidth: 0.5 },
  movementIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  movementInfo: { flex: 1 },
  movementDesc: { fontSize: 13, fontFamily: 'Poppins_500Medium' },
  movementDate: { fontSize: 11, fontFamily: 'Poppins_400Regular', marginTop: 2 },
  movementAmount: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
  emptyState: { alignItems: 'center', paddingVertical: 80 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyText: { fontSize: 18, fontFamily: 'Poppins_600SemiBold', marginBottom: 8 },
  emptySubtext: { fontSize: 13, fontFamily: 'Poppins_400Regular', textAlign: 'center', paddingHorizontal: 32 },
  dropdownOverlay: { flex: 1, justifyContent: 'flex-end' },
  dropdownBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  dropdownSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, maxHeight: '60%' },
  dropdownHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  dropdownTitle: { fontSize: 20, fontFamily: 'Poppins_700Bold', marginBottom: 16 },
  dropdownOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 0.5 },
  dropdownOptionText: { fontSize: 15, fontFamily: 'Poppins_400Regular' },
});

export default AnnualScreen;