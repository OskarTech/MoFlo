import React from 'react';
import { StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/useTheme';
import { formatAmountForInput, parseAmountInput } from '../../utils/formatAmount';
import { BusinessConfig } from '../types';
import { expenseRole } from '../templates';
import { cents } from '../logic/basics';
import { expenseVatRate, splitAmount, vatOfBase } from '../logic/taxes';
import { AmountBox, FieldRow, useMoney } from './kit';

/**
 * El IVA aparte (Ajustes → «IVA aparte en los gastos») en las ventanas de un
 * gasto y de un fijo: el importe grande es la base y debajo va el IVA de la
 * factura; si se deja vacío, el que sale del tipo. Se guarda lo pagado (la
 * suma) y el IVA. Los pagos de impuestos (el 303, sociedades) no llevan IVA.
 */

type Saved = { amount: number; vat?: number | null; typeId: string };

export const vatSplitOn = (config: BusinessConfig | null, typeId: string): boolean => {
  if (!config || config.vatEnabled === false || config.expenseVatSplit !== true) return false;
  const role = expenseRole(typeId, config);
  return role !== 'vat' && role !== 'corporateTax';
};

/** Lo que se ve al abrir: el importe grande y el IVA */
export const openedVat = (config: BusinessConfig | null, saved: Saved | undefined): { amountText: string; vat: number | null } => {
  if (!saved || !config) return { amountText: saved ? formatAmountForInput(saved.amount) : '', vat: null };
  if (!vatSplitOn(config, saved.typeId)) return { amountText: formatAmountForInput(saved.amount), vat: null };
  // Uno de antes, sin IVA escrito: se parte con el de su tipo, sin cambiar lo pagado
  const parts = splitAmount(saved.amount, saved.vat, expenseVatRate(saved.typeId, config));
  return { amountText: formatAmountForInput(parts.base), vat: parts.vat };
};

export interface VatFigures {
  split: boolean;
  /** Lo escrito en el importe grande: la base, con el IVA aparte */
  typed: number;
  rate: number;
  /** El IVA que sale del tipo, si no se escribe */
  estimate: number;
  /** Lo pagado: lo que se guarda como importe */
  amount: number;
  /** El IVA que se guarda (undefined: ninguno, sale del tipo) */
  vat: number | undefined;
}

/** Las cuentas mientras se escribe, y lo que se guarda */
export const vatFigures = (
  config: BusinessConfig | null, typeId: string, amountText: string, vatValue: number | null, saved: Saved | undefined,
): VatFigures => {
  const split = vatSplitOn(config, typeId);
  const typed = parseAmountInput(amountText);
  const rate = config ? expenseVatRate(typeId, config) : 0;
  const estimate = split && Number.isFinite(typed) ? vatOfBase(typed, rate) : 0;
  if (split) {
    const vat = vatValue ?? estimate;
    return { split, typed, rate, estimate, amount: Number.isFinite(typed) ? cents(typed + vat) : typed, vat };
  }
  // Sin el IVA aparte, el que se escribió se queda mientras no cambie lo pagado
  const kept = saved && typeof saved.vat === 'number' && typed === saved.amount ? saved.vat : undefined;
  return { split, typed, rate, estimate, amount: typed, vat: kept };
};

/** «Sin IVA», debajo del importe grande */
export const BaseCaption = () => {
  const { t } = useTranslation();
  const { colors: dc } = useTheme();
  return <Text style={[styles.caption, { color: dc.textSecondary }]}>{t('business.expense.baseCaption')}</Text>;
};

/** El IVA de la factura, con lo que sale del tipo y el total */
export const VatRow = ({ figures, value, onChange }: { figures: VatFigures; value: number | null; onChange: (v: number | null) => void }) => {
  const { t } = useTranslation();
  const { money } = useMoney();
  return (
    <FieldRow
      icon="receipt-outline"
      title={t('business.expense.vat')}
      subtitle={t('business.expense.vatHint', {
        pct: figures.rate, total: money(Number.isFinite(figures.amount) ? figures.amount : 0),
      })}
      right={(
        <AmountBox
          value={value}
          onChange={onChange}
          placeholder={formatAmountForInput(figures.estimate)}
          accessibilityLabel={t('business.expense.vat')}
        />
      )}
      style={styles.row}
    />
  );
};

const styles = StyleSheet.create({
  caption: { textAlign: 'center', fontSize: 12.5, fontFamily: 'Poppins_500Medium', marginTop: -2 },
  row: { marginTop: 6 },
});
