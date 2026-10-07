import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import Icon from '../../components/common/Icon';
import BottomSheet, { FilledInput, SheetButton, SheetLabel } from '../../components/common/BottomSheet';
import { useTheme } from '../../hooks/useTheme';
import { successHaptic, warningHaptic } from '../../utils/haptics';
import { useBusinessStore } from '../store/businessStore';
import { cents, newId, orderedItems, sumOf } from '../logic/basics';
import { entryCashDiff } from '../logic/days';
import { summarizeOrders } from '../logic/orders';
import { ManualAmount } from '../types';
import { AddLink, AmountBox, Chip, ChipRow, FieldRow, Note, StatTiles, useMoney } from '../ui/kit';
import { channelIcon } from '../ui/format';

/**
 * Cerrar un día de pedidos. Se rellena con lo que dicen los pedidos; se
 * cambia lo que haga falta (lo de Glovo, escrito a mano), se cuenta el cajón
 * y se cierra. Al cerrar, la app vuelve a bajar del servidor los pedidos del
 * día: lo que se cambie a mano aquí se suma a lo que digan ellos.
 */
const CloseDaySheet = ({ visible, dayId, onClose }: { visible: boolean; dayId: string; onClose: () => void }) => {
  const { t } = useTranslation();
  const { colors: dc, ui } = useTheme();
  const { money } = useMoney();
  const config = useBusinessStore((s) => s.config);
  const allOrders = useBusinessStore((s) => s.orders);
  const day = useBusinessStore((s) => s.days[dayId]);

  const channels = useMemo(() => orderedItems(config?.channels), [config]);
  const workers = useMemo(() => orderedItems(config?.workers), [config]);
  const dayOrders = useMemo(() => Object.values(allOrders).filter((o) => o.day === dayId), [allOrders, dayId]);
  const summary = useMemo(() => summarizeOrders(dayOrders), [dayOrders]);

  const [amounts, setAmounts] = useState<Record<string, number | null>>({});
  const [manual, setManual] = useState<ManualAmount[]>([]);
  const [manualName, setManualName] = useState('');
  const [manualAmount, setManualAmount] = useState<number | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [float, setFloat] = useState<number | null>(null);
  const [counted, setCounted] = useState<number | null>(null);
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (!visible) return;
    // Si se reabrió, lo que se puso a mano en el cierre anterior
    const previous = day?.entries?.close;
    // Lo de los pedidos; en las formas de cobro sin pedidos (Glovo, a mano), lo del cierre anterior
    setAmounts(Object.fromEntries(channels.map((c) => {
      const fromOrders = summary.byChannel[c.id] ?? 0;
      return [c.id, fromOrders > 0 ? fromOrders : (previous?.amounts?.[c.id] ?? null)];
    })));
    setManual(previous?.manual ?? []);
    setManualName('');
    setManualAmount(null);
    setShowManual(false);
    setFloat(previous?.float ?? (config?.cashCount ? config.floatAmount : null));
    setCounted(previous?.counted ?? null);
    setWorkerId(previous?.workerId ?? null);
    setNote(previous?.note ?? '');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- al abrir
  }, [visible, dayId]);

  const cleanAmounts = Object.fromEntries(Object.entries(amounts).filter(([, v]) => (v ?? 0) > 0)) as Record<string, number>;
  const total = cents(sumOf(Object.values(cleanAmounts), (v) => v) + sumOf(manual, (m) => m.amount));
  const diff = config && counted != null ? entryCashDiff({ amounts: cleanAmounts, float: float ?? 0, counted }, config) : null;
  const units = Object.values(summary.items).reduce((n, i) => n + i.qty, 0);

  const close = async () => {
    if (!config || closing) return;
    setClosing(true);
    try {
      const adjust: Record<string, number> = {};
      for (const c of channels) {
        const delta = cents((amounts[c.id] ?? 0) - (summary.byChannel[c.id] ?? 0));
        if (delta !== 0) adjust[c.id] = delta;
      }
      const result = await useBusinessStore.getState().closeDay(dayId, {
        adjust,
        manual,
        float: config.cashCount && counted != null ? float ?? 0 : null,
        counted: config.cashCount ? counted : null,
        workerId,
        workerName: workerId ? config.workers[workerId]?.name ?? null : null,
        note,
      });
      if (result === 'offline') {
        warningHaptic();
        Alert.alert(t('business.close.offlineTitle'), t('business.close.offlineBody'));
        return;
      }
      if (result === 'error') {
        warningHaptic();
        Alert.alert(t('common.error'), t('business.close.error'));
        return;
      }
      successHaptic();
      onClose();
    } finally {
      setClosing(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('business.close.title')}
      maxHeight={0.94}
      dismissKeyboardOnTap
      footer={(
        <View>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: dc.textSecondary }]}>{t('business.close.sold')}</Text>
            <Text style={[styles.totalValue, { color: dc.textPrimary }]}>{money(total)}</Text>
          </View>
          <SheetButton label={t('business.close.button')} icon="lock-closed" loading={closing} onPress={close} />
          <Text style={[styles.footNote, { color: dc.textSecondary }]}>{t('business.close.footNote')}</Text>
        </View>
      )}
    >
      <Note text={t('business.close.prefilled', { count: summary.count })} />

      <SheetLabel>{t('business.close.charged')}</SheetLabel>
      {channels.map((c) => {
        const fromOrders = summary.byChannel[c.id] ?? 0;
        const value = amounts[c.id] ?? 0;
        const sub = fromOrders > 0
          ? (Math.abs(value - fromOrders) < 0.005
            ? t('business.close.fromOrders')
            : t('business.close.ordersSaid', { amount: money(fromOrders) }))
          : t('business.close.byHand');
        return (
          <FieldRow
            key={c.id}
            icon={channelIcon(c.kind)}
            title={c.name}
            subtitle={c.commissionPct ? `${sub} · ${t('business.entry.commission', { pct: c.commissionPct })}` : sub}
            right={(
              <AmountBox value={amounts[c.id] ?? null} onChange={(v) => setAmounts((prev) => ({ ...prev, [c.id]: v }))} accessibilityLabel={c.name} />
            )}
          />
        );
      })}
      {manual.map((m) => (
        <FieldRow
          key={m.id}
          icon="create-outline"
          title={m.name}
          subtitle={t('business.entry.byHand')}
          right={(
            <View style={styles.manualRight}>
              <Text style={[styles.manualAmount, { color: dc.textPrimary }]}>{money(m.amount)}</Text>
              <TouchableOpacity onPress={() => setManual((prev) => prev.filter((x) => x.id !== m.id))} hitSlop={8} accessibilityLabel={t('business.common.delete')}>
                <Icon name="close-circle" size={20} color={dc.textSecondary} />
              </TouchableOpacity>
            </View>
          )}
        />
      ))}
      {showManual ? (
        <View style={styles.manualForm}>
          <FilledInput value={manualName} onChangeText={setManualName} placeholder={t('business.entry.manualPlaceholder')} containerStyle={styles.flex} maxLength={40} />
          <AmountBox value={manualAmount} onChange={setManualAmount} width={96} accessibilityLabel={t('business.entry.amount')} />
          <TouchableOpacity
            style={[styles.addSmall, { backgroundColor: dc.primary }, !(manualName.trim() && manualAmount) && styles.disabled]}
            disabled={!(manualName.trim() && manualAmount)}
            onPress={() => {
              setManual((prev) => [...prev, { id: newId('m'), name: manualName.trim(), amount: cents(manualAmount ?? 0) }]);
              setManualName('');
              setManualAmount(null);
              setShowManual(false);
            }}
            accessibilityRole="button"
            accessibilityLabel={t('common.add')}
          >
            <Icon name="add" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      ) : (
        <AddLink label={t('business.entry.addManual')} onPress={() => setShowManual(true)} />
      )}

      {config?.cashCount && (
        <>
          <SheetLabel>{t('business.entry.cashCount')}</SheetLabel>
          <FieldRow icon="cash-outline" title={t('business.entry.float')} right={<AmountBox value={float} onChange={setFloat} accessibilityLabel={t('business.entry.float')} />} />
          <FieldRow
            icon="cash-outline"
            title={t('business.entry.counted')}
            subtitle={t('business.entry.countedHint')}
            right={<AmountBox value={counted} onChange={setCounted} accessibilityLabel={t('business.entry.counted')} />}
          />
          {diff != null && (
            <View style={[styles.diffBox, { backgroundColor: ui.field }]}>
              <Text style={[styles.diffLabel, { color: dc.textSecondary }]}>{t('business.entry.diff')}</Text>
              <Text style={[styles.diffValue, { color: Math.abs(diff) < 0.01 ? ui.incomeText : ui.expenseText }]}>
                {Math.abs(diff) < 0.01 ? t('business.entry.balanced') : money(diff)}
              </Text>
            </View>
          )}
        </>
      )}

      <SheetLabel>{t('business.close.soldToday')}</SheetLabel>
      <StatTiles
        items={[
          { value: String(summary.count), label: t('business.close.orders', { count: summary.count }) },
          { value: String(units), label: t('business.close.units', { count: units }) },
          { value: String(summary.voided), label: t('business.close.voided', { count: summary.voided }) },
        ]}
      />

      {workers.length > 0 && (
        <>
          <SheetLabel>{t('business.entry.whoCloses')}</SheetLabel>
          <ChipRow>
            {workers.map((w) => (
              <Chip key={w.id} label={w.name} selected={w.id === workerId} onPress={() => setWorkerId(w.id === workerId ? null : w.id)} />
            ))}
          </ChipRow>
        </>
      )}
      <SheetLabel>{t('business.entry.note')}</SheetLabel>
      <FilledInput value={note} onChangeText={setNote} placeholder={t('business.entry.notePlaceholder')} maxLength={140} />
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  totalLabel: { fontSize: 13.5, fontFamily: 'Poppins_600SemiBold' },
  totalValue: { fontSize: 24, fontFamily: 'Poppins_700Bold', letterSpacing: -0.5 },
  footNote: { fontSize: 11.5, fontFamily: 'Poppins_400Regular', textAlign: 'center', marginTop: 8 },
  manualRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  manualAmount: { fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  manualForm: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  addSmall: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  disabled: { opacity: 0.4 },
  diffBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 14, padding: 12, marginTop: 10 },
  diffLabel: { fontSize: 13.5, fontFamily: 'Poppins_600SemiBold' },
  diffValue: { fontSize: 17, fontFamily: 'Poppins_700Bold' },
});

export default CloseDaySheet;
