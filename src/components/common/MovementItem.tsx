import React from 'react';
import { View, StyleSheet, Text as RNText, StyleProp, ViewStyle } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import auth from '@react-native-firebase/auth';
import { useTheme } from '../../hooks/useTheme';
import { useCategoryInfo } from '../../hooks/useCategoryInfo';
import { useSharedAccountStore } from '../../store/sharedAccountStore';
import { getMemberLabel, getMemberPhoto } from '../../utils/memberLabel';
import { formatAmount } from '../../utils/formatAmount';
import { withAlpha } from '../../utils/color';
import { Movement, MovementType } from '../../types';
import StrikeText from './StrikeText';
import MemberName from './MemberName';
import Avatar from './Avatar';

interface Props {
  movement: Pick<Movement, 'type' | 'amount' | 'category' | 'note' | 'isRecurring' | 'addedBy'>;
  currencySymbol: string;
  /** Texto al final de la línea de abajo (p. ej. la hora o la fecha) */
  detail?: string;
  /** Fondo sobre el que va (para el borde de la inicial del miembro) */
  background?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Fila de un movimiento: icono de la categoría con su color, la nota (o la
 * categoría) y debajo la categoría, el miembro que lo añadió o si es fijo, y
 * el importe. Los ingresos en verde; los gastos, en el color del texto.
 * En la cuenta compartida, la inicial de quien lo añadió va sobre el icono.
 */
const MovementItem = ({ movement, currencySymbol, detail, background, style }: Props) => {
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
  const isMe = !!movement.addedBy && movement.addedBy === auth().currentUser?.uid;
  const badgeColor = member?.isFormer ? dc.textSecondary : isMe ? dc.primary : ui.savingsText;

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
        <Ionicons name={cat.icon(movement.category, type)} size={20} color={color} />
        {member && (
          <Avatar
            uri={getMemberPhoto(sharedAccount, movement.addedBy)}
            style={[styles.badge, { backgroundColor: badgeColor, borderColor: background ?? ui.sheet }]}
          >
            <RNText style={styles.badgeText}>{member.name.charAt(0).toUpperCase()}</RNText>
          </Avatar>
        )}
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
  badge: {
    position: 'absolute', right: -5, bottom: -5, width: 19, height: 19, borderRadius: 10,
    borderWidth: 2, justifyContent: 'center', alignItems: 'center',
  },
  badgeText: { color: '#FFFFFF', fontSize: 9, fontFamily: 'Poppins_700Bold', lineHeight: 12 },
  info: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontFamily: 'Poppins_500Medium' },
  subtitle: { fontSize: 12.5, fontFamily: 'Poppins_400Regular', marginTop: 1 },
  amount: { fontSize: 15, fontFamily: 'Poppins_600SemiBold', flexShrink: 0 },
});

export default MovementItem;
