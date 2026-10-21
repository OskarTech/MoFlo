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
import { dayEntries, dayFigures } from '../logic/days';
import { monthSummary } from '../logic/summary';
import { cents, dateOfDayId } from '../logic/basics';
import { useMoney, EmptyNote, ListRow, AddLink, StatTiles, Note } from '../ui/kit';
import { BizHero, HeroStat } from '../ui/BizHeader';
import { DayStatusCard, EntryRow } from '../ui/DayParts';
import { longDay } from '../ui/format';

/**
 * Hoy, en la empresa: lo vendido (llega de la caja al cerrar, o se apunta a
 * mano), los gastos de hoy y cómo va el mes, también después de impuestos
 */
const BizTodayScreen = () => {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const { ui } = useTheme();
  const { symbol, money } = useMoney();
  const business = useBusinessStore((s) => s.business);
  const config = useBusinessStore((s) => s.config);
  const days = useBusinessStore((s) => s.days);
  const expenses = useBusinessStore((s) => s.expenses);
  const recurring = useBusinessStore((s) => s.recurring);
  const incoming = useBusinessStore((s) => s.incomingRequests);
  const open = useBizUiStore((s) => s.open);
  const [refreshing, setRefreshing] = useState(false);

  const todayId = businessToday();
  const day = days[todayId];
  const entries = useMemo(() => dayEntries(day), [day]);
  const figures = useMemo(() => (config ? dayFigures(day, config) : null), [config, day]);
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
      expenses: Object.values(expenses), recurring: Object.values(recurring),
    });
  }, [config, days, expenses, recurring, todayId]);

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
  // El resultado, como en Ventas: si los fijos se reparten, con la parte de hoy
  const todayRow = month?.days.find((d) => d.id === todayId) ?? null;
  const resultToday = todayRow ? todayRow.result : cents(sales - spentToday);

  const hero = (
    <BizHero
      label={`${t('home.today')} · ${longDay(todayId, i18n.language)}`}
      amount={sales}
      symbol={symbol}
      caption={todayRow && todayRow.fixedShare > 0 ? t('business.day.fixedShare', { amount: money(todayRow.fixedShare) }) : null}
      stats={[
        <HeroStat key="a" icon="arrow-up" label={t('business.today.spent')} value={money(spentToday)} />,
        <HeroStat key="b" icon="trending-up" label={t('business.today.result')} value={money(resultToday)} end />,
      ]}
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
        <DayStatusCard dayId={todayId} day={day} isToday />
      </View>

      {entries.length > 0 && (
        <>
          <SectionHeader
            title={t('business.day.sold')}
            action={t('business.day.details')}
            onAction={() => navigation.navigate('BizSales', { screen: 'BizDay', params: { dayId: todayId } })}
            style={styles.section}
          />
          <View style={styles.pad}>
            {entries.map((e) => <EntryRow key={e.id} entry={e} dayId={todayId} />)}
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
            <ListRow
              icon="shield-checkmark"
              color={month.taxes.realProfit >= 0 ? ui.incomeText : ui.expenseText}
              title={t('business.taxes.realProfit')}
              subtitle={t('business.taxes.realProfitShort')}
              right={money(month.taxes.realProfit)}
              rightColor={month.taxes.realProfit >= 0 ? ui.incomeText : ui.expenseText}
              onPress={() => navigation.navigate('BizSummary')}
              style={styles.gapTop}
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
