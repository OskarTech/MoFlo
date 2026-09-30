import React, { useState, useMemo, useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, AppState } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import Icon from '../common/Icon';
import { useMovementStore } from '../../store/movementStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useSharedAccountStore } from '../../store/sharedAccountStore';
import { useTheme } from '../../hooks/useTheme';
import { useCategoryInfo } from '../../hooks/useCategoryInfo';
import { Movement, MovementType } from '../../types';
import AnimatedBar from '../common/AnimatedBar';
import StrikeText from '../common/StrikeText';
import MemberName from '../common/MemberName';
import { formatAmount } from '../../utils/formatAmount';
import { getMemberLabel } from '../../utils/memberLabel';
import { withAlpha } from '../../utils/color';
import { byMostRecent } from '../../utils/sortMovements';
import FloatingSummaryCard, { SummaryNav, SummaryOrigin } from './FloatingSummaryCard';

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
  origin: SummaryOrigin | null;
  onDismiss: () => void;
  onSeeAll: (type: MovementType) => void;
}

// Fuera del componente: solo depende de los movimientos y el tipo que recibe.
// index = año * 12 + mes (0-11)
const movementsOfMonth = (movements: Movement[], type: MovementType, index: number) => {
  const y = Math.floor(index / 12);
  const m = index % 12;
  return movements.filter(mov => {
    if (mov.type !== type) return false;
    const d = new Date(mov.date);
    return d.getFullYear() === y && d.getMonth() === m;
  });
};

