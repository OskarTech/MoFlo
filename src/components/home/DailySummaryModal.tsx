import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View, StyleSheet, Modal, TouchableOpacity, ScrollView, Animated, Easing, AppState, useWindowDimensions,
  Platform, StatusBar,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMovementStore } from '../../store/movementStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useCategoryStore } from '../../store/categoryStore';
import { useSharedAccountStore } from '../../store/sharedAccountStore';
import { useSharedCategoryStore } from '../../store/sharedCategoryStore';
import { useTheme } from '../../hooks/useTheme';
import { Movement, MovementType } from '../../types';
import { formatAmount as formatAmountLocalized } from '../../utils/formatAmount';
import { getMemberLabel } from '../../utils/memberLabel';
import MemberName from '../common/MemberName';
import StrikeText from '../common/StrikeText';

const CAT_COLORS = [
  '#E8735A', '#4A6FD9', '#7BC67E', '#F5A623',
  '#9B59B6', '#E74C3C', '#2ECC71', '#F39C12',
  '#1ABC9C', '#E67E22', '#3498DB', '#8E44AD',
];

const INCOME_CAT_COLORS = [
  '#2ECC71', '#0D9488', '#A8C23F', '#1A7A4A',
  '#48D1CC', '#6BCB3A', '#00796B', '#C6E03A',
  '#4DB6AC', '#388E3C', '#B2E061', '#00695C',
];

const LOCALES: Record<string, string> = {
  es: 'es-ES', en: 'en-US', pl: 'pl-PL', de: 'de-DE', fr: 'fr-FR', it: 'it-IT', pt: 'pt-PT',
};

// Mismo margen lateral que la tarjeta de balance de la home
const CARD_MARGIN = 16;
const DAY_MS = 24 * 60 * 60 * 1000;

// Medianoche (00:00 local) del día actual
const startOfToday = () => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
};

