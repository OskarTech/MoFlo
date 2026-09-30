import React, { useState, useMemo, useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, AppState } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import Icon from '../common/Icon';
import { useMovementStore } from '../../store/movementStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useSharedAccountStore } from '../../store/sharedAccountStore';
import { useTheme } from '../../hooks/useTheme';
import { formatAmount } from '../../utils/formatAmount';
import { getDateLocale } from '../../utils/dateFormat';
import { byMostRecent } from '../../utils/sortMovements';
import MovementItem from '../common/MovementItem';
import FloatingSummaryCard, { SummaryNav, SummaryOrigin } from './FloatingSummaryCard';

const DAY_MS = 24 * 60 * 60 * 1000;

// Medianoche (00:00 local) del día actual
const startOfToday = () => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
};

export type DailySummaryOrigin = SummaryOrigin;

interface Props {
  visible: boolean;
  origin: DailySummaryOrigin | null;
  onDismiss: () => void;
}

/** Resumen de un día: balance, lo que entró y salió, y sus movimientos */
const DailySummaryModal = ({ visible, origin, onDismiss }: Props) => {
  const { t } = useTranslation();
  const { colors: dc, ui } = useTheme();
  const { movements } = useMovementStore();
  const { getCurrencySymbol, language } = useSettingsStore();
  const { isSharedMode, getSharedCurrencySymbol } = useSharedAccountStore();

  // 0 = hoy, -1 = ayer, ...
  const [dayOffset, setDayOffset] = useState(0);
  const [today, setToday] = useState(startOfToday);
  const todayRef = useRef(today);

  useEffect(() => {
    if (!visible) return;
    const current = startOfToday();
    todayRef.current = current;
    setToday(current);
    setDayOffset(0);
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

  const currencySymbol = isSharedMode ? getSharedCurrencySymbol() : getCurrencySymbol();

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
      .sort(byMostRecent),
    [movements, dayStart, dayEnd],
  );

  const totalIncome = dayMovements.filter(m => m.type === 'income').reduce((s, m) => s + m.amount, 0);
  const totalExpense = dayMovements.filter(m => m.type === 'expense').reduce((s, m) => s + m.amount, 0);
  const balance = totalIncome - totalExpense;

  const locale = getDateLocale(language);
  const weekday = dayStart.toLocaleDateString(locale, { weekday: 'long' });
  const weekdayCap = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  const dayTitle = dayOffset === 0 ? t('home.today') : dayOffset === -1 ? t('home.yesterday') : weekdayCap;
  const dateLabel = `${dayStart.getDate()} ${t(`home.month_${dayStart.getMonth()}`)} ${dayStart.getFullYear()}`;

  const balanceSign = balance > 0 ? '+' : balance < 0 ? '-' : '';

  const stat = (icon: 'arrow-down' | 'arrow-up', label: string, text: string, alignEnd?: boolean) => (
    <View style={alignEnd && styles.statEnd}>
      <View style={styles.statLabelRow}>
        <View style={styles.statIcon}>
          <Icon name={icon} size={13} color={ui.onHero} />
        </View>
        <Text style={[styles.statLabel, { color: ui.onHeroSoft }]}>{label}</Text>
      </View>
      <Text style={[styles.statAmount, { color: ui.onHero }]} numberOfLines={1}>{text}</Text>
    </View>
  );

  return (
    <FloatingSummaryCard
      visible={visible}
      origin={origin}
      onDismiss={onDismiss}
      title={t('home.dailySummary')}
      hero={() => (
        <>
          <SummaryNav
            title={dayTitle}
            subtitle={dateLabel}
            onPrev={() => setDayOffset(o => o - 1)}
            onNext={() => setDayOffset(o => Math.min(0, o + 1))}
            canNext={dayOffset < 0}
          />
          <Text style={[styles.balanceLabel, { color: ui.onHeroSoft }]}>{t('home.dayBalance')}</Text>
          {/* Sin adjustsFontSizeToFit: en iOS (nueva arquitectura) puede dejar el texto invisible */}
          <Text style={[styles.balanceAmount, { color: ui.onHero }]} numberOfLines={1}>
            {balanceSign}{formatAmount(Math.abs(balance))} {currencySymbol}
          </Text>
          <View style={styles.statsRow}>
            {stat('arrow-down', t('home.income'), `${formatAmount(totalIncome)} ${currencySymbol}`)}
            {stat('arrow-up', t('home.expenses'), `${formatAmount(totalExpense)} ${currencySymbol}`, true)}
          </View>
        </>
      )}
    >
      {() => (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {dayMovements.length === 0 ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: ui.accentSoft }]}>
                <Icon name="calendar-clear-outline" size={28} color={ui.accent} />
              </View>
              <Text style={[styles.emptyText, { color: dc.textSecondary }]}>{t('home.noMovementsDay')}</Text>
            </View>
          ) : dayMovements.map((mov) => {
            const d = new Date(mov.date);
            // La hora de los fijos (las 12:00 de su día) no dice nada: ya llevan su etiqueta
            const time = mov.isRecurring
              ? undefined
              : `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
            return <MovementItem key={mov.id} movement={mov} currencySymbol={currencySymbol} detail={time} />;
          })}
        </ScrollView>
      )}
    </FloatingSummaryCard>
  );
};

const styles = StyleSheet.create({
  balanceLabel: { fontSize: 13, fontFamily: 'Poppins_500Medium', marginTop: 14 },
  balanceAmount: { fontSize: 32, fontFamily: 'Poppins_700Bold', letterSpacing: -1 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 10 },
  statEnd: { alignItems: 'flex-end' },
  statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 3 },
  statIcon: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  statLabel: { fontSize: 12, fontFamily: 'Poppins_500Medium' },
  statAmount: { fontSize: 16, fontFamily: 'Poppins_700Bold' },
  scrollContent: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 20 },
  empty: { alignItems: 'center', paddingVertical: 34, gap: 10 },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 13.5, fontFamily: 'Poppins_400Regular', textAlign: 'center' },
});

export default DailySummaryModal;