// Ingresos o gastos del mes en una tarjeta flotante que crece desde el importe
// pulsado en la cabecera de Inicio (mismo estilo que el resumen del día)
const MonthTypeSummaryModal = ({ visible, type, origin, onDismiss, onSeeAll }: Props) => {
  const { t } = useTranslation();
  const { colors: dc, ui } = useTheme();
  const cat = useCategoryInfo();
  const { movements } = useMovementStore();
  const { getCurrencySymbol } = useSettingsStore();
  const { isSharedMode, getSharedCurrencySymbol, sharedAccount } = useSharedAccountStore();

  // 0 = este mes, -1 = mes anterior, ...
  const [monthOffset, setMonthOffset] = useState(0);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [baseIndex, setBaseIndex] = useState(currentMonthIndex);
  const baseRef = useRef(baseIndex);

  useEffect(() => {
    if (!visible) return;
    const current = currentMonthIndex();
    baseRef.current = current;
    setBaseIndex(current);
    setMonthOffset(0);
    setExpandedKey(null);
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

  const currencySymbol = isSharedMode ? getSharedCurrencySymbol() : getCurrencySymbol();
  const isIncome = type === 'income';
  const sign = isIncome ? '+' : '-';
  const amountColor = isIncome ? ui.incomeText : dc.textPrimary;

  const shortMonth = (monthIdx: number) => t(`home.month_${monthIdx}`).slice(0, 3);

  const selectedIndex = baseIndex + monthOffset;
  const year = Math.floor(selectedIndex / 12);
  const monthIdx = selectedIndex % 12;
  const prevMonthIdx = (selectedIndex - 1) % 12;

  const monthMovements = useMemo(() =>
    movementsOfMonth(movements, type, selectedIndex)
      .sort(byMostRecent),
    [movements, type, selectedIndex],
  );
  const total = monthMovements.reduce((s, m) => s + m.amount, 0);

  // Comparación con el mes anterior (solo si ese mes tiene movimientos)
  const prevTotal = useMemo(() => {
    const prev = movementsOfMonth(movements, type, selectedIndex - 1);
    return prev.length === 0 ? null : prev.reduce((s, m) => s + m.amount, 0);
  }, [movements, type, selectedIndex]);
  const diff = prevTotal === null ? null : total - prevTotal;

  const groups = useMemo((): CategoryGroup[] => {
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
        // Cada gasto con el color fijo de su categoría; los ingresos, por puesto
        color: isIncome ? cat.colors.income(i, g.category) : cat.colors.expense(g.category),
      }));
  }, [monthMovements, total, isIncome, cat]);

  const goToMonth = (offset: number) => {
    setMonthOffset(Math.min(0, offset));
    setExpandedKey(null);
  };

  return (
    <FloatingSummaryCard
      visible={visible}
      origin={origin}
      onDismiss={onDismiss}
      title={t(isIncome ? 'home.income' : 'home.expenses')}
      hero={() => (
        <>
          <SummaryNav
            title={t(`home.month_${monthIdx}`)}
            subtitle={String(year)}
            onPrev={() => goToMonth(monthOffset - 1)}
            onNext={() => goToMonth(monthOffset + 1)}
            canNext={monthOffset < 0}
          />
          <Text style={[styles.totalLabel, { color: ui.onHeroSoft }]}>{t('resumen.total')}</Text>
          {/* Sin adjustsFontSizeToFit: en iOS (nueva arquitectura) puede dejar el texto invisible */}
          <Text style={[styles.totalAmount, { color: ui.onHero }]} numberOfLines={1}>
            {total > 0 ? sign : ''}{formatAmount(total)} {currencySymbol}
          </Text>
          <View style={styles.statsRow}>
            <Text style={[styles.statText, { color: ui.onHeroSoft }]} numberOfLines={1}>
              {t('home.movementCount', { count: monthMovements.length })}
            </Text>
            {diff !== null && diff !== 0 && (
              <View style={styles.trendPill}>
                <Icon name={diff > 0 ? 'trending-up' : 'trending-down'} size={12} color={ui.onHero} />
                <Text style={[styles.trendText, { color: ui.onHero }]} numberOfLines={1}>
                  {diff > 0 ? '+' : '-'}{formatAmount(Math.abs(diff))} {currencySymbol} vs {shortMonth(prevMonthIdx)}
                </Text>
              </View>
            )}
          </View>
        </>
      )}
    >
      {(close) => (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {groups.length === 0 ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: ui.accentSoft }]}>
                <Icon name={isIncome ? 'trending-up-outline' : 'receipt-outline'} size={28} color={ui.accent} />
              </View>
              <Text style={[styles.emptyText, { color: dc.textSecondary }]}>
                {t(isIncome ? 'resumen.noIncome' : 'resumen.noExpenses')}
              </Text>
            </View>
          ) : groups.map((g, i) => {
            const isExpanded = expandedKey === g.category;
            return (
              <View key={g.category}>
                <TouchableOpacity
                  style={styles.catRow}
                  onPress={() => setExpandedKey(prev => (prev === g.category ? null : g.category))}
                  activeOpacity={0.7}
                >
                  <View style={[styles.catIcon, { backgroundColor: withAlpha(g.color, 0.15) }]}>
                    <Icon name={cat.icon(g.category, type)} size={19} color={g.color} />
                  </View>
                  <View style={styles.catContent}>
                    <View style={styles.catTitleRow}>
                      <Text style={[styles.catName, { color: dc.textPrimary }]} numberOfLines={1}>
                        <StrikeText struck={cat.deleted(g.category, type)}>{cat.name(g.category, type)}</StrikeText>
                      </Text>
                      <Text style={[styles.catAmount, { color: amountColor }]} numberOfLines={1}>
                        {sign}{formatAmount(g.amount)} {currencySymbol}
                      </Text>
                    </View>
                    <Text style={[styles.catCount, { color: dc.textSecondary }]} numberOfLines={1}>
                      {t('home.movementCount', { count: g.movements.length })}
                      {' · '}
                      {Math.round(g.percentage)}% {t(isIncome ? 'resumen.ofIncome' : 'resumen.ofExpense')}
                    </Text>
                    <View style={[styles.barTrack, { backgroundColor: withAlpha(g.color, 0.15) }]}>
                      <AnimatedBar
                        size={g.percentage}
                        delay={150 + i * 60}
                        style={[styles.barFill, { backgroundColor: g.color }]}
                      />
                    </View>
                  </View>
                  <Icon
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={isExpanded ? g.color : dc.textSecondary}
                  />
                </TouchableOpacity>

                {isExpanded && (
                  <View style={[styles.movList, { borderLeftColor: withAlpha(g.color, 0.5) }]}>
                    {g.movements.map((mov) => {
                      const d = new Date(mov.date);
                      const day = `${d.getDate()} ${shortMonth(d.getMonth())}`;
                      const time = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
                      // Tachado si quien lo añadió ya no está en la cuenta
                      const member = isSharedMode
                        ? getMemberLabel(sharedAccount, mov.addedBy, t('sharedAccount.formerMember'))
                        : undefined;
                      // Los recurrentes se guardan a las 12:00 de su día: etiqueta en vez de hora
                      const detail = mov.isRecurring
                        ? t(isIncome ? 'movementsList.recurringIncome' : 'movementsList.recurringExpense')
                        : time;
                      return (
                        <View key={mov.id} style={styles.movRow}>
                          <View style={styles.movInfo}>
                            <Text style={[styles.movTitle, { color: dc.textPrimary }]} numberOfLines={1}>
                              {mov.note || cat.name(mov.category, type)}
                            </Text>
                            <Text style={[styles.movSubtitle, { color: dc.textSecondary }]} numberOfLines={1}>
                              {day} · {detail}
                              {member ? <>{' · '}<MemberName member={member} /></> : null}
                            </Text>
                          </View>
                          <Text style={[styles.movAmount, { color: dc.textPrimary }]} numberOfLines={1}>
                            {sign}{formatAmount(mov.amount)} {currencySymbol}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}

          {/* El historial muestra el mes actual: acceso directo solo desde este mes */}
          {monthOffset === 0 && groups.length > 0 && (
            <TouchableOpacity
              style={styles.seeAll}
              onPress={() => close(() => onSeeAll(type))}
              activeOpacity={0.7}
              hitSlop={6}
            >
              <Text style={[styles.seeAllText, { color: ui.accent }]}>{t('home.seeAll')}</Text>
              <Icon name="chevron-forward" size={15} color={ui.accent} />
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </FloatingSummaryCard>
  );
};

const styles = StyleSheet.create({
  totalLabel: { fontSize: 13, fontFamily: 'Poppins_500Medium', marginTop: 14 },
  totalAmount: { fontSize: 32, fontFamily: 'Poppins_700Bold', letterSpacing: -1 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 4 },
  statText: { fontSize: 12.5, fontFamily: 'Poppins_500Medium', flexShrink: 1 },
  trendPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1,
    backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  trendText: { fontSize: 11, fontFamily: 'Poppins_500Medium', flexShrink: 1 },

  scrollContent: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 20 },
  catRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  catIcon: { width: 40, height: 40, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  catContent: { flex: 1, minWidth: 0 },
  catTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  catName: { fontSize: 14.5, fontFamily: 'Poppins_500Medium', flexShrink: 1 },
  catAmount: { fontSize: 14.5, fontFamily: 'Poppins_600SemiBold', flexShrink: 0 },
  catCount: { fontSize: 11.5, fontFamily: 'Poppins_400Regular' },
  barTrack: { height: 5, borderRadius: 3, overflow: 'hidden', marginTop: 6 },
  barFill: { height: 5, borderRadius: 3 },

  movList: { marginLeft: 19, marginBottom: 8, paddingLeft: 33, borderLeftWidth: 2 },
  movRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8 },
  movInfo: { flex: 1, minWidth: 0 },
  movTitle: { fontSize: 13, fontFamily: 'Poppins_500Medium' },
  movSubtitle: { fontSize: 11.5, fontFamily: 'Poppins_400Regular' },
  movAmount: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', flexShrink: 0 },

  seeAll: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    marginTop: 10, paddingVertical: 10,
  },
  seeAllText: { fontSize: 13.5, fontFamily: 'Poppins_600SemiBold' },

  empty: { alignItems: 'center', paddingVertical: 34, gap: 10 },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 13.5, fontFamily: 'Poppins_400Regular', textAlign: 'center' },
});

export default MonthTypeSummaryModal;
