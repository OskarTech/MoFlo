import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute } from '@react-navigation/native';
import { HeroScrollScreen } from '../../components/layout/HeroScreen';
import { SectionHeader } from '../../components/layout/SheetSection';
import { useTheme } from '../../hooks/useTheme';
import { businessToday, useBusinessStore } from '../store/businessStore';
import { useBizUiStore } from '../store/uiStore';
import { dayEntries, dayFigures } from '../logic/days';
import { monthSummary } from '../logic/summary';
import { cents, dateOfDayId } from '../logic/basics';
import { AddLink, AmountText, EmptyNote, FieldRow, ListRow, useMoney } from '../ui/kit';
import { BizDetailHero, HeroStat } from '../ui/BizHeader';
import { DayStatusCard, EntryRow } from '../ui/DayParts';
import { channelIcon, dayTitle } from '../ui/format';

/**
 * Un día: lo vendido y cómo se cobró, lo de la caja y lo apuntado a mano, lo
 * pendiente de cobro y los gastos
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
  const expenses = useBusinessStore((s) => s.expenses);
  const recurring = useBusinessStore((s) => s.recurring);
  const open = useBizUiStore((s) => s.open);

  const figures = useMemo(() => (config ? dayFigures(day, config) : null), [config, day]);
  const entries = useMemo(() => dayEntries(day), [day]);
  const dayExpenses = useMemo(() => Object.values(expenses).filter((e) => e.date === dayId), [expenses, dayId]);
  const spent = dayExpenses.reduce((s, e) => s + e.amount, 0);
  const sales = figures?.sales ?? 0;
  const todayId = businessToday();
  // El resultado, como en Ventas y en el resumen: si los fijos se reparten,
  // con la parte de este día en vez de los fijos que caen en él
  const row = useMemo(() => {
    if (!config) return null;
    const date = dateOfDayId(dayId);
    return monthSummary({
      year: date.getFullYear(), month0: date.getMonth(), todayId, config, days,
      expenses: Object.values(expenses), recurring: Object.values(recurring),
    }).days.find((d) => d.id === dayId) ?? null;
  }, [config, dayId, days, expenses, recurring, todayId]);
  const result = row ? row.result : cents(sales - spent);
  const tickets = figures?.tickets ?? 0;
  const channels = Object.entries(figures?.byChannel ?? {}).sort((a, b) => b[1] - a[1]);
  const manual = Object.entries(figures?.manual ?? {});

  const hero = (
    <BizDetailHero
      title={dayTitle(dayId, t, i18n.language, todayId)}
      onBack={() => navigation.goBack()}
      label={t('business.day.sold')}
      amount={sales}
      symbol={symbol}
      stats={[
        <HeroStat
          key="a"
          icon="receipt-outline"
          label={t('business.today.tickets')}
          value={tickets ? `${tickets} · ${money(figures!.ticketSales / tickets)}` : '—'}
        />,
        <HeroStat key="b" icon="trending-up" label={t('business.today.result')} value={money(result)} end />,
      ]}
      caption={row && row.fixedShare > 0 ? t('business.day.fixedShare', { amount: money(row.fixedShare) }) : null}
    />
  );

  return (
    <HeroScrollScreen hero={hero}>
      <View style={styles.pad}>
        <DayStatusCard dayId={dayId} day={day} isToday={dayId >= todayId} />
      </View>

      {(channels.length > 0 || manual.length > 0) && (
        <>
          <SectionHeader title={t('business.day.howCharged')} style={styles.section} />
          <View style={styles.pad}>
            {channels.map(([id, amount]) => (
              <FieldRow
                key={id}
                icon={channelIcon(config?.channels?.[id]?.kind)}
                title={figures?.channelNames[id] ?? id}
                right={<AmountText text={money(amount)} />}
              />
            ))}
            {manual.map(([name, amount]) => (
              <FieldRow key={name} icon="create-outline" title={name} subtitle={t('business.entry.byHand')} right={<AmountText text={money(amount)} />} />
            ))}
            {figures && figures.pending > 0 && (
              <FieldRow
                icon="time-outline"
                title={t('business.pos.pending')}
                subtitle={t('business.pos.pendingHint')}
                right={<AmountText text={money(figures.pending)} dim />}
              />
            )}
          </View>
        </>
      )}

      {entries.length > 0 && (
        <>
          <SectionHeader title={t('business.day.entries')} style={styles.section} />
          <View style={styles.pad}>
            {entries.map((e) => <EntryRow key={e.id} entry={e} dayId={dayId} />)}
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
});

export default BizDayScreen;
