import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Alert, TouchableOpacity, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import BottomSheet, { FilledInput, SheetButton, SheetLabel } from '../../components/common/BottomSheet';
import AmountInput from '../../components/common/AmountInput';
import { DayPicker } from '../../components/movements/SheetPickers';
import { useTheme } from '../../hooks/useTheme';
import { successHaptic, warningHaptic } from '../../utils/haptics';
import { useBusinessStore } from '../store/businessStore';
import { orderedItems } from '../logic/basics';
import { recurringTypesByUse } from '../logic/usage';
import { AddLink, Chip, ChipRow, FieldRow, SettingsSwitch, useMoney } from '../ui/kit';
import { TypeOption, TypePicker } from '../ui/TypePicker';
import { BaseCaption, openedVat, VatRow, vatFigures } from '../ui/VatFields';

/**
 * Un fijo: alquiler, luz, gestoría, la nómina de cada empleado… Cada mes, el
 * día que toca, se convierte en un gasto (que luego se puede cambiar, si ese
 * mes la luz ha sido otra cosa). Los tipos, el más usado en los fijos primero.
 */
const RecurringSheet = ({ visible, recurringId, onClose }: { visible: boolean; recurringId?: string; onClose: () => void }) => {
  const { t } = useTranslation();
  const { colors: dc } = useTheme();
  const { symbol } = useMoney();
  const config = useBusinessStore((s) => s.config);
  const editing = useBusinessStore((s) => (recurringId ? s.recurring[recurringId] : undefined));
  const types = useMemo(() => orderedItems(config?.expenseTypes), [config]);
  const suppliers = useMemo(() => orderedItems(config?.suppliers), [config]);
  const workers = useMemo(() => orderedItems(config?.workers), [config]);
  const amountRef = useRef<TextInput>(null);

  const [amountText, setAmountText] = useState('');
  const [vatValue, setVatValue] = useState<number | null>(null);
  const [name, setName] = useState('');
  // El orden de los tipos se fija al abrir: no se mueven con la ventana abierta
  const [typeOrder, setTypeOrder] = useState<string[]>([]);
  const [typeId, setTypeId] = useState('');
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [day, setDay] = useState(1);
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!visible) return;
    const opened = openedVat(config, editing);
    setAmountText(opened.amountText);
    setVatValue(opened.vat);
    setName(editing?.name ?? '');
    const sorted = recurringTypesByUse(types, Object.values(useBusinessStore.getState().recurring));
    setTypeOrder(sorted.map((x) => x.id));
    setTypeId(editing?.typeId ?? sorted[0]?.id ?? '');
    setSupplierId(editing?.supplierId ?? null);
    setWorkerId(editing?.workerId ?? null);
    setDay(editing?.day ?? 1);
    setActive(editing?.active ?? true);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- al abrir
  }, [visible, recurringId]);

  const figures = vatFigures(config, typeId, amountText, vatValue, editing);
  const isPayroll = typeId === 'payroll';
  const worker = workerId ? config?.workers[workerId] : undefined;
  const supplier = supplierId ? config?.suppliers[supplierId] : undefined;
  // Sin concepto, el del empleado o el proveedor
  const finalName = name.trim()
    || (isPayroll && worker ? t('business.recurring.payrollOf', { name: worker.name }) : '')
    || supplier?.name
    || '';
  const valid = Number.isFinite(figures.typed) && figures.typed > 0 && !!typeId && !!finalName;

  // Los tipos en el orden de uso. El del fijo, si ya no está en la lista
  // (archivado), delante y atenuado, para que se vea cuál tiene
  const typeOptions = useMemo((): TypeOption[] => {
    const rank = new Map(typeOrder.map((id, i) => [id, i]));
    const list: TypeOption[] = [...types].sort((a, b) => (rank.get(a.id) ?? types.length) - (rank.get(b.id) ?? types.length));
    if (editing && !types.some((x) => x.id === editing.typeId)) {
      const own = config?.expenseTypes[editing.typeId];
      list.unshift({ id: editing.typeId, name: own?.name ?? editing.typeName, icon: own?.icon ?? 'pricetag', archived: true });
    }
    return list;
  }, [types, typeOrder, editing, config]);

  const save = async () => {
    if (!valid || !config) return;
    await useBusinessStore.getState().saveRecurring({
      id: editing?.id,
      name: finalName,
      amount: figures.amount,
      vat: figures.vat,
      typeId,
      typeName: config.expenseTypes[typeId]?.name ?? typeId,
      supplierId: !isPayroll && supplier ? supplierId : null,
      supplierName: !isPayroll ? supplier?.name ?? null : null,
      workerId: isPayroll && worker ? workerId : null,
      workerName: isPayroll ? worker?.name ?? null : null,
      day,
      active,
      skipped: editing?.skipped,
    });
    successHaptic();
    onClose();
  };

  const remove = () => {
    if (!editing) return;
    Alert.alert(t('business.recurring.deleteTitle'), t('business.recurring.deleteBody'), [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('business.common.delete'),
        style: 'destructive',
        onPress: async () => {
          warningHaptic();
          await useBusinessStore.getState().deleteRecurring(editing.id);
          onClose();
        },
      },
    ]);
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={editing ? t('business.recurring.editTitle') : t('business.recurring.newTitle')}
      subtitle={t('business.recurring.hint')}
      maxHeight={0.94}
      dismissKeyboardOnTap
      footer={<SheetButton label={t('business.common.save')} icon="checkmark" disabled={!valid} onPress={save} />}
    >
      <TouchableOpacity activeOpacity={1} onPress={() => amountRef.current?.focus()}>
        <AmountInput ref={amountRef} value={amountText} onChangeText={setAmountText} currencySymbol={symbol} large color={dc.textPrimary} />
        {figures.split && <BaseCaption />}
      </TouchableOpacity>
      {figures.split && <VatRow figures={figures} value={vatValue} onChange={setVatValue} />}

      <SheetLabel>{t('business.expense.type')}</SheetLabel>
      <TypePicker types={typeOptions} selectedId={typeId} onSelect={setTypeId} resetKey={visible} />

      {isPayroll ? (
        workers.length > 0 && (
          <>
            <SheetLabel>{t('business.expense.worker')}</SheetLabel>
            <ChipRow>
              {workers.map((w) => (
                <Chip key={w.id} label={w.name} selected={w.id === workerId} onPress={() => setWorkerId(w.id === workerId ? null : w.id)} />
              ))}
            </ChipRow>
          </>
        )
      ) : suppliers.length > 0 && (
        <>
          <SheetLabel>{t('business.expense.supplier')}</SheetLabel>
          <ChipRow>
            {suppliers.map((sup) => (
              <Chip key={sup.id} label={sup.name} selected={sup.id === supplierId} onPress={() => setSupplierId(sup.id === supplierId ? null : sup.id)} />
            ))}
          </ChipRow>
        </>
      )}

      <SheetLabel>{t('business.recurring.name')}</SheetLabel>
      <FilledInput value={name} onChangeText={setName} placeholder={finalName || t('business.recurring.namePlaceholder')} maxLength={50} />

      <SheetLabel>{t('business.recurring.day')}</SheetLabel>
      <DayPicker value={day} onChange={setDay} resetKey={visible} />

      {editing && (
        <>
          <FieldRow
            title={t('business.recurring.active')}
            subtitle={t('business.recurring.activeHint')}
            right={<SettingsSwitch value={active} onChange={setActive} label={t('business.recurring.active')} />}
            style={styles.gapTop}
          />
          <AddLink label={t('business.recurring.delete')} onPress={remove} style={styles.gapTop} />
        </>
      )}
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  gapTop: { marginTop: 10 },
});

export default RecurringSheet;
