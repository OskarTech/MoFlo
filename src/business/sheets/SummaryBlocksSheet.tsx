import React from 'react';
import { View, StyleSheet, TouchableOpacity, LayoutAnimation } from 'react-native';
import { useTranslation } from 'react-i18next';
import Icon, { IconName } from '../../components/common/Icon';
import BottomSheet, { SheetLabel } from '../../components/common/BottomSheet';
import { useTheme } from '../../hooks/useTheme';
import { lightHaptic } from '../../utils/haptics';
import { useBusinessStore } from '../store/businessStore';
import {
  addBlock, hiddenBlocks, moveBlock, removeBlock, SummaryBlock, summaryLayout,
} from '../logic/summaryLayout';
import { EmptyNote, FieldRow } from '../ui/kit';

/** Cada bloque: su icono y su título (el de su apartado en el Resumen) */
export const SUMMARY_BLOCK_INFO: Record<SummaryBlock, { icon: IconName; title: string }> = {
  taxes: { icon: 'shield-checkmark', title: 'business.taxes.title' },
  vat: { icon: 'receipt', title: 'business.vat.title' },
  costs: { icon: 'basket', title: 'business.summary.costsTitle' },
  whereItGoes: { icon: 'pricetag', title: 'business.summary.whereItGoes' },
  days: { icon: 'bar-chart', title: 'business.summary.dayByDay' },
  payments: { icon: 'card-outline', title: 'business.summary.howTheyPay' },
  tickets: { icon: 'cash-outline', title: 'business.summary.ticketsTitle' },
  weekdays: { icon: 'calendar-outline', title: 'business.summary.weekdays' },
  suppliers: { icon: 'cart-outline', title: 'business.summary.suppliers' },
};

const RoundButton = ({
  icon, onPress, label, tone = 'soft', disabled,
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  tone?: 'soft' | 'add' | 'remove';
  disabled?: boolean;
}) => {
  const { colors: dc, ui } = useTheme();
  const bg = tone === 'remove' ? ui.expenseSoft : tone === 'add' ? ui.accentSoft : ui.field;
  const fg = tone === 'remove' ? ui.expenseText : tone === 'add' ? ui.accent : dc.textPrimary;
  return (
    <TouchableOpacity
      style={[styles.round, { backgroundColor: bg }, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon name={icon} size={16} color={fg} />
    </TouchableOpacity>
  );
};

/**
 * Personalizar el Resumen: los bloques que salen (subir, bajar, quitar) y los
 * que se pueden añadir. Cada cambio se guarda al momento en la configuración
 * de la empresa: lo ven igual todos los socios.
 */
const SummaryBlocksSheet = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
  const { t } = useTranslation();
  const config = useBusinessStore((s) => s.config);
  const layout = config ? summaryLayout(config) : [];
  const hidden = hiddenBlocks(layout);

  const save = (next: SummaryBlock[]) => {
    lightHaptic();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    useBusinessStore.getState().updateConfig({ summaryBlocks: next });
  };

  const row = (id: SummaryBlock, right: React.ReactNode) => (
    <FieldRow
      key={id}
      icon={SUMMARY_BLOCK_INFO[id].icon}
      title={t(SUMMARY_BLOCK_INFO[id].title)}
      subtitle={t(`business.summary.blocks.${id}`)}
      right={<View style={styles.actions}>{right}</View>}
    />
  );

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('business.summary.customize')}
      subtitle={t('business.summary.customizeHint')}
      maxHeight={0.9}
    >
      <SheetLabel>{t('business.summary.shown')}</SheetLabel>
      {layout.length ? layout.map((id, i) => row(id, (
        <>
          <RoundButton icon="chevron-up" label={t('business.summary.moveUp')} disabled={i === 0} onPress={() => save(moveBlock(layout, id, -1))} />
          <RoundButton
            icon="chevron-down"
            label={t('business.summary.moveDown')}
            disabled={i === layout.length - 1}
            onPress={() => save(moveBlock(layout, id, 1))}
          />
          <RoundButton icon="remove" tone="remove" label={t('business.summary.remove')} onPress={() => save(removeBlock(layout, id))} />
        </>
      ))) : <EmptyNote text={t('business.summary.noneShown')} />}

      <SheetLabel>{t('business.summary.toAdd')}</SheetLabel>
      {hidden.length ? hidden.map((id) => row(id, (
        <RoundButton icon="add" tone="add" label={t('business.summary.add')} onPress={() => save(addBlock(layout, id))} />
      ))) : <EmptyNote text={t('business.summary.allShown')} />}
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  round: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  disabled: { opacity: 0.3 },
});

export default SummaryBlocksSheet;
