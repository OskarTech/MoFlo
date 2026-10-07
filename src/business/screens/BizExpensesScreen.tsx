import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { HeroScrollScreen } from '../../components/layout/HeroScreen';
import { MonthSelector } from '../../components/layout/HeroBar';
import { GroupHeader, SectionHeader } from '../../components/layout/SheetSection';
import { useTheme } from '../../hooks/useTheme';
import { useBusinessStore } from '../store/businessStore';
import { useBizUiStore } from '../store/uiStore';
import { monthKey, monthKeyOfDay, orderedItems, sumOf } from '../logic/basics';
import { existingRecurringKeys, pendingRecurringOfMonth } from '../logic/recurring';
import { AddLink, EmptyNote, ListRow, useMoney } from '../ui/kit';
import { BizHero, HeroStat } from '../ui/BizHeader';
import { dayTitle, monthTitle } from '../ui/format';
import { useMonth } from '../ui/useMonth';

/**
 * Gastos: los fijos (alquiler, luz, nóminas…) y los gastos del mes, día a
 * día, con su proveedor. Los fijos que aún no han llegado este mes salen
 * como pendientes.
 */
const BizExpensesScreen = () => {
  const { t, i18n } = useTranslation();
  const { colors: dc, ui } = useTheme();
  const { symbol, money } = useMoney();
  const config = useBusinessStore((s) => s.config);
  const expenses = useBusinessStore((s) => s.expenses);
  const recurring = useBusinessStore((s) => s.recurring);
  const open = useBizUiStore((s) => s.open);
  const { year, month0, todayId, summary, prev, next, canNext } = useMonth();
  const month = monthKey(year, month0);

  const monthExpenses = useMemo(
    () => Object.values(expenses).filter((e) => monthKeyOfDay(e.date) === month)
      .sort((a, b) => (b.date.localeCompare(a.date)) || b.createdAt.localeCompare(a.createdAt)),
    [expenses, month],
  );
  const byDay = useMemo(() => {
    const groups: { date: string; items: typeof monthExpenses }[] = [];
    for (const e of monthExpenses) {
      const last = groups[groups.length - 1];
      if (last?.date === e.date) last.items.push(e);
      else groups.push({ date: e.date, items: [e] });
    }
    return groups;
  }, [monthExpenses]);
  const fixedList = useMemo(
    () => Object.values(recurring).sort((a, b) => (a.day - b.day) || a.name.localeCompare(b.name)),
    [recurring],
  );
  const pending = useMemo(
    () => new Set(pendingRecurringOfMonth(Object.values(recurring), existingRecurringKeys(Object.values(expenses)), year, month0)
      .map((p) => p.recurring.id)),
    [recurring, expenses, year, month0],
  );
  const suppliersTotal = sumOf(monthExpenses.filter((e) => e.supplierId || e.supplierName), (e) => e.amount);
  const fixedTotal = sumOf(monthExpenses.filter((e) => e.recurringId), (e) => e.amount);

  const hero = (
    <BizHero
      label={`${t('business.expenses.title')} · ${monthTitle(year, month0, t)}`}
      amount={summary?.expenses ?? 0}
      symbol={symbol}
      caption={summary && summary.pendingFixed > 0 ? t('business.expenses.pending', { amount: money(summary.pendingFixed) }) : null}
      stats={[
        <HeroStat key="a" icon="cart-outline" label={t('business.expenses.suppliers')} value={money(suppliersTotal)} />,
        <HeroStat key="b" icon="repeat" label={t('business.expenses.fixed')} value={money(fixedTotal)} end />,
      ]}
      below={(
        <View style={styles.month}>
          <MonthSelector label={monthTitle(year, month0, t)} onPrev={prev} onNext={next} canNext={canNext} />
        </View>
      )}
    />
  );

  const typeIcon = (typeId: string) => (config?.expenseTypes[typeId]?.icon ?? 'pricetag') as never;

  return (
    <HeroScrollScreen hero={hero}>
      <SectionHeader title={t('business.expenses.fixedTitle')} />
      <View style={styles.pad}>
        {fixedList.length === 0 ? (
          <EmptyNote text={t('business.expenses.noFixed')} />
        ) : fixedList.map((r) => (
          <ListRow
            key={r.id}
            icon={typeIcon(r.typeId)}
            color={ui.expenseText}
            title={r.name}
            subtitle={[
              t('business.expenses.everyMonth', { day: r.day }),
              !r.active ? t('business.expenses.paused') : pending.has(r.id) ? t('business.expenses.pendingShort') : null,
            ].filter(Boolean).join(' · ')}
            right={money(r.amount, { sign: '-' })}
            rightColor={r.active ? ui.expenseText : dc.textSecondary}
            dim={!r.active}
            onPress={() => open({ kind: 'recurring', recurringId: r.id })}
          />
        ))}
        <AddLink label={t('business.expenses.addFixed')} onPress={() => open({ kind: 'recurring' })} />
      </View>

      <SectionHeader title={t('business.expenses.monthTitle', { month: monthTitle(year, month0, t) })} style={styles.section} />
      <View style={styles.pad}>
        {byDay.length === 0 ? (
          <EmptyNote text={t('business.expenses.empty')} />
        ) : byDay.map((group, i) => (
          <View key={group.date}>
            <GroupHeader
              first={i === 0}
              label={dayTitle(group.date, t, i18n.language, todayId)}
              total={money(sumOf(group.items, (e) => e.amount), { sign: '-' })}
            />
            {group.items.map((e) => (
              <ListRow
                key={e.id}
                icon={typeIcon(e.typeId)}
                color={ui.expenseText}
                title={e.name || e.supplierName || e.typeName}
                subtitle={[
                  e.name && e.supplierName ? e.supplierName : null,
                  config?.expenseTypes[e.typeId]?.name ?? e.typeName,
                  e.recurringId ? t('business.expenses.fixedShort') : null,
                ].filter(Boolean).join(' · ')}
                right={money(e.amount, { sign: '-' })}
                rightColor={ui.expenseText}
                onPress={() => open({ kind: 'expense', expenseId: e.id })}
              />
            ))}
          </View>
        ))}
        <AddLink label={t('business.today.addExpense')} onPress={() => open({ kind: 'expense' })} />
      </View>
      {orderedItems(config?.suppliers).length === 0 && monthExpenses.length > 0 && (
        <EmptyNote text={t('business.expenses.suppliersHint')} style={styles.pad} />
      )}
    </HeroScrollScreen>
  );
};

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 20 },
  section: { marginTop: 26 },
  month: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
});

export default BizExpensesScreen;
