import React, { useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { HeroScrollScreen } from '../../components/layout/HeroScreen';
import { MonthSelector } from '../../components/layout/HeroBar';
import { SectionHeader } from '../../components/layout/SheetSection';
import { useTheme } from '../../hooks/useTheme';
import { useBusinessStore } from '../store/businessStore';
import { usesOrders, usesTills } from '../logic/days';
import { ranking } from '../logic/orders';
import { cents, orderedItems } from '../logic/basics';
import {
  Chip, ChipRow, ColumnBars, DayBars, EmptyNote, ListRow, Note, RankList, StackBar, StatTiles, useMoney,
} from '../ui/kit';
import { BizHero, HeroStat } from '../ui/BizHeader';
import { monthTitle, weekdayLetter } from '../ui/format';
import { useMonth } from '../ui/useMonth';

/**
 * El resumen del mes: el beneficio o la pérdida, el resultado de cada día,
 * cómo pagan, en qué se va el dinero y a qué proveedores; y, según cómo
 * trabaje la empresa, lo más vendido, los tamaños, los extras y las horas
 * fuertes, o lo que vende cada empleado, las secciones y los descuadres.
 */
const BizSummaryScreen = () => {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const { colors: dc, ui, categoryColors } = useTheme();
  const { symbol, money } = useMoney();
  const config = useBusinessStore((s) => s.config);
  const catalog = useBusinessStore((s) => s.catalog);
  const { year, month0, summary, prev, next, canNext } = useMonth();
  // Lo más vendido de una categoría (las pizzas, las bebidas…)
  const [topCat, setTopCat] = useState<string | null>(null);
  const orderMode = usesOrders(config);
  const tillMode = usesTills(config);

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

  const soldCats = useMemo(() => {
    const ids = new Set(Object.values(summary?.orders?.items ?? {}).map((i) => i.categoryId));
    return orderedItems(catalog?.categories).filter((c) => ids.has(c.id));
  }, [summary, catalog]);

  const hours = useMemo(() => {
    const record = summary?.orders?.hours ?? {};
    const used = Object.entries(record).filter(([, v]) => v > 0).map(([h]) => Number(h));
    if (!used.length) return [];
    const from = Math.min(...used);
    const to = Math.max(...used);
    return Array.from({ length: to - from + 1 }, (_, i) => ({
      key: String(from + i), label: String(from + i), value: record[String(from + i)] ?? 0,
    }));
  }, [summary]);

  if (!summary || !config) {
    return (
      <HeroScrollScreen hero={<BizHero label={t('business.summary.title')} amount={0} symbol={symbol} />}>
        <EmptyNote text={t('business.loading')} style={styles.pad} />
      </HeroScrollScreen>
    );
  }

  const spentPct = summary.sales > 0 ? Math.round((summary.expenses / summary.sales) * 100) : null;
  const profitLabel = summary.profit >= 0 ? t('business.summary.profit') : t('business.summary.loss');
  const channelParts = [
    ...summary.byChannel.map((c, i) => ({ key: c.key, label: c.name, value: c.amount, color: incomeColor(i) })),
    ...(summary.manual.length
      ? [{ key: 'manual', label: t('business.summary.byHand'), value: cents(summary.manual.reduce((s, m) => s + m.amount, 0)), color: incomeColor(summary.byChannel.length) }]
      : []),
  ];
  const sizes = Object.entries(summary.orders?.sizes ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([name, qty], i) => ({ key: name, label: name, value: qty, color: incomeColor(i) }));
  const cat = soldCats.some((c) => c.id === topCat) ? topCat : null;
  const items = summary.orders
    ? ranking(summary.orders.items).filter((i) => !cat || i.categoryId === cat).slice(0, 10)
    : [];
  const extras = summary.orders ? ranking(summary.orders.extras).slice(0, 8) : [];
  const hasDays = summary.days.some((d) => d.hasData);

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
      below={(
        <View style={styles.month}>
          <MonthSelector label={monthTitle(year, month0, t)} onPrev={prev} onNext={next} canNext={canNext} />
        </View>
      )}
    />
  );

  return (
    <HeroScrollScreen hero={hero}>
      {summary.pendingFixed > 0 && (
        <View style={styles.pad}>
          <Note
            icon="time-outline"
            text={t('business.summary.forecast', { pending: money(summary.pendingFixed), result: money(summary.forecastProfit) })}
          />
        </View>
      )}

      <SectionHeader title={t('business.summary.dayByDay')} style={styles.first} />
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

      {channelParts.length > 0 && (
        <>
          <SectionHeader title={t('business.summary.howTheyPay')} style={styles.section} />
          <View style={styles.pad}>
            <StackBar parts={channelParts} format={(v) => money(v, { decimals: 0 })} />
          </View>
        </>
      )}

      {orderMode && summary.orders && (
        <>
          <SectionHeader title={t('business.summary.ordersTitle')} style={styles.section} />
          <View style={styles.pad}>
            <StatTiles
              items={[
                { value: String(summary.orders.count), label: t('business.close.orders', { count: summary.orders.count }) },
                { value: summary.avgTicket != null ? money(summary.avgTicket) : '—', label: t('business.today.avgOrder') },
                { value: String(summary.orders.voided), label: t('business.close.voided', { count: summary.orders.voided }) },
              ]}
            />
          </View>
          {items.length > 0 && (
            <>
              <SectionHeader title={t('business.summary.topSold')} style={styles.section} />
              <View style={styles.pad}>
                {soldCats.length > 1 && (
                  <ChipRow scroll style={styles.chips}>
                    <Chip label={t('business.catalog.allCategories')} selected={!cat} onPress={() => setTopCat(null)} />
                    {soldCats.map((c) => (
                      <Chip key={c.id} label={c.name} selected={c.id === cat} onPress={() => setTopCat(c.id)} />
                    ))}
                  </ChipRow>
                )}
                <RankList
                  color={ui.accent}
                  rows={items.map((item) => ({
                    key: item.key, label: item.name, value: t('business.summary.units', { count: item.qty }),
                    sub: money(item.amount), weight: item.qty,
                  }))}
                />
              </View>
            </>
          )}
          {sizes.length > 0 && (
            <>
              <SectionHeader title={t('business.summary.sizes')} style={styles.section} />
              <View style={styles.pad}>
                <StackBar parts={sizes} format={(v) => t('business.summary.units', { count: v })} />
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
          {hours.length > 0 && (
            <>
              <SectionHeader title={t('business.summary.hours')} style={styles.section} />
              <View style={styles.pad}>
                <ColumnBars columns={hours} color={ui.accent} accessibilityLabel={t('business.summary.hoursA11y')} />
              </View>
            </>
          )}
        </>
      )}

      {tillMode && (
        <>
          <SectionHeader title={t('business.summary.tillsTitle')} style={styles.section} />
          <View style={styles.pad}>
            <StatTiles
              items={[
                { value: String(summary.tickets), label: t('business.today.tickets') },
                { value: summary.avgTicket != null ? money(summary.avgTicket) : '—', label: t('business.today.avgTicket') },
                { value: summary.cashDiff != null ? money(summary.cashDiff) : '—', label: t('business.summary.cashDiff') },
              ]}
            />
          </View>
        </>
      )}

      {summary.byWorker.length > 0 && (
        <>
          <SectionHeader title={t('business.summary.byWorker')} style={styles.section} />
          <View style={styles.pad}>
            {summary.byWorker.map((w) => (
              <ListRow
                key={w.key}
                initial={w.name.charAt(0).toUpperCase()}
                title={w.name}
                subtitle={[
                  w.tickets ? t('business.summary.workerTickets', { count: w.tickets, avg: money(w.sales / w.tickets) }) : null,
                  w.cashDiff != null && Math.abs(w.cashDiff) >= 0.01 ? `${t('business.entry.diff')} ${money(w.cashDiff)}` : null,
                ].filter(Boolean).join(' · ') || null}
                right={money(w.sales)}
                rightSub={summary.sales > 0 ? `${Math.round((w.sales / summary.sales) * 100)} %` : null}
              />
            ))}
          </View>
        </>
      )}

      {summary.bySection.length > 0 && (
        <>
          <SectionHeader title={t('business.summary.sections')} style={styles.section} />
          <View style={styles.pad}>
            <StackBar
              parts={summary.bySection.map((s, i) => ({ key: s.key, label: s.name, value: s.amount, color: incomeColor(i) }))}
              format={(v) => money(v, { decimals: 0 })}
            />
          </View>
        </>
      )}

      {weekdays.some((w) => w.value > 0) && (
        <>
          <SectionHeader title={t('business.summary.weekdays')} style={styles.section} />
          <View style={styles.pad}>
            <ColumnBars columns={weekdays} color={dc.income} accessibilityLabel={t('business.summary.weekdaysA11y')} />
          </View>
        </>
      )}

      <SectionHeader title={t('business.summary.whereItGoes')} style={styles.section} />
      <View style={styles.pad}>
        {summary.byType.length ? (
          <StackBar
            parts={summary.byType.map((x, i) => ({ key: x.key, label: x.name, value: x.amount, color: expenseColor(i) }))}
            format={(v) => money(v, { decimals: 0 })}
          />
        ) : <EmptyNote text={t('business.expenses.empty')} />}
      </View>

      {summary.bySupplier.length > 0 && (
        <>
          <SectionHeader title={t('business.summary.suppliers')} style={styles.section} />
          <View style={styles.pad}>
            <RankList
              color={dc.expense}
              rows={summary.bySupplier.slice(0, 8).map((s) => ({
                key: s.key, label: s.name, value: money(s.amount, { decimals: 0 }),
                sub: t('business.summary.invoices', { count: s.count }), weight: s.amount,
              }))}
            />
          </View>
        </>
      )}
    </HeroScrollScreen>
  );
};

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 20 },
  first: { marginTop: 14 },
  section: { marginTop: 26 },
  month: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
  chips: { paddingBottom: 12 },
});

export default BizSummaryScreen;
