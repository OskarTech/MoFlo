import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import Icon from '../../components/common/Icon';
import BottomSheet, { FilledInput, SheetButton, SheetLabel } from '../../components/common/BottomSheet';
import { useTheme } from '../../hooks/useTheme';
import { successHaptic } from '../../utils/haptics';
import { businessToday, useBusinessStore } from '../store/businessStore';
import { cents, newId, orderedItems, sumOf } from '../logic/basics';
import { entryCashDiff } from '../logic/days';
import { ManualAmount } from '../types';
import { AddLink, AmountBox, FieldRow, useMoney } from '../ui/kit';
import { channelIcon, dayTitle } from '../ui/format';

/**
 * Lo vendido a mano en un día: un día sin caja, o algo que no pasó por ella
 * (un encargo, un evento). Lo de cada forma de cobro y, si hace falta, lo que
 * no es de ninguna, escrito a mano; con arqueo si se usa. Si el día aún no
 * estaba cerrado, guardarlo lo cierra
 */
const EntrySheet = ({
  visible, dayId, entryId, onClose,
}: { visible: boolean; dayId: string; entryId?: string; onClose: () => void }) => {
  const { t, i18n } = useTranslation();
  const { colors: dc, ui } = useTheme();
  const { money } = useMoney();
  const config = useBusinessStore((s) => s.config);
  const day = useBusinessStore((s) => s.days[dayId]);
  const editing = entryId ? day?.entries?.[entryId] : undefined;
  const channels = useMemo(() => orderedItems(config?.channels), [config]);
  const closes = day?.status !== 'closed';

  const [amounts, setAmounts] = useState<Record<string, number | null>>({});
  const [manual, setManual] = useState<ManualAmount[]>([]);
  const [manualName, setManualName] = useState('');
  const [manualAmount, setManualAmount] = useState<number | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [float, setFloat] = useState<number | null>(null);
  const [counted, setCounted] = useState<number | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!visible) return;
    const e = editing;
    setAmounts(Object.fromEntries(channels.map((c) => [c.id, e?.amounts?.[c.id] ?? null])));
    setManual(e?.manual ?? []);
    setManualName('');
    setManualAmount(null);
    setShowManual(false);
    setFloat(e?.float ?? (config?.cashCount ? config.floatAmount : null));
    setCounted(e?.counted ?? null);
    setNote(e?.note ?? '');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- al abrir
  }, [visible, dayId, entryId]);

  const total = cents(
    sumOf(Object.values(amounts), (v) => v ?? 0) + sumOf(manual, (m) => m.amount),
  );
  const cleanAmounts = Object.fromEntries(Object.entries(amounts).filter(([, v]) => (v ?? 0) > 0)) as Record<string, number>;
  const diff = config && counted != null
    ? entryCashDiff({ amounts: cleanAmounts, float: float ?? 0, counted }, config)
    : null;

  const save = async () => {
    if (!config) return;
    await useBusinessStore.getState().saveEntry(dayId, {
      id: editing?.id,
      amounts: cleanAmounts,
      channelNames: Object.fromEntries(Object.keys(cleanAmounts).map((id) => [id, config.channels[id]?.name ?? id])),
      manual: manual.length ? manual : undefined,
      float: config.cashCount && counted != null ? float ?? 0 : null,
      counted: config.cashCount ? counted : null,
      note: note.trim() || undefined,
    });
    successHaptic();
    onClose();
  };

  const remove = () => {
    if (!editing) return;
    Alert.alert(t('business.entry.deleteTitle'), t('business.entry.deleteBody'), [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('business.common.delete'),
        style: 'destructive',
        onPress: async () => {
          await useBusinessStore.getState().deleteEntry(dayId, editing.id);
          onClose();
        },
      },
    ]);
  };

  const todayId = businessToday();
  const title = editing
    ? t('business.entry.editTitle')
    : t('business.entry.newTitle', { day: dayTitle(dayId, t, i18n.language, todayId) });

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={title}
      subtitle={t('business.entry.hint')}
      maxHeight={0.94}
      dismissKeyboardOnTap
      footer={(
        <View>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: dc.textSecondary }]}>{t('business.entry.total')}</Text>
            <Text style={[styles.totalValue, { color: dc.textPrimary }]}>{money(total)}</Text>
          </View>
          <SheetButton
            label={closes && !editing ? t('business.entry.saveAndClose') : t('business.common.save')}
            icon="checkmark"
            disabled={total <= 0 && !editing}
            onPress={save}
          />
        </View>
      )}
    >
      <SheetLabel style={styles.firstLabel}>{t('business.entry.charged')}</SheetLabel>
      {channels.map((c) => (
        <FieldRow
          key={c.id}
          icon={channelIcon(c.kind)}
          title={c.name}
          subtitle={c.commissionPct ? t('business.entry.commission', { pct: c.commissionPct }) : null}
          right={(
            <AmountBox
              value={amounts[c.id] ?? null}
              onChange={(v) => setAmounts((prev) => ({ ...prev, [c.id]: v }))}
              accessibilityLabel={c.name}
            />
          )}
        />
      ))}
      {manual.map((m) => (
        <FieldRow
          key={m.id}
          icon="create-outline"
          title={m.name}
          subtitle={t('business.entry.byHand')}
          right={(
            <View style={styles.manualRight}>
              <Text style={[styles.manualAmount, { color: dc.textPrimary }]}>{money(m.amount)}</Text>
              <TouchableOpacity
                onPress={() => setManual((prev) => prev.filter((x) => x.id !== m.id))}
                hitSlop={8}
                accessibilityLabel={t('business.common.delete')}
              >
                <Icon name="close-circle" size={20} color={dc.textSecondary} />
              </TouchableOpacity>
            </View>
          )}
        />
      ))}
      {showManual ? (
        <View style={styles.manualForm}>
          <FilledInput
            value={manualName}
            onChangeText={setManualName}
            placeholder={t('business.entry.manualPlaceholder')}
            containerStyle={styles.flex}
            maxLength={40}
          />
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
          <FieldRow
            icon="cash-outline"
            title={t('business.entry.float')}
            right={<AmountBox value={float} onChange={setFloat} accessibilityLabel={t('business.entry.float')} />}
          />
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

      <SheetLabel>{t('business.entry.note')}</SheetLabel>
      <FilledInput value={note} onChangeText={setNote} placeholder={t('business.entry.notePlaceholder')} maxLength={140} />
      {editing && <AddLink label={t('business.entry.delete')} onPress={remove} style={styles.gapTop} />}
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  firstLabel: { marginTop: 0 },
  gapTop: { marginTop: 8 },
  flex: { flex: 1 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  totalLabel: { fontSize: 13.5, fontFamily: 'Poppins_600SemiBold' },
  totalValue: { fontSize: 24, fontFamily: 'Poppins_700Bold', letterSpacing: -0.5 },
  manualRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  manualAmount: { fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  manualForm: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  addSmall: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  disabled: { opacity: 0.4 },
  diffBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 14, padding: 12, marginTop: 10 },
  diffLabel: { fontSize: 13.5, fontFamily: 'Poppins_600SemiBold' },
  diffValue: { fontSize: 17, fontFamily: 'Poppins_700Bold' },
});

export default EntrySheet;
