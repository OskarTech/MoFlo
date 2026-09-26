import React from 'react';
import { View, StyleSheet, TouchableOpacity, StyleProp, ViewStyle } from 'react-native';
import { Text } from 'react-native-paper';
import { useTheme } from '../../hooks/useTheme';

/** Título de un bloque de la hoja, con un enlace opcional a la derecha ("Ver todo") */
export const SectionHeader = ({
  title, action, onAction, style,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) => {
  const { colors: dc, ui } = useTheme();
  return (
    <View style={[styles.section, style]}>
      <Text style={[styles.sectionTitle, { color: dc.textPrimary }]} numberOfLines={1}>{title}</Text>
      {action && onAction ? (
        <TouchableOpacity onPress={onAction} activeOpacity={0.7} hitSlop={8} accessibilityRole="button">
          <Text style={[styles.sectionAction, { color: ui.accent }]}>{action}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

/** Cabecera de un grupo de la lista: el día (o lo que agrupe) y su total */
export const GroupHeader = ({
  label, total, first, style,
}: {
  label: string;
  total?: string;
  first?: boolean;
  style?: StyleProp<ViewStyle>;
}) => {
  const { colors: dc } = useTheme();
  return (
    <View style={[styles.group, first && styles.groupFirst, style]}>
      <Text style={[styles.groupText, { color: dc.textSecondary }]} numberOfLines={1}>{label}</Text>
      {total ? <Text style={[styles.groupText, { color: dc.textSecondary }]}>{total}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12,
    paddingHorizontal: 20, marginBottom: 10,
  },
  sectionTitle: { fontSize: 18, fontFamily: 'Poppins_700Bold', letterSpacing: -0.3, flexShrink: 1 },
  sectionAction: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
  group: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12,
    paddingTop: 16, paddingBottom: 3,
  },
  groupFirst: { paddingTop: 4 },
  groupText: { fontSize: 12.5, fontFamily: 'Poppins_600SemiBold' },
});
