import React, { useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { HeroScrollScreen } from '../../components/layout/HeroScreen';
import { HeroIconButton, MonthSelector } from '../../components/layout/HeroBar';
import { SectionHeader } from '../../components/layout/SheetSection';
import { useTheme } from '../../hooks/useTheme';
import { useBusinessStore } from '../store/businessStore';
import { cents, monthKey, monthKeyOfDay } from '../logic/basics';
import { quarterMonths, taxEstimate } from '../logic/taxes';
import { SummaryBlock, summaryLayout } from '../logic/summaryLayout';
import { DEFAULT_CORPORATE_TAX, DEFAULT_FOOD_TARGET, DEFAULT_STAFF_TARGET } from '../templates';
import {
  AmountText, ColumnBars, DayBars, EmptyNote, FieldRow, Note, PillButton, RankList, StackBar, StatTiles, useMoney,
} from '../ui/kit';
import { BizHero, HeroStat } from '../ui/BizHeader';
import { monthTitle, weekdayLetter } from '../ui/format';
import { useMonth } from '../ui/useMonth';
import SummaryBlocksSheet from '../sheets/SummaryBlocksSheet';

/**
 * El resumen del mes: arriba, el beneficio o la pérdida, y debajo los bloques
 * elegidos (ver summaryLayout.ts), iguales para todos los socios: lo que queda
 * de verdad después de impuestos, el IVA, la materia prima y el personal, en
 * qué se va el dinero, el resultado de cada día, cómo pagan, los tickets, los
 * días de la semana y los proveedores.
 */
const BizSummaryScreen = () => {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const { colors: dc, ui, categoryColors } = useTheme();
  const { symbol, money } = useMoney();
  const config = useBusinessStore((s) => s.config);
  const days = useBusinessStore((s) => s.days);
  const expenses = useBusinessStore((s) => s.expenses);
  const { year, month0, summary, prev, next, canNext } = useMonth();
  const [customizing, setCustomizing] = useState(false);

  const incomeColor = (i: number) => categoryColors.income[i % categoryColors.income.length];
  const expenseColor = (i: number) => categoryColors.expense[i % categoryColors.expense.length];

  // Lo vendido de media cada día de la semana (solo los días con ventas)
  const weekdays = useMemo(() => {
    const totals = Array.from({ length: 7 }, () => ({ sum: 0, n: 0 }));
    for (const d of summary?.days ?? []) {
      if (d.future || d.sales <= 0) continue;
      totals[d.weekday].sum += d.sales;
      totals[d.weekday].n += 1;
    }
    // De lunes a domingo
    return [1, 2, 3, 4, 5, 6, 0].map((w) => ({
      key: String(w), label: weekdayLetter(w, i18n.language), value: totals[w].n ? totals[w].sum / totals[w].n : 0,
    }));
  }, [summary, i18n.language]);

  // El IVA de todo el trimestre del mes (el del 303) y de todo su año
  const vatPeriods = useMemo(() => {
    if (!config) return null;
    const months = new Set(quarterMonths(month0).map((m) => monthKey(year, m)));
    const inQuarter = (dayId: string) => months.has(monthKeyOfDay(dayId));
    const inYear = (dayId: string) => dayId.startsWith(`${year}-`);
    const allDays = Object.values(days);
    const allExpenses = Object.values(expenses);
    return {
      quarter: taxEstimate(allDays.filter((d) => inQuarter(d.id)), allExpenses.filter((e) => inQuarter(e.date)), config),
      year: taxEstimate(allDays.filter((d) => inYear(d.id)), allExpenses.filter((e) => inYear(e.date)), config),
    };
  }, [config, days, expenses, year, month0]);

  if (!summary || !config) {
    return (
      <HeroScrollScreen hero={<BizHero label={t('business.summary.title')} amount={0} symbol={symbol} />}>
        <EmptyNote text={t('business.loading')} style={styles.pad} />
      </HeroScrollScreen>
    );
  }

  const spentPct = summary.sales > 0 ? Math.round((summary.expenses / summary.sales) * 100) : null;
  const pctOf = (amount: number) => (summary.sales > 0 ? Math.round((amount / summary.sales) * 100) : null);
  const profitLabel = summary.profit >= 0 ? t('business.summary.profit') : t('business.summary.loss');
  const taxes = summary.taxes;
  const signColor = (v: number) => (v >= 0 ? ui.incomeText : ui.expenseText);
  // Lo que se resta, con su signo (sin «-0,00» cuando no hay nada)
  const minus = (v: number) => (v > 0 ? money(v, { sign: '-' }) : money(0));
  const channelParts = [
    ...summary.byChannel.map((c, i) => ({ key: c.key, label: c.name, value: c.amount, color: incomeColor(i) })),
    ...(summary.manual.length
      ? [{ key: 'manual', label: t('business.summary.byHand'), value: cents(summary.manual.reduce((s, m) => s + m.amount, 0)), color: incomeColor(summary.byChannel.length) }]
      : []),
  ];
  const hasDays = summary.days.some((d) => d.hasData);
  const foodPct = pctOf(summary.foodCost);
  const staffPct = pctOf(summary.staffCost);
  const foodTarget = config.foodCostTarget ?? DEFAULT_FOOD_TARGET;
  const staffTarget = config.staffCostTarget ?? DEFAULT_STAFF_TARGET;
  const withVat = config.vatEnabled !== false;
  const withCorporateTax = config.corporateTaxEnabled !== false;
  const layout = summaryLayout(config);
  // Los fijos que faltan cambian el resultado de arriba: su aviso va pegado a él
  const pendingNote = summary.pendingFixed > 0;

  const hero = (
    <BizHero
      label={`${profitLabel} · ${monthTitle(year, month0, t)}`}
      amount={summary.profit}
      symbol={symbol}
      track={spentPct}
      caption={spentPct != null
        ? t('business.summary.spentPct', { pct: spentPct })
        : t('business.summary.noSales')}
      stats={[
        <HeroStat key="a" icon="arrow-down" label={t('business.summary.sales')} value={money(summary.sales)} />,
        <HeroStat key="b" icon="arrow-up" label={t('business.summary.expenses')} value={money(summary.expenses)} end />,
      ]}
      right={<HeroIconButton icon="grid-outline" onPress={() => setCustomizing(true)} accessibilityLabel={t('business.summary.customize')} />}
      below={(
        <View style={styles.month}>
          <MonthSelector label={monthTitle(year, month0, t)} onPrev={prev} onNext={next} canNext={canNext} />
        </View>
      )}
    />
  );

  // El título de cada bloque; el primero, más pegado arriba
  const header = (title: string, first: boolean) => <SectionHeader title={title} style={first ? styles.first : styles.section} />;

  const block = (id: SummaryBlock, first: boolean): React.ReactNode => {
    switch (id) {
      case 'taxes':
        return (
          <>
            {header(t('business.taxes.title'), first)}
            <View style={styles.pad}>
              <FieldRow
                icon="shield-checkmark"
                color={signColor(taxes.realProfit)}
                title={t('business.taxes.realProfit')}
                subtitle={t(withVat || withCorporateTax ? 'business.taxes.realProfitHint' : 'business.taxes.realProfitNoTaxes')}
                right={<AmountText text={money(taxes.realProfit)} color={signColor(taxes.realProfit)} strong />}
              />
              {withVat && (
                <>
                  <FieldRow
                    icon="arrow-down"
                    title={t('business.taxes.salesBase')}
                    subtitle={t('business.taxes.salesVat', { amount: money(taxes.salesVat) })}
                    right={<AmountText text={money(taxes.salesBase)} />}
                  />
                  <FieldRow
                    icon="arrow-up"
                    title={t('business.taxes.expensesBase')}
                    subtitle={t('business.taxes.expensesVat', { amount: money(taxes.expensesVat) })}
                    right={<AmountText text={minus(taxes.expensesBase)} />}
                  />
                </>
              )}
              {withCorporateTax && (
                <FieldRow
                  icon="business"
                  title={t('business.taxes.corporateTax', { pct: config.corporateTaxRate ?? DEFAULT_CORPORATE_TAX })}
                  subtitle={t(withVat ? 'business.taxes.beforeTax' : 'business.taxes.beforeTaxNoVat', { amount: money(taxes.profitBeforeTax) })}
                  right={<AmountText text={minus(taxes.corporateTax)} />}
                />
              )}
              <Note text={t('business.taxes.note')} style={styles.gapTop} />
            </View>
          </>
        );
      case 'vat':
        return (
          <>
            {header(t('business.vat.title'), first)}
            <View style={styles.pad}>
              {withVat ? (
                <>
                  <FieldRow
                    icon="arrow-down"
                    title={t('business.vat.collected')}
                    subtitle={t('business.vat.collectedHint')}
                    right={<AmountText text={money(taxes.salesVat)} />}
                  />
                  <FieldRow
                    icon="arrow-up"
                    title={t('business.vat.deductible')}
                    subtitle={t('business.vat.deductibleHint')}
                    right={<AmountText text={minus(taxes.expensesVat)} />}
                  />
                  <FieldRow
                    icon="receipt"
                    color={taxes.vatToPay < 0 ? ui.incomeText : undefined}
                    title={t('business.vat.balance')}
                    subtitle={t(taxes.vatToPay < 0 ? 'business.vat.toOffset' : 'business.vat.toPay')}
                    right={<AmountText text={money(Math.abs(taxes.vatToPay))} color={taxes.vatToPay < 0 ? ui.incomeText : undefined} strong />}
                  />
                  {vatPeriods && (
                    <StatTiles
                      style={styles.gapTop}
                      items={[
                        {
                          value: money(Math.abs(vatPeriods.quarter.vatToPay), { decimals: 0 }),
                          label: t(vatPeriods.quarter.vatToPay < 0 ? 'business.vat.quarterToOffset' : 'business.vat.quarterToPay', { q: Math.floor(month0 / 3) + 1 }),
                        },
                        {
                          value: money(Math.abs(vatPeriods.year.vatToPay), { decimals: 0 }),
                          label: t(vatPeriods.year.vatToPay < 0 ? 'business.vat.yearToOffset' : 'business.vat.yearToPay', { year }),
                        },
                      ]}
                    />
                  )}
                </>
              ) : <EmptyNote text={t('business.vat.off')} />}
            </View>
          </>
        );
      case 'costs':
        return (
          <>
            {header(t('business.summary.costsTitle'), first)}
            <View style={styles.pad}>
              <FieldRow
                icon="basket"
                color={foodPct != null && foodPct > foodTarget ? ui.expenseText : ui.incomeText}
                title={t('business.summary.foodCost', { amount: money(summary.foodCost, { decimals: 0 }) })}
                subtitle={t('business.summary.target', { pct: foodTarget })}
                right={<AmountText text={foodPct != null ? `${foodPct} %` : '—'} color={foodPct != null && foodPct > foodTarget ? ui.expenseText : undefined} strong />}
              />
              <FieldRow
                icon="people"
                color={staffPct != null && staffPct > staffTarget ? ui.expenseText : ui.incomeText}
                title={t('business.summary.staffCost', { amount: money(summary.staffCost, { decimals: 0 }) })}
                subtitle={t('business.summary.target', { pct: staffTarget })}
                right={<AmountText text={staffPct != null ? `${staffPct} %` : '—'} color={staffPct != null && staffPct > staffTarget ? ui.expenseText : undefined} strong />}
              />
              <EmptyNote text={t('business.summary.costsNote')} />
            </View>
          </>
        );
      case 'whereItGoes':
        return (
          <>
            {header(t('business.summary.whereItGoes'), first)}
            <View style={styles.pad}>
              {summary.byType.length ? (
                <StackBar
                  parts={summary.byType.map((x, i) => ({ key: x.key, label: x.name, value: x.amount, color: expenseColor(i) }))}
                  format={(v) => money(v, { decimals: 0 })}
                />
              ) : <EmptyNote text={t('business.expenses.empty')} />}
            </View>
          </>
        );
      case 'days':
        return (
          <>
            {header(t('business.summary.dayByDay'), first)}
            <View style={styles.pad}>
              {hasDays ? (
                <>
                  <DayBars
                    days={summary.days.map((d) => ({ id: d.id, value: d.hasData || (d.open && !d.future) ? d.result : null, future: d.future }))}
                    accessibilityLabel={t('business.summary.dayByDayA11y')}
                    firstLabel="1"
                    middleLabel="15"
                    lastLabel={String(summary.days.length)}
                    onPressDay={(id) => navigation.navigate('BizSales', { screen: 'BizDay', params: { dayId: id } })}
                  />
                  <EmptyNote text={config.spreadFixed ? t('business.summary.spreadNote') : t('business.summary.noSpreadNote')} />
                </>
              ) : <EmptyNote text={t('business.summary.empty')} />}
            </View>
          </>
        );
      case 'payments':
        return (
          <>
            {header(t('business.summary.howTheyPay'), first)}
            <View style={styles.pad}>
              {channelParts.length > 0 ? (
                <>
                  <StackBar parts={channelParts} format={(v) => money(v, { decimals: 0 })} />
                  {summary.pendingSales > 0 && (
                    <Note icon="time-outline" text={t('business.summary.pendingSales', { amount: money(summary.pendingSales) })} style={styles.gapTop} />
                  )}
                </>
              ) : <EmptyNote text={t('business.summary.noSales')} />}
            </View>
          </>
        );
      case 'tickets':
        return (
          <>
            {header(t('business.summary.ticketsTitle'), first)}
            <View style={styles.pad}>
              {summary.tickets > 0 || summary.cashDiff != null ? (
                <StatTiles
                  items={[
                    { value: String(summary.tickets), label: t('business.today.tickets') },
                    { value: summary.avgTicket != null ? money(summary.avgTicket) : '—', label: t('business.today.avgTicket') },
                    { value: summary.cashDiff != null ? money(summary.cashDiff) : '—', label: t('business.summary.cashDiff') },
                  ]}
                />
              ) : <EmptyNote text={t('business.summary.noSales')} />}
            </View>
          </>
        );
      case 'weekdays':
        return (
          <>
            {header(t('business.summary.weekdays'), first)}
            <View style={styles.pad}>
              {weekdays.some((w) => w.value > 0)
                ? <ColumnBars columns={weekdays} color={dc.income} accessibilityLabel={t('business.summary.weekdaysA11y')} />
                : <EmptyNote text={t('business.summary.noSales')} />}
            </View>
          </>
        );
      case 'suppliers':
        return (
          <>
            {header(t('business.summary.suppliers'), first)}
            <View style={styles.pad}>
              {summary.bySupplier.length > 0 ? (
                <RankList
                  color={dc.expense}
                  rows={summary.bySupplier.slice(0, 8).map((s) => ({
                    key: s.key, label: s.name, value: money(s.amount, { decimals: 0 }),
                    sub: t('business.summary.invoices', { count: s.count }), weight: s.amount,
                  }))}
                />
              ) : <EmptyNote text={t('business.summary.noSuppliers')} />}
            </View>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <HeroScrollScreen hero={hero}>
        {pendingNote && (
          <View style={[styles.pad, styles.first]}>
            <Note
              icon="time-outline"
              text={t('business.summary.forecast', { pending: money(summary.pendingFixed), result: money(summary.forecastProfit) })}
            />
          </View>
        )}
        {layout.map((id, i) => <React.Fragment key={id}>{block(id, i === 0 && !pendingNote)}</React.Fragment>)}
        {layout.length === 0 && <EmptyNote text={t('business.summary.noBlocks')} style={[styles.pad, styles.first]} />}
        <View style={[styles.pad, styles.customize]}>
          <PillButton label={t('business.summary.customize')} icon="grid-outline" tone="soft" onPress={() => setCustomizing(true)} />
        </View>
      </HeroScrollScreen>

      {/* Fuera de la lista, como las ventanas de Ajustes */}
      <SummaryBlocksSheet visible={customizing} onClose={() => setCustomizing(false)} />
    </>
  );
};

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 20 },
  first: { marginTop: 14 },
  section: { marginTop: 26 },
  gapTop: { marginTop: 10 },
  month: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
  customize: { marginTop: 28, alignItems: 'center' },
});

export default BizSummaryScreen;