export interface DailySummaryOrigin {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CategoryGroup {
  category: string;
  type: MovementType;
  amount: number;
  color: string;
  movements: Movement[];
}

interface Props {
  visible: boolean;
  origin: DailySummaryOrigin | null;
  onDismiss: () => void;
}

const formatAmount = (n: number) => formatAmountLocalized(n);

const DailySummaryModal = ({ visible, origin, onDismiss }: Props) => {
  const { t } = useTranslation();
  const { colors: dc } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const { movements } = useMovementStore();
  const { getCurrencySymbol, language } = useSettingsStore();
  const { getCategoryName, getCategoryIcon, isCategoryDeleted } = useCategoryStore();
  const { isSharedMode, getSharedCurrencySymbol, sharedAccount } = useSharedAccountStore();
  const { getSharedCategoryName, getSharedCategoryIcon, isSharedCategoryDeleted } = useSharedCategoryStore();

  // 0 = hoy, -1 = ayer, ...
  const [dayOffset, setDayOffset] = useState(0);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [today, setToday] = useState(startOfToday);
  const todayRef = useRef(today);

  const progress = useRef(new Animated.Value(0)).current;
  const closingRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    const current = startOfToday();
    todayRef.current = current;
    setToday(current);
    setDayOffset(0);
    setExpandedKey(null);
    closingRef.current = false;
    progress.setValue(0);
    Animated.spring(progress, {
      toValue: 1, damping: 22, stiffness: 220, mass: 0.9, useNativeDriver: true,
    }).start();
  }, [visible]);

  // A las 00:00 empieza un día nuevo: "Hoy" pasa a ser el nuevo día (vacío)
  // y si se estaba viendo un día anterior se mantiene la misma fecha.
  useEffect(() => {
    if (!visible) return;

    const syncToday = () => {
      const current = startOfToday();
      const prev = todayRef.current;
      if (current === prev) return;
      const daysPassed = Math.round((current - prev) / DAY_MS);
      todayRef.current = current;
      setToday(current);
      setDayOffset(o => (o === 0 ? 0 : o - daysPassed));
      setExpandedKey(null);
    };

    let timer: ReturnType<typeof setTimeout>;
    const scheduleMidnight = () => {
      const now = new Date();
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
      timer = setTimeout(() => {
        syncToday();
        scheduleMidnight();
      }, nextMidnight - now.getTime() + 500);
    };
    scheduleMidnight();

    // Los timers se pausan en segundo plano: al volver a la app se comprueba el día
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') syncToday();
    });

    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [visible]);

  const close = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    Animated.timing(progress, {
      toValue: 0, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true,
    }).start(() => onDismiss());
  };

  // ── Geometría: rectángulo flotante centrado ─────────────────────────────
  const cardW = winW - CARD_MARGIN * 2;
  const availableH = winH - insets.top - insets.bottom - CARD_MARGIN * 4;
  const cardH = Math.min(availableH, winH * (winH < 700 ? 0.82 : 0.72), 640);
  const cardTop = insets.top + (winH - insets.top - insets.bottom - cardH) / 2;

  // Se expande desde el botón "Hoy" y vuelve a él al cerrar
  // Android: measureInWindow devuelve Y descontando la barra de estado, pero el Modal
  // (statusBarTranslucent) empieza en el borde superior de la pantalla. En iOS coinciden.
  const androidStatusBarOffset = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0;
  const from = origin
    ? { ...origin, y: origin.y + androidStatusBarOffset }
    : { x: winW / 2 - 20, y: cardTop + cardH / 2 - 12, width: 40, height: 24 };
  const dx = from.x + from.width / 2 - winW / 2;
  const dy = from.y + from.height / 2 - (cardTop + cardH / 2);

  const cardTransform = [
    { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [dx, 0] }) },
    { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [dy, 0] }) },
    { scaleX: progress.interpolate({ inputRange: [0, 1], outputRange: [from.width / cardW, 1] }) },
    { scaleY: progress.interpolate({ inputRange: [0, 1], outputRange: [from.height / cardH, 1] }) },
  ];
  const cardOpacity = progress.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' });
  const contentOpacity = progress.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 0, 1], extrapolate: 'clamp' });
  const backdropOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' });

  const currencySymbol = isSharedMode ? getSharedCurrencySymbol() : getCurrencySymbol();

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

  // Día seleccionado: de 00:00 a 23:59:59 en hora local (seguro frente a cambios de horario)
  const { dayStart, dayEnd } = useMemo(() => {
    const base = new Date(today);
    return {
      dayStart: new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset),
      dayEnd: new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset + 1),
    };
  }, [today, dayOffset]);

  const dayMovements = useMemo(() =>
    movements
      .filter(m => {
        const ts = new Date(m.date).getTime();
        return ts >= dayStart.getTime() && ts < dayEnd.getTime();
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [movements, dayStart, dayEnd],
  );

  const totalIncome = dayMovements.filter(m => m.type === 'income').reduce((s, m) => s + m.amount, 0);
  const totalExpense = dayMovements.filter(m => m.type === 'expense').reduce((s, m) => s + m.amount, 0);
  const balance = totalIncome - totalExpense;

  const groupByCategory = (type: MovementType, palette: string[]): CategoryGroup[] => {
    const groups: Record<string, Movement[]> = {};
    dayMovements
      .filter(m => m.type === type)
      .forEach(m => { (groups[m.category] ??= []).push(m); });
    return Object.entries(groups)
      .map(([category, movs]) => ({
        category,
        type,
        movements: movs,
        amount: movs.reduce((s, m) => s + m.amount, 0),
        color: '',
      }))
      .sort((a, b) => b.amount - a.amount)
      .map((g, i) => ({ ...g, color: palette[i % palette.length] }));
  };

  const expenseGroups = useMemo(() => groupByCategory('expense', CAT_COLORS), [dayMovements]);
  const incomeGroups = useMemo(() => groupByCategory('income', INCOME_CAT_COLORS), [dayMovements]);

  const dayLabel = (() => {
    if (dayOffset === 0) return t('home.today');
    if (dayOffset === -1) return t('home.yesterday');
    const weekday = dayStart.toLocaleDateString(LOCALES[language] ?? 'es-ES', { weekday: 'long' });
    return weekday.charAt(0).toUpperCase() + weekday.slice(1);
  })();
  const dateLabel = `${dayStart.getDate()} ${t(`home.month_${dayStart.getMonth()}`)} ${dayStart.getFullYear()}`;

  const goToDay = (offset: number) => {
    setDayOffset(Math.min(0, offset));
    setExpandedKey(null);
  };

  const balanceSign = balance > 0 ? '+' : balance < 0 ? '-' : '';

  const renderGroups = (title: string, groups: CategoryGroup[], accent: string) => {
    if (groups.length === 0) return null;
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionDot, { backgroundColor: accent }]} />
          <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>{title.toUpperCase()}</Text>
        </View>
        <View style={[styles.card, { backgroundColor: dc.surface, borderColor: dc.border }]}>
          {groups.map((g, i) => {
            const key = `${g.type}_${g.category}`;
            const isExpanded = expandedKey === key;
            const isIncome = g.type === 'income';
            return (
              <View key={key} style={isExpanded && { backgroundColor: g.color + '10' }}>
                {i > 0 && <View style={[styles.rowDivider, { backgroundColor: dc.border }]} />}
                <TouchableOpacity
                  style={styles.catRow}
                  onPress={() => setExpandedKey(prev => (prev === key ? null : key))}
                  activeOpacity={0.7}
                >
                  <View style={[styles.catIcon, { backgroundColor: g.color + '20' }]}>
                    <Ionicons name={getCatIcon(g.category, g.type)} size={18} color={g.color} />
                  </View>
                  <View style={styles.catContent}>
                    <Text style={[styles.catName, { color: dc.textPrimary }]} numberOfLines={1}>
                      {renderCatName(g.category, g.type)}
                    </Text>
                    <Text style={[styles.catCount, { color: dc.textSecondary }]}>
                      {t('home.movementCount', { count: g.movements.length })}
                    </Text>
                  </View>
                  <Text style={[styles.catAmount, { color: isIncome ? dc.income : dc.expense }]} numberOfLines={1}>
                    {isIncome ? '+' : '-'}{formatAmount(g.amount)} {currencySymbol}
                  </Text>
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={isExpanded ? g.color : dc.textSecondary}
                  />
                </TouchableOpacity>

                {isExpanded && (
                  <View style={[styles.movList, { borderLeftColor: g.color }]}>
                    {g.movements.map((mov, idx) => {
                      const d = new Date(mov.date);
                      const time = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
                      // Tachado si quien lo añadió ya no está en la cuenta
                      const member = isSharedMode
                        ? getMemberLabel(sharedAccount, mov.addedBy, t('sharedAccount.formerMember'))
                        : undefined;
                      // Los recurrentes se generan a las 00:00: se muestra la etiqueta en vez de la hora
                      const subtitle = mov.isRecurring
                        ? t(isIncome ? 'movementsList.recurringIncome' : 'movementsList.recurringExpense')
                        : member
                          ? <>{`${time} · `}<MemberName member={member} /></>
                          : time;
                      return (
                        <View key={mov.id}>
                          {idx > 0 && <View style={[styles.movDivider, { backgroundColor: g.color + '30' }]} />}
                          <View style={styles.movRow}>
                            <View style={styles.movInfo}>
                              <Text style={[styles.movTitle, { color: dc.textPrimary }]} numberOfLines={1}>
                                {mov.note || renderCatName(mov.category, mov.type)}
                              </Text>
                              <Text style={[styles.movSubtitle, { color: dc.textSecondary }]} numberOfLines={1}>
                                {subtitle}
                              </Text>
                            </View>
                            <Text style={[styles.movAmount, { color: dc.textPrimary }]} numberOfLines={1}>
                              {isIncome ? '+' : '-'}{formatAmount(mov.amount)} {currencySymbol}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={close}
    >
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={close} />
      </Animated.View>

      {/* Capa exterior: posición, animación y sombra (sin overflow para que iOS pinte la sombra) */}
      <Animated.View
        style={[styles.floatingShadow, {
          left: CARD_MARGIN,
          top: cardTop,
          width: cardW,
          height: cardH,
          backgroundColor: dc.balanceCard,
          opacity: cardOpacity,
          transform: cardTransform,
        }]}
      >
        {/* Capa interior: recorte de esquinas. Sin fondo propio: el "borde" es el padding
            de la capa exterior, así no asoma ninguna línea clara entre borde y cabecera */}
        <View style={styles.floatingCard}>
          {/* Cabecera con el color de la tarjeta de balance de la paleta */}
          <View style={[styles.hero, { backgroundColor: dc.balanceCard }]}>
            <Animated.View style={{ opacity: contentOpacity }}>
              <View style={styles.headerRow}>
                <Text style={styles.title} numberOfLines={1}>{t('home.dailySummary').toUpperCase()}</Text>
                <TouchableOpacity style={styles.heroBtn} onPress={close} hitSlop={10} activeOpacity={0.7}>
                  <Ionicons name="close" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

              <View style={styles.dayNav}>
                <TouchableOpacity
                  style={styles.heroBtn}
                  onPress={() => goToDay(dayOffset - 1)}
                  hitSlop={8}
                  activeOpacity={0.7}
                >
                  <Ionicons name="chevron-back" size={18} color="#FFFFFF" />
                </TouchableOpacity>
                <View style={styles.dayNavCenter}>
                  <Text style={styles.dayLabel} numberOfLines={1}>{dayLabel}</Text>
                  <Text style={styles.dateLabel} numberOfLines={1}>{dateLabel}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.heroBtn, dayOffset === 0 && styles.heroBtnDisabled]}
                  onPress={() => goToDay(dayOffset + 1)}
                  disabled={dayOffset === 0}
                  hitSlop={8}
                  activeOpacity={0.7}
                >
                  <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

              <View style={styles.balanceLabelRow}>
                <Text style={styles.balanceLabel}>{t('home.dayBalance').toUpperCase()}</Text>
                {balance !== 0 && (
                  <View style={styles.trendPill}>
                    <Ionicons name={balance > 0 ? 'trending-up' : 'trending-down'} size={12} color="#FFFFFF" />
                  </View>
                )}
              </View>
              {/* Sin adjustsFontSizeToFit: en iOS (nueva arquitectura) puede dejar el texto invisible */}
              <Text style={styles.balanceAmount} numberOfLines={1}>
                {balanceSign}{formatAmount(Math.abs(balance))} {currencySymbol}
              </Text>
              <View style={styles.statsRow}>
                <View style={styles.statCol}>
                  <View style={styles.statLabelRow}>
                    <View style={[styles.statDot, { backgroundColor: dc.income }]} />
                    <Text style={styles.statLabel} numberOfLines={1}>{t('home.income').toUpperCase()}</Text>
                  </View>
                  <Text style={styles.statAmount} numberOfLines={1}>
                    +{formatAmount(totalIncome)} {currencySymbol}
                  </Text>
                </View>
                <View style={[styles.statCol, { alignItems: 'flex-end' }]}>
                  <View style={styles.statLabelRow}>
                    <View style={[styles.statDot, { backgroundColor: dc.expense }]} />
                    <Text style={styles.statLabel} numberOfLines={1}>{t('home.expenses').toUpperCase()}</Text>
                  </View>
                  <Text style={styles.statAmount} numberOfLines={1}>
                    -{formatAmount(totalExpense)} {currencySymbol}
                  </Text>
                </View>
              </View>
            </Animated.View>
          </View>

          <View style={[styles.body, { backgroundColor: dc.background }]}>
          <Animated.View style={[styles.body, { opacity: contentOpacity }]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
              {dayMovements.length === 0 ? (
                <View style={styles.empty}>
                  <View style={[styles.emptyIcon, { backgroundColor: dc.primary + '18' }]}>
                    <Ionicons name="calendar-clear-outline" size={28} color={dc.primary} />
                  </View>
                  <Text style={[styles.emptyText, { color: dc.textSecondary }]}>{t('home.noMovementsDay')}</Text>
                </View>
              ) : (
                <>
                  {renderGroups(t('home.expenses'), expenseGroups, dc.expense)}
                  {renderGroups(t('home.income'), incomeGroups, dc.income)}
                </>
              )}
            </ScrollView>
          </Animated.View>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  floatingShadow: {
    position: 'absolute',
    borderRadius: 24,
    padding: 3, // grosor del borde (color de la cabecera)
    elevation: 12, shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16,
  },
  // Radio interior = radio exterior - grosor del borde, para que las esquinas sean concéntricas
  floatingCard: { flex: 1, borderRadius: 21, overflow: 'hidden' },

  // Hero (cabecera de color)
  hero: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: {
    color: 'rgba(255,255,255,0.7)', fontSize: 11, flexShrink: 1, marginRight: 8,
    fontFamily: 'Poppins_600SemiBold', letterSpacing: 1.5,
  },
  heroBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center', alignItems: 'center',
  },
  heroBtnDisabled: { opacity: 0.35 },
  dayNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  dayNavCenter: { alignItems: 'center', flex: 1, marginHorizontal: 8 },
  dayLabel: { color: '#FFFFFF', fontSize: 17, fontFamily: 'Poppins_700Bold' },
  dateLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontFamily: 'Poppins_400Regular' },
  balanceLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  balanceLabel: {
    color: 'rgba(255,255,255,0.6)', fontSize: 10,
    fontFamily: 'Poppins_600SemiBold', letterSpacing: 1.2,
  },
  trendPill: {
    backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 1,
  },
  balanceAmount: { color: '#FFFFFF', fontSize: 30, fontFamily: 'Poppins_700Bold', marginBottom: 8 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  statCol: { flexShrink: 1 },
  statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
  statDot: { width: 6, height: 6, borderRadius: 3 },
  statLabel: {
    color: 'rgba(255,255,255,0.7)', fontSize: 10,
    fontFamily: 'Poppins_600SemiBold', letterSpacing: 0.8,
  },
  statAmount: { color: '#FFFFFF', fontSize: 15, fontFamily: 'Poppins_700Bold' },

  // Cuerpo
  body: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 20 },
  section: { marginBottom: 18 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, marginLeft: 4 },
  sectionDot: { width: 6, height: 6, borderRadius: 3 },
  sectionLabel: { fontSize: 11, fontFamily: 'Poppins_600SemiBold', letterSpacing: 1 },
  card: { borderRadius: 16, borderWidth: 0.5, overflow: 'hidden' },
  rowDivider: { height: 0.5, marginLeft: 66 },
  catRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
  catIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  catContent: { flex: 1 },
  catName: { fontSize: 14, fontFamily: 'Poppins_500Medium' },
  catCount: { fontSize: 11, fontFamily: 'Poppins_400Regular' },
  catAmount: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', flexShrink: 0 },

  movList: { marginLeft: 33, marginRight: 14, marginBottom: 10, paddingLeft: 20, borderLeftWidth: 2 },
  movDivider: { height: 0.5 },
  movRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 8 },
  movInfo: { flex: 1 },
  movTitle: { fontSize: 13, fontFamily: 'Poppins_500Medium' },
  movSubtitle: { fontSize: 11, fontFamily: 'Poppins_400Regular' },
  movAmount: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', flexShrink: 0 },

  empty: { alignItems: 'center', paddingVertical: 28, gap: 10 },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 13, fontFamily: 'Poppins_400Regular', textAlign: 'center' },
});

export default DailySummaryModal;
