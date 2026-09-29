import React, { useMemo, useRef, useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import Icon from '../../components/common/Icon';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMovementStore } from '../../store/movementStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useSharedAccountStore } from '../../store/sharedAccountStore';
import { useTheme } from '../../hooks/useTheme';
import { useCategoryInfo } from '../../hooks/useCategoryInfo';
import { MovementType } from '../../types';
import { formatAmount, splitAmountParts } from '../../utils/formatAmount';
import { withAlpha } from '../../utils/color';
import { getDateLocale } from '../../utils/dateFormat';
import { successHaptic, lightHaptic } from '../../utils/haptics';
import { HeroScrollScreen } from '../../components/layout/HeroScreen';
import { HeroIconButton } from '../../components/layout/HeroBar';
import { SectionHeader } from '../../components/layout/SheetSection';
import AccountSwitcher from '../../components/common/AccountSwitcher';
import MovementItem from '../../components/common/MovementItem';
import StrikeText from '../../components/common/StrikeText';
import DailySummaryModal, { DailySummaryOrigin } from '../../components/home/DailySummaryModal';
import MonthTypeSummaryModal from '../../components/home/MonthTypeSummaryModal';
import { useWalkthroughTarget } from '../../components/walkthrough/useWalkthroughTarget';
import { useWalkthroughStore, WALKTHROUGH_STEPS } from '../../store/walkthroughStore';

// El balance es lo que más debe destacar de Inicio: parte entera, decimales
// con la moneda, y el signo si es negativo
const BALANCE_INT_MAX_SIZE = 54;
const BALANCE_INT_MIN_SIZE = 22;
const BALANCE_DEC_SIZE = 28;
const BALANCE_SIGN_SIZE = 43;
const HIDE_KEY = '@moflo_hide_balance';
const HIDDEN = '••••';

// Posición del elemento pulsado: la ventana flotante crece desde ahí
const pressWithOrigin = (
  ref: React.RefObject<View | null>,
  onPress: (origin: DailySummaryOrigin | null) => void,
) => {
  if (!ref.current) return onPress(null);
  ref.current.measureInWindow((x, y, width, height) => {
    onPress(width > 0 ? { x, y, width, height } : null);
  });
};

