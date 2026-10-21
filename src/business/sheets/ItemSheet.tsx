import React, { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import BottomSheet, { FilledInput, SegmentedControl, SheetButton, SheetLabel } from '../../components/common/BottomSheet';
import { successHaptic, warningHaptic } from '../../utils/haptics';
import { useBusinessStore } from '../store/businessStore';
import { nextOrder, orderedItems } from '../logic/basics';
import {
  CHANNEL_IDS, COMMISSIONS_TYPE, CORPORATE_TAX_TYPE, DEFAULT_EXPENSE_TYPE, DEFAULT_EXPENSE_VAT, expenseRole, VAT_TYPE,
} from '../templates';
import { Channel, ChannelKind, ConfigListKind, ExpenseRole, ExpenseType, Supplier, Worker } from '../types';
import { AddLink, AmountBox, Chip, ChipRow, FieldRow, Note, SettingsSwitch } from '../ui/kit';

/** El IVA que se puede elegir para un tipo de gasto, y para qué puede contar */
const VAT_CHOICES = [0, 4, 10, 21];
const ROLES: ExpenseRole[] = ['none', 'food', 'staff', 'vat', 'corporateTax'];

/** Lo que no se puede borrar aunque no se haya usado: lo de la caja y los gastos que se apuntan solos */
const FIXED_ITEMS: Partial<Record<ConfigListKind, readonly string[]>> = {
  channels: CHANNEL_IDS,
  expenseTypes: [COMMISSIONS_TYPE, VAT_TYPE, CORPORATE_TAX_TYPE],
};

/**
 * Una pieza de las listas de Ajustes: una forma de cobro (con su comisión),
 * un empleado, un proveedor o un tipo de gasto (con su IVA). Lo que no se ha
 * usado nunca se puede borrar; lo usado se archiva, para que lo de antes siga
 * con su nombre.
 */
const ItemSheet = ({
  visible, list, itemId, onClose,
}: { visible: boolean; list: ConfigListKind; itemId?: string; onClose: () => void }) => {
  const { t } = useTranslation();
  const config = useBusinessStore((s) => s.config);
  const days = useBusinessStore((s) => s.days);
  const expenses = useBusinessStore((s) => s.expenses);
  const recurring = useBusinessStore((s) => s.recurring);
  const editing = itemId ? (config?.[list] as Record<string, Record<string, unknown>> | undefined)?.[itemId] : undefined;
  const types = useMemo(() => orderedItems(config?.expenseTypes), [config]);

  const [name, setName] = useState('');
  const [kind, setKind] = useState<ChannelKind>('other');
  const [commission, setCommission] = useState<number | null>(null);
  const [fixedFee, setFixedFee] = useState<number | null>(null);
  const [role, setRole] = useState('');
  const [typeId, setTypeId] = useState<string | null>(null);
  const [vatRate, setVatRate] = useState(DEFAULT_EXPENSE_VAT);
  const [typeRole, setTypeRole] = useState<ExpenseRole>('none');
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!visible) return;
    const item = editing as (Partial<Channel & Worker & Supplier & ExpenseType>) | undefined;
    setName(item?.name ?? '');
    setKind(item?.kind ?? 'other');
    setCommission(item?.commissionPct ?? null);
    setFixedFee(item?.commissionFixed ?? null);
    setRole(item?.role ?? '');
    setTypeId(item?.typeId ?? (list === 'suppliers' ? DEFAULT_EXPENSE_TYPE : null));
    setVatRate(item?.vatRate ?? DEFAULT_EXPENSE_VAT);
    setTypeRole(itemId && config ? expenseRole(itemId, config) : 'none');
    setActive(!item?.archived);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- al abrir
  }, [visible, list, itemId]);

  // Si se ha usado (en un día, un gasto, un fijo o un proveedor): entonces se archiva, no se borra
  const used = useMemo(() => {
    if (!itemId) return false;
    if (FIXED_ITEMS[list]?.includes(itemId)) return true;
    const spent = [...Object.values(expenses), ...Object.values(recurring)];
    switch (list) {
      case 'channels':
        return Object.values(days).some((d) => Object.values(d.entries ?? {}).some((e) => (e.amounts ?? {})[itemId] != null));
      case 'workers':
        return spent.some((e) => e.workerId === itemId);
      case 'suppliers':
        return spent.some((e) => e.supplierId === itemId);
      default:
        return spent.some((e) => e.typeId === itemId)
          || Object.values(config?.suppliers ?? {}).some((s) => s.typeId === itemId);
    }
  }, [itemId, list, days, expenses, recurring, config]);

  const save = async () => {
    if (!name.trim() || !config) return;
    const base = {
      name: name.trim(),
      order: (editing?.order as number | undefined) ?? nextOrder(config[list] as Record<string, { order: number }>),
      ...(active ? {} : { archived: true }),
    };
    const extra: Record<string, unknown> = {};
    if (list === 'channels') {
      extra.kind = kind;
      if (commission && commission > 0) extra.commissionPct = Math.min(100, commission);
      if (fixedFee && fixedFee > 0) extra.commissionFixed = fixedFee;
    }
    if (list === 'workers' && role.trim()) extra.role = role.trim();
    if (list === 'suppliers' && typeId) extra.typeId = typeId;
    if (list === 'expenseTypes') {
      extra.icon = (editing?.icon as string | undefined) ?? 'pricetag';
      extra.vatRate = vatRate;
      extra.role = typeRole;
    }
    await useBusinessStore.getState().saveConfigItem(list, itemId ?? null, { ...base, ...extra } as never);
    successHaptic();
    onClose();
  };

  const remove = () => {
    if (!itemId || !editing) return;
    Alert.alert(t('business.lists.deleteTitle', { name: String(editing.name ?? '') }), t('business.lists.deleteBody'), [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('business.common.delete'),
        style: 'destructive',
        onPress: async () => {
          warningHaptic();
          await useBusinessStore.getState().deleteConfigItem(list, itemId);
          onClose();
        },
      },
    ]);
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={editing ? String(editing.name ?? '') : t(`business.lists.${list}.new`)}
      dismissKeyboardOnTap
      footer={<SheetButton label={t('business.common.save')} icon="checkmark" disabled={!name.trim()} onPress={save} />}
    >
      <SheetLabel style={styles.firstLabel}>{t('business.lists.name')}</SheetLabel>
      <FilledInput value={name} onChangeText={setName} placeholder={t(`business.lists.${list}.placeholder`)} maxLength={40} />

      {list === 'channels' && (
        <>
          <SheetLabel>{t('business.lists.channels.kind')}</SheetLabel>
          <SegmentedControl
            options={[
              { key: 'cash', label: t('business.lists.channels.cash') },
              { key: 'card', label: t('business.lists.channels.card') },
              { key: 'other', label: t('business.lists.channels.other') },
            ]}
            value={kind}
            onChange={setKind}
          />
          <FieldRow
            title={t('business.lists.channels.commission')}
            subtitle={t('business.lists.channels.commissionHint')}
            style={styles.gapTop}
            right={<AmountBox value={commission} onChange={setCommission} width={84} placeholder="0 %" accessibilityLabel={t('business.lists.channels.commission')} />}
          />
          <FieldRow
            title={t('business.lists.channels.fixedFee')}
            subtitle={t('business.lists.channels.fixedFeeHint')}
            right={<AmountBox value={fixedFee} onChange={setFixedFee} width={84} placeholder="0,00" accessibilityLabel={t('business.lists.channels.fixedFee')} />}
          />
        </>
      )}
      {list === 'workers' && (
        <>
          <SheetLabel>{t('business.lists.workers.role')}</SheetLabel>
          <FilledInput value={role} onChangeText={setRole} placeholder={t('business.lists.workers.rolePlaceholder')} maxLength={40} />
        </>
      )}
      {list === 'suppliers' && types.length > 0 && (
        <>
          <SheetLabel>{t('business.lists.suppliers.type')}</SheetLabel>
          <ChipRow>
            {types.map((x) => (
              <Chip key={x.id} label={x.name} selected={x.id === typeId} onPress={() => setTypeId(x.id)} />
            ))}
          </ChipRow>
        </>
      )}
      {list === 'expenseTypes' && (
        <>
          <SheetLabel>{t('business.lists.expenseTypes.vat')}</SheetLabel>
          <ChipRow>
            {VAT_CHOICES.map((pct) => (
              <Chip key={pct} label={`${pct} %`} selected={vatRate === pct} onPress={() => setVatRate(pct)} />
            ))}
          </ChipRow>
          <Note text={t('business.lists.expenseTypes.vatHint')} style={styles.gapTop} />
          <SheetLabel>{t('business.lists.expenseTypes.role')}</SheetLabel>
          <ChipRow>
            {ROLES.map((r) => (
              <Chip key={r} label={t(`business.lists.expenseTypes.roles.${r}`)} selected={typeRole === r} onPress={() => setTypeRole(r)} />
            ))}
          </ChipRow>
          <Note text={t(`business.lists.expenseTypes.roleHints.${typeRole}`)} style={styles.gapTop} />
        </>
      )}
      {editing && used && (
        <FieldRow
          title={t('business.lists.active')}
          subtitle={t('business.lists.activeHint')}
          style={styles.gapTop}
          right={<SettingsSwitch value={active} onChange={setActive} label={t('business.lists.active')} />}
        />
      )}
      {editing && !used && <AddLink label={t('business.lists.delete')} onPress={remove} style={styles.gapTop} />}
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  firstLabel: { marginTop: 0 },
  gapTop: { marginTop: 10 },
});

export default ItemSheet;
