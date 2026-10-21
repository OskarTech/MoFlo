import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Alert, Platform, TouchableOpacity, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import DateTimePicker from '@react-native-community/datetimepicker';
import Icon from '../../components/common/Icon';
import BottomSheet, { FilledInput, SheetButton, SheetLabel } from '../../components/common/BottomSheet';
import AmountInput from '../../components/common/AmountInput';
import { useTheme } from '../../hooks/useTheme';
import { successHaptic, warningHaptic } from '../../utils/haptics';
import { businessToday, useBusinessStore } from '../store/businessStore';
import { dateOfDayId, dayIdOfDate, nextOrder, orderedItems, shiftDayId } from '../logic/basics';
import { expenseTypesByUse } from '../logic/usage';
import { AddLink, Chip, ChipRow, useMoney } from '../ui/kit';
import { TypeOption, TypePicker } from '../ui/TypePicker';
import { BaseCaption, openedVat, VatRow, vatFigures } from '../ui/VatFields';
import { dayTitle } from '../ui/format';

/**
 * Un gasto: el importe, el tipo (proveedores, alquiler…), de quién es la
 * factura si es de un proveedor, para quién si es una nómina, y el día. Un
 * proveedor nuevo se escribe aquí mismo y se guarda para la próxima. Los
 * tipos van como las categorías en la app: el más usado, el primero.
 */