/** Cabecera de color de Inicio: balance del mes, barra de lo gastado, y lo que entra y sale */
const BalanceHero = ({
  balance, month, currencySymbol, totalIncome, totalExpense, hidden, onToggleHidden,
  onPressIncome, onPressExpense, onPressDaily,
}: {
  balance: number; month: number; currencySymbol: string;
  totalIncome: number; totalExpense: number;
  hidden: boolean; onToggleHidden: () => void;
  onPressIncome: (origin: DailySummaryOrigin | null) => void;
  onPressExpense: (origin: DailySummaryOrigin | null) => void;
  onPressDaily: (origin: DailySummaryOrigin | null) => void;
}) => {
  const { t } = useTranslation();
  const { ui } = useTheme();
  const balanceRef = useWalkthroughTarget('home_balance');
  const dailyBtnRef = useRef<View>(null);
  const incomeRef = useRef<View>(null);
  const expenseRef = useRef<View>(null);

  const spentPct = totalIncome > 0 ? Math.min(100, Math.round((totalExpense / totalIncome) * 100)) : 0;
  const { intPart, decPart, decimalSeparator } = splitAmountParts(Math.abs(balance));

  // iOS (nueva arquitectura) puede dibujar vacío un Text con adjustsFontSizeToFit dentro
  // de una fila con flexShrink: el tamaño de la parte entera se calcula a mano según
  // el ancho disponible y el número de dígitos (igual en Android e iOS).
  const [amountRowWidth, setAmountRowWidth] = useState(0);
  const intFontSize = useMemo(() => {
    if (!amountRowWidth) return BALANCE_INT_MAX_SIZE;
    const decWidth = (decPart.length + 2 + currencySymbol.length) * BALANCE_DEC_SIZE * 0.65; // ",00 €"
    const signWidth = balance < 0 ? BALANCE_SIGN_SIZE * 0.6 + 2 : 0;
    const available = amountRowWidth - decWidth - signWidth - 4;
    // Ancho aproximado por dígito en Poppins Bold: 0.7em - 1.5px de letterSpacing
    const size = (available / intPart.length + 1.5) / 0.7;
    return Math.max(BALANCE_INT_MIN_SIZE, Math.min(BALANCE_INT_MAX_SIZE, Math.floor(size)));
  }, [amountRowWidth, intPart, decPart, currencySymbol, balance]);
  const intLineHeight = Math.round(intFontSize * (Platform.OS === 'ios' ? 62 / 48 : 56 / 48));

  const stat = (
    ref: React.RefObject<View | null>, onPress: (o: DailySummaryOrigin | null) => void,
    icon: 'arrow-down' | 'arrow-up', label: string, amount: number, alignEnd?: boolean,
  ) => (
    <View ref={ref} collapsable={false} style={alignEnd && styles.statEnd}>
      <TouchableOpacity onPress={() => pressWithOrigin(ref, onPress)} activeOpacity={0.7} hitSlop={6}>
        <View style={[styles.statLabelRow, alignEnd && styles.statLabelRowEnd]}>
          <View style={[styles.statIcon, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <Icon name={icon} size={13} color={ui.onHero} />
          </View>
          <Text style={[styles.statLabel, { color: ui.onHeroSoft }]}>{label}</Text>
        </View>
        <Text style={[styles.statAmount, { color: ui.onHero }]} numberOfLines={1}>
          {hidden ? `${HIDDEN} ${currencySymbol}` : `${formatAmount(amount)} ${currencySymbol}`}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View ref={balanceRef} collapsable={false} style={styles.balance}>
      <View style={styles.balanceTop}>
        <View style={styles.labelRow}>
          <Text style={[styles.balanceLabel, { color: ui.onHeroSoft }]} numberOfLines={1}>
            {t('home.availableBalance')} · {t(`home.month_${month - 1}`)}
          </Text>
          <TouchableOpacity
            onPress={onToggleHidden}
            hitSlop={10}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t(hidden ? 'home.showAmounts' : 'home.hideAmounts')}
          >
            <Icon name={hidden ? 'eye-off-outline' : 'eye-outline'} size={17} color={ui.onHeroSoft} />
          </TouchableOpacity>
        </View>
        <View ref={dailyBtnRef} collapsable={false}>
          <TouchableOpacity
            style={[styles.todayBtn, { backgroundColor: 'rgba(255,255,255,0.18)' }]}
            onPress={() => pressWithOrigin(dailyBtnRef, onPressDaily)}
            activeOpacity={0.7}
            hitSlop={8}
          >
            <Text style={[styles.todayText, { color: ui.onHero }]}>{t('home.today')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.amountRow} onLayout={(e) => setAmountRowWidth(e.nativeEvent.layout.width)}>
        {hidden ? (
          <Text style={[styles.amountInt, { fontSize: BALANCE_INT_MAX_SIZE, lineHeight: intLineHeight, color: ui.onHero }]}>
            {HIDDEN}
          </Text>
        ) : (
          <>
            {balance < 0 && <Text style={[styles.amountSign, { color: ui.onHero }]}>-</Text>}
            <Text
              style={[styles.amountInt, { fontSize: intFontSize, lineHeight: intLineHeight, color: ui.onHero }]}
              numberOfLines={1}
            >
              {intPart}
            </Text>
            <Text style={styles.amountDec}>{decimalSeparator}{decPart} {currencySymbol}</Text>
          </>
        )}
      </View>

      <View style={styles.track}>
        <View style={[styles.trackFill, { width: `${spentPct}%` }]} />
      </View>
      <Text style={[styles.trackCaption, { color: ui.onHeroSoft }]} numberOfLines={1}>
        {totalIncome > 0 ? `${spentPct}% ${t('home.ofIncomeSpent')}` : t('resumen.noIncome')}
      </Text>

      <View style={styles.statsRow}>
        {stat(incomeRef, onPressIncome, 'arrow-down', t('home.income'), totalIncome)}
        {stat(expenseRef, onPressExpense, 'arrow-up', t('home.expenses'), totalExpense, true)}
      </View>
    </View>
  );
};

const HomeScreen = () => {
  const { t } = useTranslation();
  const { colors: dc, ui } = useTheme();
  const cat = useCategoryInfo();
  const navigation = useNavigation<any>();
  const scrollRef = useRef<ScrollView>(null);
  const [showDailySummary, setShowDailySummary] = useState(false);
  const [dailyOrigin, setDailyOrigin] = useState<DailySummaryOrigin | null>(null);
  // Ingresos o gastos del mes en pantalla flotante (el tipo se mantiene durante el cierre)
  const [showTypeSummary, setShowTypeSummary] = useState(false);
  const [typeSummary, setTypeSummary] = useState<{ type: MovementType; origin: DailySummaryOrigin | null }>({
    type: 'expense', origin: null,
  });
  const [hidden, setHidden] = useState(false);
  const wtIsActive = useWalkthroughStore(s => s.isActive);
  const wtCurrentStep = useWalkthroughStore(s => s.currentStep);

  useEffect(() => {
    AsyncStorage.getItem(HIDE_KEY).then((v) => setHidden(v === '1')).catch(() => {});
  }, []);
  const toggleHidden = () => {
    lightHaptic();
    setHidden((h) => {
      AsyncStorage.setItem(HIDE_KEY, h ? '0' : '1').catch(() => {});
      return !h;
    });
  };

  useEffect(() => {
    if (!wtIsActive) return;
    const step = WALKTHROUGH_STEPS[wtCurrentStep];
    if (step?.tab === 'HomeTab') {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  }, [wtIsActive, wtCurrentStep]);

  const { getCurrencySymbol, language } = useSettingsStore();
  const { isSharedMode, getSharedCurrencySymbol, sharedAccount } = useSharedAccountStore();

  const {
    movements, getMonthlySummary, getMovementsForSelectedMonth,
    loadData, loadSharedData, setShowMovementModal,
  } = useMovementStore();
  const [refreshing, setRefreshing] = useState(false);

  // Fuerza una recarga desde Firestore. Respeta el modo activo: en cuenta
  // compartida recarga la cuenta, en individual los datos propios.
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      if (isSharedMode && sharedAccount) {
        await loadSharedData(sharedAccount.id);
      } else {
        await loadData();
      }
      successHaptic();
    } catch (e) {
      console.error('Error refreshing home:', e);
    } finally {
      setRefreshing(false);
    }
  };
  const summary = getMonthlySummary();
  const monthMovements = getMovementsForSelectedMonth();
  const currencySymbol = isSharedMode ? getSharedCurrencySymbol() : getCurrencySymbol();

  const recentMovements = useMemo(() =>
    [...movements].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5),
  [movements]);

  // La fecha de cada movimiento, como antes del rediseño: hoy con la hora,
  // ayer, y el resto con el día y el mes
  const formatMovementTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayMidnight = new Date(todayMidnight);
    yesterdayMidnight.setDate(yesterdayMidnight.getDate() - 1);
    const movMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (movMidnight.getTime() === todayMidnight.getTime()) {
      const hh = date.getHours().toString().padStart(2, '0');
      const mm = date.getMinutes().toString().padStart(2, '0');
      return `${t('home.today')}, ${hh}:${mm}`;
    }
    if (movMidnight.getTime() === yesterdayMidnight.getTime()) {
      return t('home.yesterday');
    }
    return date.toLocaleDateString(getDateLocale(language), { day: 'numeric', month: 'short' });
  };

  // Todas las categorías con gasto este mes, de la que más a la que menos
  const expenseCategories = useMemo(() => {
    const byCategory: Record<string, number> = {};
    monthMovements.filter(m => m.type === 'expense').forEach(m => {
      byCategory[m.category] = (byCategory[m.category] ?? 0) + m.amount;
    });
    const total = summary.totalExpense;
    return Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: total > 0 ? (amount / total) * 100 : 0,
      }));
  }, [monthMovements, summary.totalExpense]);

  const hero = (
    <>
      <View style={styles.bar}>
        <AccountSwitcher />
        <View style={styles.barRight}>
          <HeroIconButton
            icon="notifications-outline"
            onPress={() => navigation.navigate('Reminders')}
            accessibilityLabel={t('header.reminders')}
          />
          <HeroIconButton
            icon="settings-outline"
            onPress={() => navigation.navigate('Settings', { screen: 'SettingsMain' })}
            accessibilityLabel={t('header.settings_screen')}
          />
        </View>
      </View>
      <BalanceHero
        balance={summary.balance}
        month={summary.month}
        currencySymbol={currencySymbol}
        totalIncome={summary.totalIncome}
        totalExpense={summary.totalExpense}
        hidden={hidden}
        onToggleHidden={toggleHidden}
        onPressIncome={(origin) => { setTypeSummary({ type: 'income', origin }); setShowTypeSummary(true); }}
        onPressExpense={(origin) => { setTypeSummary({ type: 'expense', origin }); setShowTypeSummary(true); }}
        onPressDaily={(origin) => { setDailyOrigin(origin); setShowDailySummary(true); }}
      />
    </>
  );

  return (
    <>
      <HeroScrollScreen
        hero={hero}
        scrollRef={scrollRef}
        refreshing={refreshing}
        onRefresh={handleRefresh}
      >
        {/* DÓNDE VA TU DINERO */}
        <SectionHeader
          title={t('home.whereMoneyGoes')}
          action={t('home.seeAll')}
          onAction={() => navigation.navigate('AnnualTab')}
        />
        {expenseCategories.length === 0 ? (
          <Text style={[styles.emptyText, styles.emptyPad, { color: dc.textSecondary }]}>
            {t('home.noExpenses')}
          </Text>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cards}
          >
            {expenseCategories.map(({ category, amount, percentage }) => {
              const color = cat.colors.expense(category);
              return (
                <View key={category} style={[styles.catCard, { backgroundColor: ui.field }]}>
                  <View style={[styles.catIcon, { backgroundColor: withAlpha(color, 0.16) }]}>
                    <Icon name={cat.icon(category, 'expense')} size={18} color={color} />
                  </View>
                  <Text style={[styles.catName, { color: dc.textPrimary }]} numberOfLines={1}>
                    <StrikeText struck={cat.deleted(category, 'expense')}>{cat.name(category, 'expense')}</StrikeText>
                  </Text>
                  <Text style={[styles.catAmount, { color: dc.textPrimary }]} numberOfLines={1}>
                    {formatAmount(amount)} {currencySymbol}
                  </Text>
                  <View style={[styles.catTrack, { backgroundColor: ui.fill2 }]}>
                    <View style={[styles.catFill, { width: `${percentage}%`, backgroundColor: color }]} />
                  </View>
                  <Text style={[styles.catPct, { color: dc.textSecondary }]} numberOfLines={1}>
                    {Math.round(percentage)}% {t('resumen.ofExpense')}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        )}

        {/* ÚLTIMOS MOVIMIENTOS */}
        <SectionHeader
          title={t('home.recentMovements')}
          action={t('home.seeAll')}
          onAction={() => navigation.navigate('HistorialTab')}
          style={styles.recentHeader}
        />
        <View style={styles.list}>
          {recentMovements.length === 0 ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: dc.textSecondary }]}>{t('home.noMovements')}</Text>
              <TouchableOpacity
                style={[styles.emptyAction, { backgroundColor: dc.primary }]}
                onPress={() => { lightHaptic(); setShowMovementModal(true); }}
                activeOpacity={0.85}
              >
                <Icon name="add" size={16} color="#FFFFFF" />
                <Text style={styles.emptyActionText}>{t('home.addFirstMovement')}</Text>
              </TouchableOpacity>
            </View>
          ) : recentMovements.map((mov) => (
            <MovementItem
              key={mov.id}
              movement={mov}
              currencySymbol={currencySymbol}
              detail={formatMovementTime(mov.date)}
              redExpenses
            />
          ))}
        </View>
      </HeroScrollScreen>

      <DailySummaryModal
        visible={showDailySummary}
        origin={dailyOrigin}
        onDismiss={() => setShowDailySummary(false)}
      />
      <MonthTypeSummaryModal
        visible={showTypeSummary}
        type={typeSummary.type}
        origin={typeSummary.origin}
        onDismiss={() => setShowTypeSummary(false)}
        onSeeAll={(type) => navigation.navigate('HistorialTab', { initialFilter: type })}
      />
    </>
  );
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingLeft: 18, paddingRight: 16, paddingTop: 8, minHeight: 54,
  },
  barRight: { marginLeft: 'auto', flexDirection: 'row', gap: 8 },

  // Cabecera de color
  balance: { paddingHorizontal: 20, paddingTop: 14 },
  balanceTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  balanceLabel: { fontSize: 13.5, fontFamily: 'Poppins_500Medium', flexShrink: 1 },
  todayBtn: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4 },
  todayText: { fontSize: 12, fontFamily: 'Poppins_600SemiBold' },
  amountRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 4 },
  amountSign: { fontSize: BALANCE_SIGN_SIZE, fontFamily: 'Poppins_700Bold', lineHeight: 56, marginRight: 2 },
  // fontSize y lineHeight se calculan según el ancho disponible.
  // Sin flexShrink: en iOS comprimía la parte entera hasta dejarla invisible.
  amountInt: { fontFamily: 'Poppins_700Bold', letterSpacing: -1.5 },
  amountDec: {
    color: 'rgba(255,255,255,0.8)', fontSize: BALANCE_DEC_SIZE,
    fontFamily: 'Poppins_600SemiBold', marginBottom: 6, marginLeft: 1,
  },
  track: {
    height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.22)',
    marginTop: 14, overflow: 'hidden',
  },
  trackFill: { height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' },
  trackCaption: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 7 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, gap: 12 },
  statEnd: { alignItems: 'flex-end' },
  statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 4 },
  statLabelRowEnd: { justifyContent: 'flex-end' },
  statIcon: { width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  statLabel: { fontSize: 12.5, fontFamily: 'Poppins_500Medium' },
  statAmount: { fontSize: 18, fontFamily: 'Poppins_700Bold', letterSpacing: -0.3 },

  // Hoja
  cards: { paddingHorizontal: 20, gap: 10, paddingBottom: 4 },
  catCard: { width: 128, borderRadius: 20, padding: 14 },
  catIcon: { width: 34, height: 34, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  catName: { fontSize: 13, fontFamily: 'Poppins_500Medium', marginTop: 12 },
  catAmount: { fontSize: 16, fontFamily: 'Poppins_700Bold', marginTop: 1 },
  catTrack: { height: 4, borderRadius: 2, marginTop: 10, overflow: 'hidden' },
  catFill: { height: 4, borderRadius: 2 },
  catPct: { fontSize: 11, fontFamily: 'Poppins_400Regular', marginTop: 4 },
  recentHeader: { marginTop: 26 },
  list: { paddingHorizontal: 20 },
  empty: { alignItems: 'center', paddingVertical: 20 },
  emptyPad: { paddingHorizontal: 20 },
  emptyText: { fontSize: 13.5, fontFamily: 'Poppins_400Regular' },
  emptyAction: {
    marginTop: 14, paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  emptyActionText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: '#FFFFFF' },
});

export default HomeScreen;
