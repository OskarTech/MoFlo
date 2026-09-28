import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Text } from 'react-native-paper';
import Icon from './Icon';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/useTheme';
import { useCategoryInfo } from '../../hooks/useCategoryInfo';
import { useSharedAccountStore } from '../../store/sharedAccountStore';
import { getMemberLabel } from '../../utils/memberLabel';
import { formatAmount } from '../../utils/formatAmount';
import { withAlpha } from '../../utils/color';
import { Movement, MovementType } from '../../types';
import StrikeText from './StrikeText';
import MemberName from './MemberName';

interface Props {
  movement: Pick<Movement, 'type' | 'amount' | 'category' | 'note' | 'isRecurring' | 'addedBy'>;
  currencySymbol: string;
  /** Texto al final de la línea de abajo (p. ej. la hora o la fecha) */
  detail?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Fila de un movimiento: icono de la categoría con su color, la nota (o la
 * categoría) y debajo la categoría, el miembro que lo añadió o si es fijo, y
 * el importe. Los ingresos en verde; los gastos, en el color del texto.
 * En la cuenta compartida, quien lo añadió sale solo por su nombre, sin foto
 * ni inicial sobre el icono.
 */
const MovementItem = ({ movement, currencySymbol, detail, style }: Props) => {
  const { t } = useTranslation();
  const { colors: dc, ui } = useTheme();
  const cat = useCategoryInfo();
  const isSharedMode = useSharedAccountStore((s) => s.isSharedMode);
  const sharedAccount = useSharedAccountStore((s) => s.sharedAccount);

  const type = movement.type as MovementType;
  const isIncome = type === 'income';
  const color = cat.color(movement.category, type);
  const catName = (
    <StrikeText struck={cat.deleted(movement.category, type)}>{cat.name(movement.category, type)}</StrikeText>
  );

  const member = isSharedMode && !movement.isRecurring
    ? getMemberLabel(sharedAccount, movement.addedBy, t('sharedAccount.formerMember'))
    : undefined;

  // Línea de abajo: la categoría (si arriba va la nota), fijo o quién lo añadió, y el detalle
  const parts: React.ReactNode[] = [];
  if (movement.note) parts.push(<React.Fragment key="c">{catName}</React.Fragment>);
  if (movement.isRecurring) {
    parts.push(
      <React.Fragment key="r">
        {t(isIncome ? 'movementsList.recurringIncome' : 'movementsList.recurringExpense')}
      </React.Fragment>,
    );
  } else if (member) {
    parts.push(<MemberName key="m" member={member} />);
  }
  if (detail) parts.push(<React.Fragment key="d">{detail}</React.Fragment>);

  return (
    <View style={[styles.row, style]}>
      <View style={[styles.icon, { backgroundColor: withAlpha(color, 0.15) }]}>
        <Icon name={cat.icon(movement.category, type)} size={20} color={color} />
      </View>
      <View style={styles.info}>
        <Text style={[styles.title, { color: dc.textPrimary }]} numberOfLines={1}>
          {movement.note || catName}
        </Text>
        {parts.length > 0 && (
          <Text style={[styles.subtitle, { color: dc.textSecondary }]} numberOfLines={1}>
            {parts.map((p, i) => (
              <React.Fragment key={i}>{i > 0 ? ' · ' : ''}{p}</React.Fragment>
            ))}
          </Text>
        )}
      </View>
      <Text
        style={[styles.amount, { color: isIncome ? ui.incomeText : dc.textPrimary }]}
        numberOfLines={1}
      >
        {isIncome ? '+' : '-'}{formatAmount(movement.amount)} {currencySymbol}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  icon: { width: 42, height: 42, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  info: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontFamily: 'Poppins_500Medium' },
  subtitle: { fontSize: 12.5, fontFamily: 'Poppins_400Regular', marginTop: 1 },
  amount: { fontSize: 15, fontFamily: 'Poppins_600SemiBold', flexShrink: 0 },
});

export default MovementItem;
