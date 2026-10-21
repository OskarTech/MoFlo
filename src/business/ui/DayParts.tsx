import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useTheme } from '../../hooks/useTheme';
import { useBusinessStore } from '../store/businessStore';
import { useBizUiStore } from '../store/uiStore';
import { entryCashDiff, entryTotal, isPosEntry } from '../logic/days';
import { BusinessDay, DayEntry, POS_ACTOR } from '../types';
import { ListRow, PillButton, useMoney } from './kit';
import { channelIcon, timeOf } from './format';

/** Las piezas de un día que se ven en Hoy y en el detalle del día */

/** El nombre de quien firma algo: un socio o la caja */
export const actorName = (uid: string | null | undefined, t: TFunction): string => {
  if (uid === POS_ACTOR) return t('business.pos.who');
  const business = useBusinessStore.getState().business;
  return (uid && business?.memberNames?.[uid]) || t('sharedAccount.someone');
};

/**
 * Cómo va el día: cerrado por la caja (o a mano, por un socio), o aún sin
 * nada, esperando a la caja. Siempre se puede apuntar algo a mano
 */
export const DayStatusCard = ({
  dayId, day, isToday,
}: {
  dayId: string;
  day: BusinessDay | undefined;
  /** Hoy, la caja aún no ha cerrado: se la espera */
  isToday: boolean;
}) => {
  const { t } = useTranslation();
  const { colors: dc, ui } = useTheme();
  const open = useBizUiStore((s) => s.open);
  const hasData = Object.keys(day?.entries ?? {}).length > 0;

  let title: string;
  let subtitle: string;
  if (hasData && day?.status === 'closed') {
    title = t('business.day.closed');
    subtitle = day.closedAt
      ? (day.closedBy === POS_ACTOR
        ? t('business.pos.closedAt', { time: timeOf(day.closedAt) })
        : t('business.day.closedBy', { name: actorName(day.closedBy, t), time: timeOf(day.closedAt) }))
      : '';
  } else if (hasData) {
    title = t('business.day.openShort');
    subtitle = '';
  } else if (isToday) {
    title = t('business.pos.waiting');
    subtitle = t('business.pos.waitingHint');
  } else {
    title = t('business.pos.missing');
    subtitle = t('business.pos.missingHint');
  }

  return (
    <View style={[styles.card, { backgroundColor: ui.field }]}>
      <View style={styles.cardText}>
        <Text style={[styles.cardTitle, { color: dc.textPrimary }]} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={[styles.cardSub, { color: dc.textSecondary }]} numberOfLines={3}>{subtitle}</Text> : null}
      </View>
      <PillButton
        label={t('business.day.addManual')}
        icon="add"
        tone={hasData ? 'soft' : undefined}
        onPress={() => open({ kind: 'entry', dayId })}
      />
    </View>
  );
};

/**
 * Lo de la caja o lo apuntado a mano. Lo de la caja no se toca: el siguiente
 * cierre que mande lo reemplazaría
 */
export const EntryRow = ({ entry, dayId }: { entry: DayEntry; dayId: string }) => {
  const { t } = useTranslation();
  const { money } = useMoney();
  const config = useBusinessStore((s) => s.config);
  const open = useBizUiStore((s) => s.open);
  const pos = isPosEntry(entry);
  const parts: string[] = [];
  if (!pos) parts.push(actorName(entry.by, t));
  parts.push(timeOf(entry.at));
  if (entry.tickets) parts.push(t('business.day.tickets', { count: entry.tickets }));
  const diff = config ? entryCashDiff(entry, config) : null;
  if (diff != null) parts.push(Math.abs(diff) < 0.01 ? t('business.entry.balanced') : `${t('business.entry.diff')} ${money(diff)}`);
  if (entry.note?.trim()) parts.push(entry.note.trim());
  const firstChannel = Object.keys(entry.amounts ?? {})[0];
  return (
    <ListRow
      icon={pos ? 'receipt' : channelIcon(firstChannel ? config?.channels?.[firstChannel]?.kind : 'cash')}
      title={pos ? t('business.pos.entryTitle') : t('business.day.manualEntry')}
      subtitle={parts.join(' · ')}
      right={money(entryTotal(entry))}
      onPress={pos ? undefined : () => open({ kind: 'entry', dayId, entryId: entry.id })}
    />
  );
};

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, padding: 14 },
  cardText: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 16, fontFamily: 'Poppins_700Bold', letterSpacing: -0.2 },
  cardSub: { fontSize: 12.5, fontFamily: 'Poppins_400Regular', marginTop: 1 },
});
