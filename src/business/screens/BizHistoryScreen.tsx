import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { TFunction } from 'i18next';
import { HeroScrollScreen } from '../../components/layout/HeroScreen';
import { HeroTitleBar } from '../../components/layout/HeroBar';
import { reportError } from '../../services/crashReporting';
import { useBusinessStore } from '../store/businessStore';
import { entryTotal } from '../logic/days';
import { describeOrder } from '../logic/orders';
import { BusinessChange, DayEntry, OrderLine } from '../types';
import { EmptyNote, ListRow, Note, PillButton, useMoney } from '../ui/kit';
import { dayTitle, longDay, timeOf } from '../ui/format';

const ICONS: Record<string, string> = {
  void: 'close-circle-outline', edit: 'create-outline', delete: 'trash-outline', reopen: 'lock-open', close: 'lock-closed',
};

/**
 * El historial de cambios: quién anuló un pedido, cambió un cierre o un
 * gasto, o reabrió un día, cuándo, y qué había antes. Solo se añade: nada
 * desaparece sin dejar rastro
 */
const BizHistoryScreen = () => {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const { money } = useMoney();
  const [items, setItems] = useState<BusinessChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(true);

  const load = useCallback(async (next: boolean) => {
    setLoading(true);
    try {
      const list = await useBusinessStore.getState().fetchChanges(next);
      setItems((prev) => (next ? [...prev, ...list] : list));
      setMore(list.length === 30);
    } catch (e) {
      reportError(e, 'empresa: historial');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  const describe = (c: BusinessChange, tt: TFunction) => {
    const name = c.byName || tt('sharedAccount.someone');
    const before = (c.before ?? {}) as Record<string, unknown>;
    const day = c.day ? dayTitle(c.day, tt, i18n.language) : null;
    switch (`${c.kind}.${c.action}`) {
      case 'order.void':
        return {
          title: tt('business.history.orderVoid', { name }),
          detail: [money(Number(before.total ?? 0)), describeOrder((before.lines as OrderLine[]) ?? [])].join(' · '),
        };
      case 'order.edit':
        return {
          title: tt('business.history.orderEdit', { name }),
          detail: tt('business.history.before', {
            what: [money(Number(before.total ?? 0)), describeOrder((before.lines as OrderLine[]) ?? [])].join(' · '),
          }),
        };
      case 'entry.edit':
      case 'entry.delete':
        return {
          title: tt(c.action === 'edit' ? 'business.history.entryEdit' : 'business.history.entryDelete', { name }),
          detail: [day, tt('business.history.before', { what: money(entryTotal(before as unknown as DayEntry)) })].filter(Boolean).join(' · '),
        };
      case 'day.reopen':
        return { title: tt('business.history.dayReopen', { name }), detail: c.day ? longDay(c.day, i18n.language) : '' };
      case 'expense.edit':
      case 'expense.delete':
        return {
          title: tt(c.action === 'edit' ? 'business.history.expenseEdit' : 'business.history.expenseDelete', { name }),
          detail: tt('business.history.before', {
            what: [String(before.name || before.supplierName || before.typeName || ''), money(Number(before.amount ?? 0))].filter(Boolean).join(' · '),
          }),
        };
      case 'recurring.edit':
      case 'recurring.delete':
        return {
          title: tt(c.action === 'edit' ? 'business.history.recurringEdit' : 'business.history.recurringDelete', { name }),
          detail: tt('business.history.before', { what: `${String(before.name ?? '')} · ${money(Number(before.amount ?? 0))}` }),
        };
      default:
        return { title: name, detail: '' };
    }
  };

  return (
    <HeroScrollScreen hero={<HeroTitleBar title={t('business.history.title')} onBack={() => navigation.goBack()} />}>
      <View style={styles.pad}>
        <Note text={t('business.history.intro')} />
        <View style={styles.list}>
          {!loading && items.length === 0 ? (
            <EmptyNote text={t('business.history.empty')} />
          ) : items.map((c) => {
            const { title, detail } = describe(c, t);
            const when = `${dayTitle(toLocalDay(c.at), t, i18n.language)} · ${timeOf(c.at)}`;
            return (
              <ListRow
                key={c.id}
                icon={(ICONS[c.action] ?? 'time-outline') as never}
                title={title}
                subtitle={[detail, when].filter(Boolean).join(' · ')}
              />
            );
          })}
        </View>
        {loading ? <EmptyNote text={t('business.loading')} /> : more && items.length > 0 && (
          <PillButton label={t('business.history.more')} tone="soft" onPress={() => load(true)} style={styles.more} />
        )}
      </View>
    </HeroScrollScreen>
  );
};

// El día (en la hora del móvil) de un momento guardado como ISO
const toLocalDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 20 },
  list: { marginTop: 12 },
  more: { alignSelf: 'center', marginTop: 10 },
});

export default BizHistoryScreen;
