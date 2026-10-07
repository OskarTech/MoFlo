import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { HeroScrollScreen } from '../../components/layout/HeroScreen';
import { MonthSelector } from '../../components/layout/HeroBar';
import { SectionHeader } from '../../components/layout/SheetSection';
import { useTheme } from '../../hooks/useTheme';
import { EmptyNote, ListRow, useMoney } from '../ui/kit';
import { BizHero, HeroStat } from '../ui/BizHeader';
import { monthTitle, shortDay } from '../ui/format';
import { useMonth } from '../ui/useMonth';

/**
 * Ventas: los días del mes, del más reciente al primero, con lo vendido, lo
 * gastado y el resultado de cada uno. Los días que se abre sin nada apuntado
 * salen en gris, para que no se olvide ningún cierre.
 */
const BizSalesScreen = () => {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const { ui } = useTheme();
  const { symbol, money } = useMoney();
  const { year, month0, summary, prev, next, canNext } = useMonth();

  const rows = (summary?.days ?? [])
    .filter((d) => !d.future && (d.hasData || d.open))
    .reverse();

  const hero = (
    <BizHero
      label={`${t('business.sales.title')} · ${monthTitle(year, month0, t)}`}
      amount={summary?.sales ?? 0}
      symbol={symbol}
      stats={[
        <HeroStat key="a" icon="calendar-outline" label={t('business.sales.daysWithSales')} value={String(summary?.daysWithSales ?? 0)} />,
        <HeroStat
          key="b"
          icon="trending-up"
          label={t('business.sales.perDay')}
          value={summary && summary.daysWithSales ? money(summary.sales / summary.daysWithSales) : '—'}
          end
        />,
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
      <SectionHeader title={t('business.sales.days')} />
      <View style={styles.pad}>
        {rows.length === 0 ? (
          <EmptyNote text={t('business.sales.empty')} />
        ) : rows.map((d) => {
          const status = d.status === 'closed'
            ? t('business.day.closedShort')
            : d.status === 'closing' ? t('business.day.closing') : d.hasData ? t('business.day.openShort') : t('business.day.nothing');
          return (
            <ListRow
              key={d.id}
              icon={d.status === 'closed' ? 'lock-closed' : d.hasData ? 'lock-open' : 'time-outline'}
              color={d.status === 'closed' ? ui.accent : undefined}
              title={shortDay(d.id, i18n.language)}
              subtitle={[status, d.hasData ? t('business.sales.result', { amount: money(d.result) }) : null].filter(Boolean).join(' · ')}
              right={d.hasData ? money(d.sales) : '—'}
              rightSub={d.spent > 0 ? money(d.spent, { sign: '-' }) : null}
              dim={!d.hasData}
              onPress={() => navigation.navigate('BizDay', { dayId: d.id })}
            />
          );
        })}
      </View>
    </HeroScrollScreen>
  );
};

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 20 },
  month: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
});

export default BizSalesScreen;