const ExpenseSheet = ({
  visible, expenseId, date, onClose,
}: { visible: boolean; expenseId?: string; date?: string; onClose: () => void }) => {
  const { t, i18n } = useTranslation();
  const { colors: dc, isDark } = useTheme();
  const { symbol } = useMoney();
  const config = useBusinessStore((s) => s.config);
  const editing = useBusinessStore((s) => (expenseId ? s.expenses[expenseId] : undefined));
  const types = useMemo(() => orderedItems(config?.expenseTypes), [config]);
  const suppliers = useMemo(() => orderedItems(config?.suppliers), [config]);
  const workers = useMemo(() => orderedItems(config?.workers), [config]);
  const amountRef = useRef<TextInput>(null);

  const [amountText, setAmountText] = useState('');
  const [vatValue, setVatValue] = useState<number | null>(null);
  // El orden de los tipos se fija al abrir: no se mueven con la ventana abierta
  const [typeOrder, setTypeOrder] = useState<string[]>([]);
  const [typeId, setTypeId] = useState('');
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [day, setDay] = useState(businessToday());
  const [showPicker, setShowPicker] = useState(false);
  const [newSupplier, setNewSupplier] = useState('');
  const [addingSupplier, setAddingSupplier] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const opened = openedVat(config, editing);
    setAmountText(opened.amountText);
    setVatValue(opened.vat);
    const sorted = expenseTypesByUse(types, Object.values(useBusinessStore.getState().expenses));
    setTypeOrder(sorted.map((x) => x.id));
    setTypeId(editing?.typeId ?? sorted[0]?.id ?? '');
    setSupplierId(editing?.supplierId ?? null);
    setWorkerId(editing?.workerId ?? null);
    setName(editing?.name ?? '');
    setDay(editing?.date ?? date ?? businessToday());
    setShowPicker(false);
    setNewSupplier('');
    setAddingSupplier(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- al abrir
  }, [visible, expenseId]);

  const figures = vatFigures(config, typeId, amountText, vatValue, editing);
  const valid = Number.isFinite(figures.typed) && figures.typed > 0 && !!typeId;
  const todayId = businessToday();
  const yesterdayId = shiftDayId(todayId, -1);

  // Los tipos en el orden de uso. El del gasto, si ya no está en la lista
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
    const supplier = supplierId ? config.suppliers[supplierId] : undefined;
    const worker = workerId ? config.workers[workerId] : undefined;
    await useBusinessStore.getState().saveExpense({
      id: editing?.id,
      date: day,
      amount: figures.amount,
      vat: figures.vat,
      name: name.trim() || undefined,
      typeId,
      typeName: config.expenseTypes[typeId]?.name ?? typeId,
      supplierId: supplier ? supplierId : null,
      supplierName: supplier?.name ?? null,
      workerId: worker ? workerId : null,
      workerName: worker?.name ?? null,
      recurringId: editing?.recurringId ?? null,
    });
    successHaptic();
    onClose();
  };

  const remove = () => {
    if (!editing) return;
    Alert.alert(t('business.expense.deleteTitle'), t(editing.recurringId ? 'business.expense.deleteRecurringBody' : 'business.expense.deleteBody'), [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('business.common.delete'),
        style: 'destructive',
        onPress: async () => {
          warningHaptic();
          await useBusinessStore.getState().deleteExpense(editing.id);
          onClose();
        },
      },
    ]);
  };

  const addSupplier = async () => {
    const supplierName = newSupplier.trim();
    if (!supplierName || !config) return;
    const id = await useBusinessStore.getState().saveConfigItem('suppliers', null, {
      name: supplierName, order: nextOrder(config.suppliers), typeId,
    });
    setSupplierId(id);
    setNewSupplier('');
    setAddingSupplier(false);
  };

  const isPayroll = typeId === 'payroll';

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={editing ? t('business.expense.editTitle') : t('business.expense.newTitle')}
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

      {isPayroll && workers.length > 0 ? (
        <>
          <SheetLabel>{t('business.expense.worker')}</SheetLabel>
          <ChipRow>
            {workers.map((w) => (
              <Chip key={w.id} label={w.name} selected={w.id === workerId} onPress={() => setWorkerId(w.id === workerId ? null : w.id)} />
            ))}
          </ChipRow>
        </>
      ) : (
        <>
          <SheetLabel>{t('business.expense.supplier')}</SheetLabel>
          <ChipRow>
            {suppliers.map((sup) => (
              <Chip
                key={sup.id}
                label={sup.name}
                selected={sup.id === supplierId}
                onPress={() => {
                  const next = sup.id === supplierId ? null : sup.id;
                  setSupplierId(next);
                  // Su tipo de gasto, si lo tiene
                  if (next && sup.typeId && config?.expenseTypes[sup.typeId] && !config.expenseTypes[sup.typeId].archived) {
                    setTypeId(sup.typeId);
                  }
                }}
              />
            ))}
            <Chip label={t('business.expense.newSupplier')} icon="add" selected={addingSupplier} onPress={() => setAddingSupplier(!addingSupplier)} />
          </ChipRow>
          {addingSupplier && (
            <View style={styles.inline}>
              <FilledInput
                value={newSupplier}
                onChangeText={setNewSupplier}
                placeholder={t('business.expense.supplierPlaceholder')}
                containerStyle={styles.flex}
                maxLength={40}
                onSubmitEditing={addSupplier}
                returnKeyType="done"
              />
              <TouchableOpacity
                style={[styles.addSmall, { backgroundColor: dc.primary }, !newSupplier.trim() && styles.disabled]}
                onPress={addSupplier}
                disabled={!newSupplier.trim()}
                accessibilityRole="button"
                accessibilityLabel={t('common.add')}
              >
                <Icon name="add" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      <SheetLabel>{t('business.expense.concept')}</SheetLabel>
      <FilledInput value={name} onChangeText={setName} placeholder={t('business.expense.conceptPlaceholder')} maxLength={60} />

      <SheetLabel>{t('business.expense.day')}</SheetLabel>
      <ChipRow>
        <Chip label={t('home.today')} selected={day === todayId} onPress={() => { setDay(todayId); setShowPicker(false); }} />
        <Chip label={t('home.yesterday')} selected={day === yesterdayId} onPress={() => { setDay(yesterdayId); setShowPicker(false); }} />
        <Chip
          label={day !== todayId && day !== yesterdayId ? dayTitle(day, t, i18n.language, todayId) : t('business.expense.otherDay')}
          icon="calendar-outline"
          selected={day !== todayId && day !== yesterdayId}
          onPress={() => setShowPicker(true)}
        />
      </ChipRow>
      {showPicker && (
        <DateTimePicker
          value={dateOfDayId(day)}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          maximumDate={new Date()}
          themeVariant={isDark ? 'dark' : 'light'}
          onChange={(_, picked) => {
            if (Platform.OS !== 'ios') setShowPicker(false);
            if (picked) setDay(dayIdOfDate(picked));
          }}
        />
      )}
      {editing && <AddLink label={t('business.expense.delete')} onPress={remove} style={styles.gapTop} />}
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gapTop: { marginTop: 8 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  addSmall: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  disabled: { opacity: 0.4 },
});

export default ExpenseSheet;
