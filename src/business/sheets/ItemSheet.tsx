import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import BottomSheet, { FilledInput, SegmentedControl, SheetButton, SheetLabel } from '../../components/common/BottomSheet';
import { successHaptic } from '../../utils/haptics';
import { useBusinessStore } from '../store/businessStore';
import { nextOrder, orderedItems } from '../logic/basics';
import { Channel, ChannelKind, ConfigListKind, ExpenseType, Supplier, Worker } from '../types';
import { AmountBox, Chip, ChipRow, FieldRow, SettingsSwitch } from '../ui/kit';

/**
 * Una pieza de las listas de Empresa: una forma de cobro (con su comisión),
 * un empleado, un proveedor, un tipo de gasto, una sección, una caja o un
 * turno. No se borran: se archivan, para que lo de antes siga con su nombre.
 */
const ItemSheet = ({
  visible, list, itemId, onClose,
}: { visible: boolean; list: ConfigListKind; itemId?: string; onClose: () => void }) => {
  const { t } = useTranslation();
  const config = useBusinessStore((s) => s.config);
  const editing = itemId ? (config?.[list] as Record<string, Record<string, unknown>> | undefined)?.[itemId] : undefined;
  const types = useMemo(() => orderedItems(config?.expenseTypes), [config]);

  const [name, setName] = useState('');
  const [kind, setKind] = useState<ChannelKind>('other');
  const [commission, setCommission] = useState<number | null>(null);
  const [role, setRole] = useState('');
  const [typeId, setTypeId] = useState<string | null>(null);
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!visible) return;
    const item = editing as (Partial<Channel & Worker & Supplier & ExpenseType>) | undefined;
    setName(item?.name ?? '');
    setKind(item?.kind ?? 'other');
    setCommission(item?.commissionPct ?? null);
    setRole(item?.role ?? '');
    setTypeId(item?.typeId ?? (list === 'suppliers' ? 'suppliers' : null));
    setActive(!item?.archived);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- al abrir
  }, [visible, list, itemId]);

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
    }
    if (list === 'workers' && role.trim()) extra.role = role.trim();
    if (list === 'suppliers' && typeId) extra.typeId = typeId;
    if (list === 'expenseTypes') extra.icon = (editing?.icon as string | undefined) ?? 'pricetag';
    await useBusinessStore.getState().saveConfigItem(list, itemId ?? null, { ...base, ...extra } as never);
    successHaptic();
    onClose();
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={editing ? String(editing.name ?? '') : t(`business.lists.${list}.new`)}
      dismissKeyboardOnTap
      footer={<SheetButton label={t('business.common.save')} icon="checkmark" disabled={!name.trim()} onPress={save} />}
    >
      <SheetLabel style={styles.firstLabel}>{t('business.catalog.name')}</SheetLabel>
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
      {editing && (
        <FieldRow
          title={t('business.lists.active')}
          subtitle={t('business.lists.activeHint')}
          style={styles.gapTop}
          right={<SettingsSwitch value={active} onChange={setActive} label={t('business.lists.active')} />}
        />
      )}
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  firstLabel: { marginTop: 0 },
  gapTop: { marginTop: 10 },
});

export default ItemSheet;
