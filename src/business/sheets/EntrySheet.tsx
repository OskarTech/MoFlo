import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import Icon from '../../components/common/Icon';
import BottomSheet, { FilledInput, SheetButton, SheetLabel } from '../../components/common/BottomSheet';
import { useTheme } from '../../hooks/useTheme';
import { successHaptic, warningHaptic } from '../../utils/haptics';
import { businessToday, useBusinessStore } from '../store/businessStore';
import { cents, newId, orderedItems, sumOf } from '../logic/basics';
import { entryCashDiff, sectionsTotal, usesTills } from '../logic/days';
import { ManualAmount } from '../types';
import { AddLink, AmountBox, Chip, ChipRow, FieldRow, useMoney } from '../ui/kit';
import { channelIcon, dayTitle } from '../ui/format';

/**
 * Lo cobrado en una caja, un turno o el día entero (Sencillo y por caja): lo
 * de cada forma de cobro, sumado fuera (con la calculadora o el ticket Z) y,
 * si se usan, los tickets, las secciones y el arqueo. Todo se puede escribir a
 * mano, también lo que no es de ninguna forma de cobro.
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
  const workers = useMemo(() => orderedItems(config?.workers), [config]);
  const tills = useMemo(() => orderedItems(config?.tills), [config]);
  const shifts = useMemo(() => orderedItems(config?.shifts), [config]);
  const sections = useMemo(() => orderedItems(config?.sections), [config]);
  const expert = usesTills(config);
  const simpleOneShot = !expert && shifts.length === 0;

  const [amounts, setAmounts] = useState<Record<string, number | null>>({});
  const [manual, setManual] = useState<ManualAmount[]>([]);
  const [manualName, setManualName] = useState('');
  const [manualAmount, setManualAmount] = useState<number | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [otherWorker, setOtherWorker] = useState('');
  const [showOther, setShowOther] = useState(false);
  const [tillId, setTillId] = useState<string | null>(null);
  const [shiftId, setShiftId] = useState<string | null>(null);
  const [tickets, setTickets] = useState<number | null>(null);
  const [sectionAmounts, setSectionAmounts] = useState<Record<string, number | null>>({});
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
    const knownWorker = e?.workerId && config?.workers?.[e.workerId] ? e.workerId : null;
    setWorkerId(knownWorker);
    setOtherWorker(!knownWorker && e?.workerName ? e.workerName : '');
    setShowOther(!knownWorker && !!e?.workerName);
    setTillId(e?.tillId ?? (tills.length === 1 ? tills[0].id : null));
    setShiftId(e?.shiftId ?? null);
    setTickets(e?.tickets ?? null);
    setSectionAmounts(Object.fromEntries(sections.map((s) => [s.id, e?.sections?.[s.id] ?? null])));
    setFloat(e?.float ?? (config?.cashCount ? config.floatAmount : null));
    setCounted(e?.counted ?? null);
    setNote(e?.note ?? '');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- al abrir
  }, [visible, dayId, entryId]);

  const total = cents(
    sumOf(Object.values(amounts), (v) => v ?? 0) + sumOf(manual, (m) => m.amount),
  );
  const sectionsSum = sectionsTotal({ sections: Object.fromEntries(Object.entries(sectionAmounts).map(([k, v]) => [k, v ?? 0])) });
  const cleanAmounts = Object.fromEntries(Object.entries(amounts).filter(([, v]) => (v ?? 0) > 0)) as Record<string, number>;
  const diff = config && counted != null
    ? entryCashDiff({ amounts: cleanAmounts, float: float ?? 0, counted }, config)
    : null;

  const save = async () => {
    if (!config) return;
    const workerName = workerId ? config.workers[workerId]?.name : otherWorker.trim() || null;
    const result = await useBusinessStore.getState().saveEntry(dayId, {
      id: editing?.id,
      workerId: workerId ?? null,
      workerName,
      tillId: tillId ?? null,
      tillName: tillId ? config.tills[tillId]?.name ?? null : null,
      shiftId: shiftId ?? null,
      shiftName: shiftId ? config.shifts[shiftId]?.name ?? null : null,
      amounts: cleanAmounts,
      channelNames: Object.fromEntries(Object.keys(cleanAmounts).map((id) => [id, config.channels[id]?.name ?? id])),
      manual: manual.length ? manual : undefined,
      tickets: expert && tickets != null ? tickets : null,
      sections: expert && sections.length
        ? Object.fromEntries(Object.entries(sectionAmounts).filter(([, v]) => (v ?? 0) > 0)) as Record<string, number>
        : undefined,
      sectionNames: expert && sections.length
        ? Object.fromEntries(sections.map((s) => [s.id, s.name]))
        : undefined,
      float: config.cashCount && counted != null ? float ?? 0 : null,
      counted: config.cashCount ? counted : null,
      note: note.trim() || undefined,
    });
    if (result === 'dayClosed') {
      warningHaptic();
      Alert.alert(t('business.day.closedTitle'), t('business.day.closedBody'));
      return;
    }
    // En Sencillo, sin turnos, guardar es cerrar el día
    if (simpleOneShot) await useBusinessStore.getState().closeDay(dayId);
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
  const title = simpleOneShot
    ? (dayId === todayId
      ? t('business.entry.closeToday')
      : t('business.entry.closeOf', { day: dayTitle(dayId, t, i18n.language, todayId) }))
    : editing ? t('business.entry.editTitle') : t('business.entry.newTitle');

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={title}
      subtitle={simpleOneShot ? t('business.entry.simpleHint') : expert ? t('business.entry.tillHint') : undefined}
      maxHeight={0.94}
      dismissKeyboardOnTap
      footer={(
        <View>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: dc.textSecondary }]}>{t('business.entry.total')}</Text>
            <Text style={[styles.totalValue, { color: dc.textPrimary }]}>{money(total)}</Text>
          </View>
          <SheetButton
            label={simpleOneShot ? t('business.entry.saveAndClose') : t('business.common.save')}
            icon="checkmark"
            disabled={total <= 0 && !editing}
            onPress={save}
          />
        </View>
      )}
    >
      {(workers.length > 0 || showOther) && (
        <>
          <SheetLabel style={styles.firstLabel}>{expert ? t('business.entry.who') : t('business.entry.whoCloses')}</SheetLabel>
          <ChipRow>
            {workers.map((w) => (
              <Chip key={w.id} label={w.name} selected={w.id === workerId} onPress={() => { setWorkerId(w.id === workerId ? null : w.id); setShowOther(false); }} />
            ))}
            <Chip label={t('business.entry.otherPerson')} icon="add" selected={showOther} onPress={() => { setShowOther(!showOther); setWorkerId(null); }} />
          </ChipRow>
          {showOther && (
            <FilledInput
              value={otherWorker}
              onChangeText={setOtherWorker}
              placeholder={t('business.entry.otherPersonPlaceholder')}
              containerStyle={styles.gapTop}
              maxLength={40}
            />
          )}
        </>
      )}
      {workers.length === 0 && !showOther && (
        <AddLink label={t('business.entry.addWho')} onPress={() => setShowOther(true)} />
      )}

      {expert && tills.length > 0 && (
        <>
          <SheetLabel>{t('business.entry.till')}</SheetLabel>
          <ChipRow>
            {tills.map((c) => (
              <Chip key={c.id} label={c.name} selected={c.id === tillId} onPress={() => setTillId(c.id === tillId ? null : c.id)} />
            ))}
          </ChipRow>
        </>
      )}
      {shifts.length > 0 && (
        <>
          <SheetLabel>{t('business.entry.shift')}</SheetLabel>
          <ChipRow>
            {shifts.map((s) => (
              <Chip key={s.id} label={s.name} selected={s.id === shiftId} onPress={() => setShiftId(s.id === shiftId ? null : s.id)} />
            ))}
          </ChipRow>
        </>
      )}

      <SheetLabel>{expert ? t('business.entry.chargedZ') : t('business.entry.charged')}</SheetLabel>
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

      {expert && (
        <>
          <SheetLabel>{t('business.entry.tickets')}</SheetLabel>
          <FieldRow
            icon="receipt-outline"
            title={t('business.entry.ticketCount')}
            subtitle={tickets && total > 0 ? t('business.entry.avgTicket', { amount: money(total / tickets) }) : null}
            right={<AmountBox value={tickets} onChange={setTickets} integer accessibilityLabel={t('business.entry.ticketCount')} />}
          />
        </>
      )}

      {expert && sections.length > 0 && (
        <>
          <SheetLabel>{t('business.entry.sections')}</SheetLabel>
          {sections.map((s) => (
            <FieldRow
              key={s.id}
              title={s.name}
              right={(
                <AmountBox
                  value={sectionAmounts[s.id] ?? null}
                  onChange={(v) => setSectionAmounts((prev) => ({ ...prev, [s.id]: v }))}
                  accessibilityLabel={s.name}
                />
              )}
            />
          ))}
          {sectionsSum > 0 && (
            <Text style={[styles.hint, { color: Math.abs(sectionsSum - total) < 0.01 ? ui.incomeText : dc.textSecondary }]}>
              {Math.abs(sectionsSum - total) < 0.01
                ? t('business.entry.sectionsMatch', { amount: money(sectionsSum) })
                : t('business.entry.sectionsDiff', { amount: money(sectionsSum), diff: money(Math.abs(total - sectionsSum)) })}
            </Text>
          )}
        </>
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
  hint: { fontSize: 12.5, fontFamily: 'Poppins_500Medium', marginTop: 8 },
  diffBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 14, padding: 12, marginTop: 10 },
  diffLabel: { fontSize: 13.5, fontFamily: 'Poppins_600SemiBold' },
  diffValue: { fontSize: 17, fontFamily: 'Poppins_700Bold' },
});

export default EntrySheet;
