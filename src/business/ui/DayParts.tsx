import React from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/useTheme';
import { successHaptic, warningHaptic } from '../../utils/haptics';
import { useBusinessStore } from '../store/businessStore';
import { useBizUiStore } from '../store/uiStore';
import { entryCashDiff, entryTotal, usesOrders, usesTills } from '../logic/days';
import { describeOrder } from '../logic/orders';
import { BusinessDay, DayEntry, Order } from '../types';
import { ListRow, PillButton, useMoney } from './kit';
import { channelIcon, timeOf } from './format';

/** Las piezas de un día que se ven en Hoy y en el detalle del día */

const memberName = (uid: string | null | undefined) => {
  const business = useBusinessStore.getState().business;
  return uid ? business?.memberNames?.[uid] ?? '' : '';
};

/** El estado del día y lo que se puede hacer con él: cerrarlo, terminar de cerrarlo o reabrirlo */
export const DayStatusCard = ({
  dayId, day, sales, entriesCount, ordersCount,
}: {
  dayId: string;
  day: BusinessDay | undefined;
  sales: number;
  entriesCount: number;
  ordersCount: number;
}) => {
  const { t } = useTranslation();
  const { colors: dc, ui } = useTheme();
  const { money } = useMoney();
  const config = useBusinessStore((s) => s.config);
  const open = useBizUiStore((s) => s.open);
  const status = day?.status ?? 'open';
  const orderMode = usesOrders(config);

  const reopen = () => {
    Alert.alert(t('business.day.reopenTitle'), t('business.day.reopenBody'), [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('business.day.reopen'),
        onPress: async () => {
          warningHaptic();
          await useBusinessStore.getState().reopenDay(dayId);
        },
      },
    ]);
  };

  const closeSimple = () => {
    Alert.alert(
      t('business.day.closeTitle'),
      t('business.day.closeBody', { amount: money(sales), count: entriesCount }),
      [
        { text: t('settings.cancel'), style: 'cancel' },
        {
          text: t('business.day.close'),
          onPress: async () => {
            await useBusinessStore.getState().closeDay(dayId);
            successHaptic();
          },
        },
      ],
    );
  };

  let title: string;
  let subtitle: string;
  let action: React.ReactNode = null;
  if (status === 'closed') {
    title = t('business.day.closed');
    const who = memberName(day?.closedBy);
    subtitle = day?.closedAt
      ? t('business.day.closedBy', { name: who || t('sharedAccount.someone'), time: timeOf(day.closedAt) })
      : '';
    action = <PillButton label={t('business.day.reopen')} icon="lock-open" tone="soft" onPress={reopen} />;
  } else if (status === 'closing') {
    title = t('business.day.closing');
    subtitle = t('business.day.closingHint');
    action = <PillButton label={t('business.day.finishClosing')} icon="lock-closed" onPress={() => open({ kind: 'close', dayId })} />;
  } else if (orderMode) {
    title = t('business.day.open');
    subtitle = t('business.day.ordersSoFar', { count: ordersCount });
    action = <PillButton label={t('business.day.close')} icon="lock-closed" onPress={() => open({ kind: 'close', dayId })} />;
  } else if (entriesCount > 0) {
    title = t('business.day.open');
    subtitle = usesTills(config)
      ? t('business.day.tillsSoFar', { count: entriesCount })
      : t('business.day.entriesSoFar', { count: entriesCount });
    action = <PillButton label={t('business.day.close')} icon="lock-closed" onPress={closeSimple} />;
  } else {
    title = t('business.day.noClose');
    subtitle = usesTills(config) ? t('business.day.noTillsHint') : t('business.day.noCloseHint');
    action = (
      <PillButton
        label={usesTills(config) ? t('business.day.addTill') : t('business.day.addClose')}
        icon="add"
        onPress={() => open({ kind: 'entry', dayId })}
      />
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: ui.field }]}>
      <View style={styles.cardText}>
        <Text style={[styles.cardTitle, { color: dc.textPrimary }]} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={[styles.cardSub, { color: dc.textSecondary }]} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
};

/** Una caja, un turno o el cierre del día */
export const EntryRow = ({
  entry, dayOpen, dayId,
}: { entry: DayEntry; dayOpen: boolean; dayId: string }) => {
  const { t } = useTranslation();
  const { money } = useMoney();
  const config = useBusinessStore((s) => s.config);
  const open = useBizUiStore((s) => s.open);
  const workerName = (entry.workerId && config?.workers?.[entry.workerId]?.name) || entry.workerName;
  const till = (entry.tillId && config?.tills?.[entry.tillId]?.name) || entry.tillName;
  const shift = (entry.shiftId && config?.shifts?.[entry.shiftId]?.name) || entry.shiftName;
  const title = entry.fromOrders
    ? t('business.day.closeEntry')
    : [workerName, till, shift].filter(Boolean).join(' · ') || t('business.day.wholeDay');
  const parts: string[] = [];
  if (entry.tickets) parts.push(t('business.day.tickets', { count: entry.tickets }));
  const diff = config ? entryCashDiff(entry, config) : null;
  if (diff != null) parts.push(Math.abs(diff) < 0.01 ? t('business.entry.balanced') : `${t('business.entry.diff')} ${money(diff)}`);
  const firstChannel = Object.keys(entry.amounts ?? {})[0];
  return (
    <ListRow
      initial={workerName && !entry.fromOrders ? workerName.charAt(0).toUpperCase() : undefined}
      icon={entry.fromOrders ? 'lock-closed' : channelIcon(firstChannel ? config?.channels?.[firstChannel]?.kind : 'cash')}
      title={title}
      subtitle={parts.join(' · ') || null}
      right={money(entryTotal(entry))}
      onPress={dayOpen && !entry.fromOrders ? () => open({ kind: 'entry', dayId, entryId: entry.id }) : undefined}
    />
  );
};

/** Un pedido: lo pedido, la hora, cómo pagó y quién lo apuntó. Anulado, tachado */
export const OrderRow = ({ order, dayOpen }: { order: Order; dayOpen: boolean }) => {
  const { t } = useTranslation();
  const { money } = useMoney();
  const open = useBizUiStore((s) => s.open);
  const voided = order.status === 'void';
  const subtitle = voided
    ? t('business.order.voidedBy', {
      name: memberName(order.voidedBy) || t('sharedAccount.someone'),
      time: order.voidedAt ? timeOf(order.voidedAt) : '',
    })
    : [timeOf(order.at), order.note?.trim(), order.channelName, memberName(order.by)].filter(Boolean).join(' · ');
  return (
    <ListRow
      icon="receipt-outline"
      title={describeOrder(order.lines)}
      subtitle={subtitle}
      right={money(order.total)}
      struck={voided}
      onPress={dayOpen && !voided ? () => open({ kind: 'order', orderId: order.id }) : undefined}
    />
  );
};

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, padding: 14 },
  cardText: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 16, fontFamily: 'Poppins_700Bold', letterSpacing: -0.2 },
  cardSub: { fontSize: 12.5, fontFamily: 'Poppins_400Regular', marginTop: 1 },
});
