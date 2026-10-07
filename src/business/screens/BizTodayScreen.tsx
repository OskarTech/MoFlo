import React, { useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { HeroScrollScreen } from '../../components/layout/HeroScreen';
import { SectionHeader } from '../../components/layout/SheetSection';
import { useTheme } from '../../hooks/useTheme';
import { successHaptic } from '../../utils/haptics';
import { reportError } from '../../services/crashReporting';
import { businessIsCreator, businessToday, useBusinessStore } from '../store/businessStore';
import { useBizUiStore } from '../store/uiStore';
import { dayFigures, usesOrders, usesTills } from '../logic/days';
import { monthSummary } from '../logic/summary';
import { cents, dateOfDayId } from '../logic/basics';
import { useMoney, EmptyNote, ListRow, AddLink, StatTiles, Note } from '../ui/kit';
import { BizHero, HeroStat } from '../ui/BizHeader';
import { DayStatusCard, EntryRow, OrderRow } from '../ui/DayParts';
import { longDay } from '../ui/format';

/**
 * Hoy, en la empresa: lo vendido, el estado del día (abierto, cerrando o
 * cerrado), los pedidos o las cajas, los gastos de hoy y cómo va el mes
 */
const BizTodayScreen = () => {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const { ui } = useTheme();
  const { symbol, money } = useMoney();
  const business = useBusinessStore((s) => s.business);
  const config = useBusinessStore((s) => s.config);
  const days = useBusinessStore((s) => s.days);
  const orders = useBusinessStore((s) => s.orders);
  const expenses = useBusinessStore((s) => s.expenses);
  const recurring = useBusinessStore((s) => s.recurring);
  const incoming = useBusinessStore((s) => s.incomingRequests);
  const open = useBizUiStore((s) => s.open);
  const [refreshing, setRefreshing] = useState(false);

  const todayId = businessToday();
  const day = days[todayId];
  const status = day?.status ?? 'open';
  const dayOpen = status === 'open';
  const orderMode = usesOrders(config);

  const todayOrders = useMemo(
    () => Object.values(orders).filter((o) => o.day === todayId).sort((a, b) => b.at.localeCompare(a.at)),
    [orders, todayId],
  );
  const entries = useMemo(
    () => Object.values(day?.entries ?? {}).filter((e) => !(orderMode && e.fromOrders && status !== 'closed'))
      .sort((a, b) => a.at.localeCompare(b.at)),
    [day, orderMode, status],
  );
  const figures = useMemo(() => (config ? dayFigures(day, todayOrders, config) : null), [config, day, todayOrders]);
  const todayExpenses = useMemo(
    () => Object.values(expenses).filter((e) => e.date === todayId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [expenses, todayId],
  );
  const spentToday = todayExpenses.reduce((s, e) => s + e.amount, 0);
  const month = useMemo(() => {
    if (!config) return null;
    const d = dateOfDayId(todayId);
    return monthSummary({
      year: d.getFullYear(), month0: d.getMonth(), todayId, config, days,
      orders: Object.values(orders), expenses: Object.values(expenses), recurring: Object.values(recurring),
    });
  }, [config, days, orders, expenses, recurring, todayId]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await useBusinessStore.getState().sync(true);
      successHaptic();
    } catch (e) {
      reportError(e, 'empresa: comprobar');
    } finally {
      setRefreshing(false);
    }
  };

  const sales = figures?.sales ?? 0;
  const tickets = figures?.tickets ?? 0;
  // El resultado, como en Ventas: si los fijos se reparten, con la parte de hoy
  const todayRow = month?.days.find((d) => d.id === todayId) ?? null;
  const resultToday = todayRow ? todayRow.result : cents(sales - spentToday);
  const stats: [React.ReactNode, React.ReactNode] = orderMode
    ? [
      <HeroStat key="a" icon="receipt-outline" label={t('business.today.orders')} value={String(tickets)} />,
      <HeroStat key="b" icon="trending-up" label={t('business.today.avgOrder')} value={tickets ? money(sales / tickets) : '—'} end />,
    ]
    : usesTills(config)
      ? [
        <HeroStat key="a" icon="receipt-outline" label={t('business.today.tickets')} value={String(tickets)} />,
        <HeroStat key="b" icon="trending-up" label={t('business.today.avgTicket')} value={tickets ? money(sales / tickets) : '—'} end />,
      ]
      : [
        <HeroStat key="a" icon="arrow-up" label={t('business.today.spent')} value={money(spentToday)} />,
        <HeroStat key="b" icon="trending-up" label={t('business.today.result')} value={money(resultToday)} end />,
      ];

  const hero = (
    <BizHero
      label={`${t('home.today')} · ${longDay(todayId, i18n.language)}`}
      amount={sales}
      symbol={symbol}
      caption={figures?.provisional && sales > 0
        ? t('business.today.provisional')
        : !orderMode && !usesTills(config) && todayRow && todayRow.fixedShare > 0
          ? t('business.day.fixedShare', { amount: money(todayRow.fixedShare) })
          : null}
      stats={stats}
    />
  );

  const pendingCount = incoming.filter((r) => r.status === 'pending').length;

  if (!business || !config) {
    return (
      <HeroScrollScreen hero={hero} refreshing={refreshing} onRefresh={refresh}>
        <EmptyNote text={t('business.loading')} style={styles.pad} />
      </HeroScrollScreen>
    );
  }

  return (
    <HeroScrollScreen hero={hero} refreshing={refreshing} onRefresh={refresh}>
      <View style={styles.pad}>
        {businessIsCreator(business) && pendingCount > 0 && (
          <ListRow
            icon="people"
            title={t('business.members.requestsBanner', { count: pendingCount })}
            subtitle={t('business.members.requestsBannerHint', { count: pendingCount })}
            onPress={() => navigation.navigate('BizSettings', { screen: 'BizMembers' })}
            style={styles.banner}
          />
        )}
        <DayStatusCard
          dayId={todayId}
          day={day}
          sales={sales}
          entriesCount={entries.length}
          ordersCount={tickets}
        />
      </View>

      {orderMode ? (
        <>
          <SectionHeader
            title={t('business.today.ordersTitle')}
            action={todayOrders.length > 8 ? t('home.seeAll') : undefined}
            onAction={() => navigation.navigate('BizSales', { screen: 'BizDay', params: { dayId: todayId } })}
            style={styles.section}
          />
          <View style={styles.pad}>
            {todayOrders.length === 0
              ? <EmptyNote text={dayOpen ? t('business.today.noOrders') : t('business.today.noOrdersClosed')} />
              : todayOrders.slice(0, 8).map((o) => <OrderRow key={o.id} order={o} dayOpen={dayOpen} />)}
            {dayOpen && <AddLink label={t('business.today.newOrder')} onPress={() => open({ kind: 'order' })} />}
          </View>
        </>
      ) : entries.length > 0 && (
        <>
          <SectionHeader title={usesTills(config) ? t('business.today.tillsTitle') : t('business.today.closeTitle')} style={styles.section} />
          <View style={styles.pad}>
            {entries.map((e) => <EntryRow key={e.id} entry={e} dayOpen={dayOpen} dayId={todayId} />)}
            {dayOpen && (usesTills(config) || Object.keys(config.shifts ?? {}).length > 0) && (
              <AddLink label={usesTills(config) ? t('business.day.addTill') : t('business.day.addShift')} onPress={() => open({ kind: 'entry', dayId: todayId })} />
            )}
          </View>
        </>
      )}

      {orderMode && status === 'closed' && entries.length > 0 && (
        <>
          <SectionHeader title={t('business.today.closeTitle')} style={styles.section} />
          <View style={styles.pad}>
            {entries.map((e) => <EntryRow key={e.id} entry={e} dayOpen={false} dayId={todayId} />)}
          </View>
        </>
      )}

      <SectionHeader
        title={t('business.today.expensesTitle')}
        action={t('home.seeAll')}
        onAction={() => navigation.navigate('BizExpenses')}
        style={styles.section}
      />
      <View style={styles.pad}>
        {todayExpenses.length === 0
          ? <EmptyNote text={t('business.today.noExpenses')} />
          : todayExpenses.map((e) => (
            <ListRow
              key={e.id}
              icon={(config.expenseTypes[e.typeId]?.icon ?? 'pricetag') as never}
              color={ui.expenseText}
              title={e.name || e.supplierName || e.typeName}
              subtitle={[e.supplierName && e.name ? e.supplierName : null, config.expenseTypes[e.typeId]?.name ?? e.typeName].filter(Boolean).join(' · ')}
              right={money(e.amount, { sign: '-' })}
              rightColor={ui.expenseText}
              onPress={() => open({ kind: 'expense', expenseId: e.id })}
            />
          ))}
        <AddLink label={t('business.today.addExpense')} onPress={() => open({ kind: 'expense', date: todayId })} />
      </View>

      {month && (
        <>
          <SectionHeader
            title={t('business.today.monthTitle')}
            action={t('home.seeAll')}
            onAction={() => navigation.navigate('BizSummary')}
            style={styles.section}
          />
          <View style={styles.pad}>
            <StatTiles
              items={[
                { value: money(month.sales, { decimals: 0 }), label: t('business.summary.sales') },
                { value: money(month.expenses, { decimals: 0 }), label: t('business.summary.expenses') },
                { value: money(month.profit, { decimals: 0 }), label: month.profit >= 0 ? t('business.summary.profit') : t('business.summary.loss') },
              ]}
            />
            {month.pendingFixed > 0 && (
              <Note
                icon="time-outline"
                text={t('business.today.pendingFixed', { amount: money(month.pendingFixed) })}
                style={styles.gapTop}
              />
            )}
          </View>
        </>
      )}
    </HeroScrollScreen>
  );
};

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 20 },
  section: { marginTop: 26 },
  banner: { marginBottom: 10 },
  gapTop: { marginTop: 10 },
});

export default BizTodayScreen;
