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
import AnimatedBar from '../common/AnimatedBar';
import { DailySummaryOrigin } from './DailySummaryModal';
import { formatAmount as formatAmountLocalized } from '../../utils/formatAmount';

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

// Mismo margen lateral que la tarjeta de balance de la home
const CARD_MARGIN = 16;

// Índice absoluto del mes (año * 12 + mes): permite navegar entre meses sin líos de fechas
const currentMonthIndex = () => {
  const n = new Date();
  return n.getFullYear() * 12 + n.getMonth();
};

interface CategoryGroup {
  category: string;
  amount: number;
  percentage: number;
  color: string;
  movements: Movement[];
}

interface Props {
  visible: boolean;
  type: MovementType;
  origin: DailySummaryOrigin | null;
  onDismiss: () => void;
  onSeeAll: (type: MovementType) => void;
}

const formatAmount = (n: number) => formatAmountLocalized(n);

// Ingresos o gastos del mes en un rectángulo flotante que se expande desde
// el importe pulsado en la tarjeta de balance (mismo estilo que el resumen diario)
const MonthTypeSummaryModal = ({ visible, type, origin, onDismiss, onSeeAll }: Props) => {
  const { t } = useTranslation();
  const { colors: dc } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const { movements } = useMovementStore();
  const { getCurrencySymbol } = useSettingsStore();
  const { getCategoryName, getCategoriesForType } = useCategoryStore();
  const { isSharedMode, getSharedCurrencySymbol, sharedAccount } = useSharedAccountStore();
  const { getSharedCategoryName, getSharedCategoriesForType } = useSharedCategoryStore();

  // 0 = este mes, -1 = mes anterior, ...
  const [monthOffset, setMonthOffset] = useState(0);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [baseIndex, setBaseIndex] = useState(currentMonthIndex);
  const baseRef = useRef(baseIndex);

  const progress = useRef(new Animated.Value(0)).current;
  const closingRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    const current = currentMonthIndex();
    baseRef.current = current;
    setBaseIndex(current);
    setMonthOffset(0);
    setExpandedKey(null);
    closingRef.current = false;
    progress.setValue(0);
    Animated.spring(progress, {
      toValue: 1, damping: 22, stiffness: 220, mass: 0.9, useNativeDriver: true,
    }).start();
  }, [visible]);

  // Al volver a la app en un mes nuevo, "este mes" pasa a ser el nuevo
  // y si se estaba viendo un mes anterior se mantiene el mismo mes
  useEffect(() => {
    if (!visible) return;
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') return;
      const current = currentMonthIndex();
      const prev = baseRef.current;
      if (current === prev) return;
      baseRef.current = current;
      setBaseIndex(current);
      setMonthOffset(o => (o === 0 ? 0 : o - (current - prev)));
      setExpandedKey(null);
    });
    return () => sub.remove();
  }, [visible]);

  const close = (after?: () => void) => {
    if (closingRef.current) return;
    closingRef.current = true;
    Animated.timing(progress, {
      toValue: 0, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true,
    }).start(() => {
      onDismiss();
      after?.();
    });
  };

  // ── Geometría: rectángulo flotante centrado ─────────────────────────────
  const cardW = winW - CARD_MARGIN * 2;
  const availableH = winH - insets.top - insets.bottom - CARD_MARGIN * 4;
  const cardH = Math.min(availableH, winH * (winH < 700 ? 0.82 : 0.72), 640);
  const cardTop = insets.top + (winH - insets.top - insets.bottom - cardH) / 2;

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
  const isIncome = type === 'income';
  const accent = isIncome ? dc.income : dc.expense;
  const sign = isIncome ? '+' : '-';

  const getCatName = (id: string) =>
    isSharedMode ? getSharedCategoryName(id, type, t) : getCategoryName(id, type, t);

  const getCatIcon = (id: string): keyof typeof Ionicons.glyphMap => {
    const cats = isSharedMode ? getSharedCategoriesForType(type) : getCategoriesForType(type);
    return ((cats.find(c => c.id === id)?.icon ?? 'ellipsis-horizontal') + '-outline') as keyof typeof Ionicons.glyphMap;
  };

  const shortMonth = (monthIdx: number) => t(`home.month_${monthIdx}`).slice(0, 3);

  const selectedIndex = baseIndex + monthOffset;
  const year = Math.floor(selectedIndex / 12);
  const monthIdx = selectedIndex % 12;
  const prevMonthIdx = (selectedIndex - 1) % 12;

  const movementsOfMonth = (index: number) => {
    const y = Math.floor(index / 12);
    const m = index % 12;
    return movements.filter(mov => {
      if (mov.type !== type) return false;
      const d = new Date(mov.date);
      return d.getFullYear() === y && d.getMonth() === m;
    });
  };

  const monthMovements = useMemo(() =>
    movementsOfMonth(selectedIndex)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [movements, type, selectedIndex],
  );
  const total = monthMovements.reduce((s, m) => s + m.amount, 0);

  // Comparación con el mes anterior (solo si ese mes tiene movimientos)
  const prevTotal = useMemo(() => {
    const prev = movementsOfMonth(selectedIndex - 1);
    return prev.length === 0 ? null : prev.reduce((s, m) => s + m.amount, 0);
  }, [movements, type, selectedIndex]);
  const diff = prevTotal === null ? null : total - prevTotal;

  const groups = useMemo((): CategoryGroup[] => {
    const palette = isIncome ? INCOME_CAT_COLORS : CAT_COLORS;
    const byCategory: Record<string, Movement[]> = {};
    monthMovements.forEach(m => { (byCategory[m.category] ??= []).push(m); });
    return Object.entries(byCategory)
      .map(([category, movs]) => ({
        category,
        movements: movs,
        amount: movs.reduce((s, m) => s + m.amount, 0),
        percentage: 0,
        color: '',
      }))
      .sort((a, b) => b.amount - a.amount)
      .map((g, i) => ({
        ...g,
        percentage: total > 0 ? (g.amount / total) * 100 : 0,
        color: palette[i % palette.length],
      }));
  }, [monthMovements, total, isIncome]);

  const goToMonth = (offset: number) => {
    setMonthOffset(Math.min(0, offset));
    setExpandedKey(null);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => close()}
    >
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => close()} />
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
        {/* Capa interior: recorte de esquinas; el "borde" es el padding de la capa exterior */}
        <View style={styles.floatingCard}>
          <View style={[styles.hero, { backgroundColor: dc.balanceCard }]}>
            <Animated.View style={{ opacity: contentOpacity }}>
              <View style={styles.headerRow}>
                <View style={styles.titleRow}>
                  <View style={[styles.titleDot, { backgroundColor: accent }]} />
                  <Text style={styles.title} numberOfLines={1}>
                    {t(isIncome ? 'home.income' : 'home.expenses').toUpperCase()}
                  </Text>
                </View>
                <TouchableOpacity style={styles.heroBtn} onPress={() => close()} hitSlop={10} activeOpacity={0.7}>
                  <Ionicons name="close" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

              <View style={styles.monthNav}>
                <TouchableOpacity
                  style={styles.heroBtn}
                  onPress={() => goToMonth(monthOffset - 1)}
                  hitSlop={8}
                  activeOpacity={0.7}
                >
                  <Ionicons name="chevron-back" size={18} color="#FFFFFF" />
                </TouchableOpacity>
                <View style={styles.monthNavCenter}>
                  <Text style={styles.monthLabel} numberOfLines={1}>{t(`home.month_${monthIdx}`)}</Text>
                  <Text style={styles.yearLabel} numberOfLines={1}>{year}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.heroBtn, monthOffset === 0 && styles.heroBtnDisabled]}
                  onPress={() => goToMonth(monthOffset + 1)}
                  disabled={monthOffset === 0}
                  hitSlop={8}
                  activeOpacity={0.7}
                >
                  <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

              <Text style={styles.totalLabel}>{t('resumen.total').toUpperCase()}</Text>
              {/* Sin adjustsFontSizeToFit: en iOS (nueva arquitectura) puede dejar el texto invisible */}
              <Text style={styles.totalAmount} numberOfLines={1}>
                {total > 0 ? sign : ''}{formatAmount(total)} {currencySymbol}
              </Text>
              <View style={styles.statsRow}>
                <Text style={styles.statText} numberOfLines={1}>
                  {t('home.movementCount', { count: monthMovements.length })}
                </Text>
                {diff !== null && diff !== 0 && (
                  <View style={styles.trendPill}>
                    <Ionicons name={diff > 0 ? 'trending-up' : 'trending-down'} size={12} color="#FFFFFF" />
                    <Text style={styles.trendText} numberOfLines={1}>
                      {diff > 0 ? '+' : '-'}{formatAmount(Math.abs(diff))} {currencySymbol} vs {shortMonth(prevMonthIdx)}
                    </Text>
                  </View>
                )}
              </View>
            </Animated.View>
          </View>

          <View style={[styles.body, { backgroundColor: dc.background }]}>
            <Animated.View style={[styles.body, { opacity: contentOpacity }]}>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                {groups.length === 0 ? (
                  <View style={styles.empty}>
                    <View style={[styles.emptyIcon, { backgroundColor: accent + '18' }]}>
                      <Ionicons
                        name={isIncome ? 'trending-up-outline' : 'receipt-outline'}
                        size={28}
                        color={accent}
                      />
                    </View>
                    <Text style={[styles.emptyText, { color: dc.textSecondary }]}>
                      {t(isIncome ? 'resumen.noIncome' : 'resumen.noExpenses')}
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.card, { backgroundColor: dc.surface, borderColor: dc.border }]}>
                    {groups.map((g, i) => {
                      const isExpanded = expandedKey === g.category;
                      return (
                        <View key={g.category} style={isExpanded && { backgroundColor: g.color + '10' }}>
                          {i > 0 && <View style={[styles.rowDivider, { backgroundColor: dc.border }]} />}
                          <TouchableOpacity
                            style={styles.catRow}
                            onPress={() => setExpandedKey(prev => (prev === g.category ? null : g.category))}
                            activeOpacity={0.7}
                          >
                            <View style={[styles.catIcon, { backgroundColor: g.color + '20' }]}>
                              <Ionicons name={getCatIcon(g.category)} size={18} color={g.color} />
                            </View>
                            <View style={styles.catContent}>
                              <View style={styles.catTitleRow}>
                                <Text style={[styles.catName, { color: dc.textPrimary }]} numberOfLines={1}>
                                  {getCatName(g.category)}
                                </Text>
                                <Text style={[styles.catAmount, { color: accent }]} numberOfLines={1}>
                                  {sign}{formatAmount(g.amount)} {currencySymbol}
                                </Text>
                              </View>
                              <Text style={[styles.catCount, { color: dc.textSecondary }]} numberOfLines={1}>
                                {t('home.movementCount', { count: g.movements.length })}
                                {' · '}
                                {Math.round(g.percentage)}% {t(isIncome ? 'resumen.ofIncome' : 'resumen.ofExpense')}
                              </Text>
                              <View style={[styles.barTrack, { backgroundColor: g.color + '25' }]}>
                                <AnimatedBar
                                  size={g.percentage}
                                  delay={150 + i * 60}
                                  style={[styles.barFill, { backgroundColor: g.color }]}
                                />
                              </View>
                            </View>
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
                                const dayLabel = `${d.getDate()} ${shortMonth(d.getMonth())}`;
                                const time = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
                                const userName = isSharedMode && mov.addedBy
                                  ? sharedAccount?.memberNames?.[mov.addedBy]
                                  : undefined;
                                // Los recurrentes se generan a las 00:00: etiqueta en vez de hora
                                const detail = mov.isRecurring
                                  ? t(isIncome ? 'movementsList.recurringIncome' : 'movementsList.recurringExpense')
                                  : time;
                                const subtitle = [dayLabel, detail, userName].filter(Boolean).join(' · ');
                                return (
                                  <View key={mov.id}>
                                    {idx > 0 && <View style={[styles.movDivider, { backgroundColor: g.color + '30' }]} />}
                                    <View style={styles.movRow}>
                                      <View style={styles.movInfo}>
                                        <Text style={[styles.movTitle, { color: dc.textPrimary }]} numberOfLines={1}>
                                          {mov.note || getCatName(mov.category)}
                                        </Text>
                                        <Text style={[styles.movSubtitle, { color: dc.textSecondary }]} numberOfLines={1}>
                                          {subtitle}
                                        </Text>
                                      </View>
                                      <Text style={[styles.movAmount, { color: dc.textPrimary }]} numberOfLines={1}>
                                        {sign}{formatAmount(mov.amount)} {currencySymbol}
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
                )}

                {/* El historial muestra el mes actual: acceso directo solo desde este mes */}
                {monthOffset === 0 && (
                  <TouchableOpacity
                    style={[styles.seeAllBtn, { backgroundColor: accent + '12', borderColor: accent + '40' }]}
                    onPress={() => close(() => onSeeAll(type))}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.seeAllText, { color: accent }]}>{t('home.seeAll')}</Text>
                    <Ionicons name="arrow-forward" size={14} color={accent} />
                  </TouchableOpacity>
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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, marginRight: 8 },
  titleDot: { width: 6, height: 6, borderRadius: 3 },
  title: {
    color: 'rgba(255,255,255,0.7)', fontSize: 11, flexShrink: 1,
    fontFamily: 'Poppins_600SemiBold', letterSpacing: 1.5,
  },
  heroBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center', alignItems: 'center',
  },
  heroBtnDisabled: { opacity: 0.35 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  monthNavCenter: { alignItems: 'center', flex: 1, marginHorizontal: 8 },
  monthLabel: { color: '#FFFFFF', fontSize: 17, fontFamily: 'Poppins_700Bold' },
  yearLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontFamily: 'Poppins_400Regular' },
  totalLabel: {
    color: 'rgba(255,255,255,0.6)', fontSize: 10,
    fontFamily: 'Poppins_600SemiBold', letterSpacing: 1.2,
  },
  totalAmount: { color: '#FFFFFF', fontSize: 30, fontFamily: 'Poppins_700Bold', marginBottom: 6 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  statText: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontFamily: 'Poppins_500Medium', flexShrink: 1 },
  trendPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1,
    backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  trendText: { color: '#FFFFFF', fontSize: 11, fontFamily: 'Poppins_500Medium', flexShrink: 1 },

  // Cuerpo
  body: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 20 },
  card: { borderRadius: 16, borderWidth: 0.5, overflow: 'hidden' },
  rowDivider: { height: 0.5, marginLeft: 66 },
  catRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
  catIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  catContent: { flex: 1 },
  catTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  catName: { fontSize: 14, fontFamily: 'Poppins_500Medium', flexShrink: 1 },
  catAmount: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', flexShrink: 0 },
  catCount: { fontSize: 11, fontFamily: 'Poppins_400Regular' },
  barTrack: { height: 5, borderRadius: 3, overflow: 'hidden', marginTop: 6 },
  barFill: { height: 5, borderRadius: 3 },

  movList: { marginLeft: 33, marginRight: 14, marginBottom: 10, paddingLeft: 20, borderLeftWidth: 2 },
  movDivider: { height: 0.5 },
  movRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 8 },
  movInfo: { flex: 1 },
  movTitle: { fontSize: 13, fontFamily: 'Poppins_500Medium' },
  movSubtitle: { fontSize: 11, fontFamily: 'Poppins_400Regular' },
  movAmount: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', flexShrink: 0 },

  seeAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 0.5,
  },
  seeAllText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },

  empty: { alignItems: 'center', paddingVertical: 28, gap: 10 },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 13, fontFamily: 'Poppins_400Regular', textAlign: 'center' },
});

export default MonthTypeSummaryModal;
