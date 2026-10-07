import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute } from '@react-navigation/native';
import { HeroScrollScreen } from '../../components/layout/HeroScreen';
import { SectionHeader } from '../../components/layout/SheetSection';
import { useTheme } from '../../hooks/useTheme';
import { businessToday, useBusinessStore } from '../store/businessStore';
import { useBizUiStore } from '../store/uiStore';
import { dayFigures, usesOrders } from '../logic/days';
import { ranking } from '../logic/orders';
import { monthSummary } from '../logic/summary';
import { ORDER_DAYS_KEPT } from '../cloud/cache';
import { cents, dateOfDayId, shiftDayId } from '../logic/basics';
import { AddLink, EmptyNote, ListRow, PillButton, RankList, useMoney } from '../ui/kit';
import { BizDetailHero, HeroStat } from '../ui/BizHeader';
import { DayStatusCard, EntryRow, OrderRow } from '../ui/DayParts';
import { dayTitle } from '../ui/format';

/**
 * Un día: lo vendido, su estado (con cerrar, terminar de cerrar o reabrir),
 * sus pedidos o sus cajas, lo más vendido y los gastos. Los pedidos de un día
 * antiguo ya no están en el móvil: se bajan al abrirlo
 */
const BizDayScreen = () => {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const dayId: string = route.params?.dayId ?? businessToday();
  const { ui } = useTheme();
  const { symbol, money } = useMoney();
  const config = useBusinessStore((s) => s.config);
  const days = useBusinessStore((s) => s.days);
  const day = days[dayId];
  const orders = useBusinessStore((s) => s.orders);
  const expenses = useBusinessStore((s) => s.expenses);
  const recurring = useBusinessStore((s) => s.recurring);
  const open = useBizUiStore((s) => s.open);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loadedOrders, setLoadedOrders] = useState(false);

  const orderMode = usesOrders(config);
  const status = day?.status ?? 'open';
  const dayOpen = status === 'open';
  const dayOrders = useMemo(
    () => Object.values(orders).filter((o) => o.day === dayId).sort((a, b) => b.at.localeCompare(a.at)),
    [orders, dayId],
  );
  const figures = useMemo(() => (config ? dayFigures(day, dayOrders, config) : null), [config, day, dayOrders]);
  const entries = useMemo(
    () => Object.values(day?.entries ?? {})
      .filter((e) => !(orderMode && e.fromOrders && status !== 'closed'))
      .sort((a, b) => a.at.localeCompare(b.at)),
    [day, orderMode, status],
  );
  const dayExpenses = useMemo(() => Object.values(expenses).filter((e) => e.date === dayId), [expenses, dayId]);
  const spent = dayExpenses.reduce((s, e) => s + e.amount, 0);
  const sales = figures?.sales ?? 0;
  const old = dayId < shiftDayId(businessToday(), -ORDER_DAYS_KEPT);
  // El resultado, como en Ventas y en el resumen: si los fijos se reparten,
  // con la parte de este día en vez de los fijos que caen en él
  const row = useMemo(() => {
    if (!config) return null;
    const date = dateOfDayId(dayId);
    return monthSummary({
      year: date.getFullYear(), month0: date.getMonth(), todayId: businessToday(), config, days,
      orders: Object.values(orders), expenses: Object.values(expenses), recurring: Object.values(recurring),
    }).days.find((d) => d.id === dayId) ?? null;
  }, [config, dayId, days, orders, expenses, recurring]);
  const result = row ? row.result : cents(sales - spent);

  // Un día de hace más de unas semanas: sus pedidos, de la nube
  useEffect(() => {
    if (!orderMode || !old || loadedOrders) return;
    setLoadingOrders(true);
    useBusinessStore.getState().fetchDayOrders(dayId)
      .finally(() => { setLoadingOrders(false); setLoadedOrders(true); });
  }, [orderMode, old, dayId, loadedOrders]);

  const summary = figures?.ordersSummary;
  const top = summary ? ranking(summary.items).slice(0, 8) : [];
  const extras = summary ? ranking(summary.extras).slice(0, 6) : [];

  const hero = (
    <BizDetailHero
      title={dayTitle(dayId, t, i18n.language, businessToday())}
      onBack={() => navigation.goBack()}
      label={figures?.provisional && sales > 0 ? t('business.today.provisional') : t('business.day.sold')}
      amount={sales}
      symbol={symbol}
      stats={[
        <HeroStat
          key="a"
          icon="receipt-outline"
          label={orderMode ? t('business.today.orders') : t('business.today.tickets')}
          value={String(figures?.tickets ?? 0)}
        />,
        <HeroStat key="b" icon="trending-up" label={t('business.today.result')} value={money(result)} end />,
      ]}
      caption={row && row.fixedShare > 0 ? t('business.day.fixedShare', { amount: money(row.fixedShare) }) : null}
    />
  );

  return (
    <HeroScrollScreen hero={hero}>
      <View style={styles.pad}>
        <DayStatusCard dayId={dayId} day={day} sales={sales} entriesCount={entries.length} ordersCount={figures?.tickets ?? 0} />
      </View>

      {entries.length > 0 && (
        <>
          <SectionHeader title={orderMode ? t('business.today.closeTitle') : t('business.today.tillsTitle')} style={styles.section} />
          <View style={styles.pad}>
            {entries.map((e) => <EntryRow key={e.id} entry={e} dayOpen={dayOpen} dayId={dayId} />)}
          </View>
        </>
      )}
      {!orderMode && dayOpen && (
        <View style={styles.pad}>
          <AddLink label={t('business.day.addEntry')} onPress={() => open({ kind: 'entry', dayId })} />
        </View>
      )}

      {orderMode && (
        <>
          <SectionHeader title={t('business.today.ordersTitle')} style={styles.section} />
          <View style={styles.pad}>
            {loadingOrders ? (
              <EmptyNote text={t('business.day.loadingOrders')} />
            ) : dayOrders.length === 0 ? (
              <EmptyNote text={t('business.today.noOrdersClosed')} />
            ) : dayOrders.map((o) => <OrderRow key={o.id} order={o} dayOpen={dayOpen} />)}
            {old && !loadingOrders && loadedOrders && dayOrders.length === 0 && (
              <PillButton
                label={t('business.day.retry')}
                tone="soft"
                onPress={() => setLoadedOrders(false)}
                style={styles.retry}
              />
            )}
          </View>
        </>
      )}

      {top.length > 0 && (
        <>
          <SectionHeader title={t('business.summary.topSold')} style={styles.section} />
          <View style={styles.pad}>
            <RankList
              color={ui.accent}
              rows={top.map((item) => ({
                key: item.key, label: item.name, value: t('business.summary.units', { count: item.qty }),
                sub: money(item.amount), weight: item.qty,
              }))}
            />
          </View>
        </>
      )}
      {extras.length > 0 && (
        <>
          <SectionHeader title={t('business.summary.extras')} style={styles.section} />
          <View style={styles.pad}>
            <RankList
              color={ui.accent}
              rows={extras.map((item) => ({
                key: item.key, label: item.name, value: t('business.summary.units', { count: item.qty }),
                sub: money(item.amount), weight: item.qty,
              }))}
            />
          </View>
        </>
      )}

      <SectionHeader title={t('business.day.expenses')} style={styles.section} />
      <View style={styles.pad}>
        {dayExpenses.length === 0
          ? <EmptyNote text={t('business.today.noExpenses')} />
          : dayExpenses.map((e) => (
            <ListRow
              key={e.id}
              icon={(config?.expenseTypes[e.typeId]?.icon ?? 'pricetag') as never}
              color={ui.expenseText}
              title={e.name || e.supplierName || e.typeName}
              subtitle={config?.expenseTypes[e.typeId]?.name ?? e.typeName}
              right={money(e.amount, { sign: '-' })}
              rightColor={ui.expenseText}
              onPress={() => open({ kind: 'expense', expenseId: e.id })}
            />
          ))}
        <AddLink label={t('business.today.addExpense')} onPress={() => open({ kind: 'expense', date: dayId })} />
      </View>
    </HeroScrollScreen>
  );
};

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 20 },
  section: { marginTop: 26 },
  retry: { alignSelf: 'flex-start', marginTop: 6 },
});

export default BizDayScreen;
