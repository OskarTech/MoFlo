import React from 'react';
import { View, StyleSheet, TouchableOpacity, StyleProp, ViewStyle } from 'react-native';
import { Text } from 'react-native-paper';
import Icon, { IconName } from '../common/Icon';
import { useTheme } from '../../hooks/useTheme';

/**
 * Bloque de Ajustes: título pequeño y filas separadas por una línea fina, sin
 * tarjeta alrededor. Los hijos vacíos (condiciones que no se cumplen) se
 * saltan, así que no quedan líneas sueltas.
 */
export const SettingsSection = ({
  title, children, style,
}: {
  title?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) => {
  const { colors: dc, ui } = useTheme();
  const rows = React.Children.toArray(children).filter(Boolean);
  if (rows.length === 0) return null;
  return (
    <View style={[styles.section, style]}>
      {title ? <Text style={[styles.sectionTitle, { color: dc.textSecondary }]}>{title}</Text> : null}
      {rows.map((row, i) => (
        <View key={i}>
          {i > 0 && <View style={[styles.divider, { backgroundColor: ui.hair }]} />}
          {row}
        </View>
      ))}
    </View>
  );
};

export const SettingsRow = ({
  icon, label, subtitle, value, swatch, onPress, danger, right, showArrow = true,
}: {
  icon: IconName;
  label: string;
  subtitle?: string;
  value?: string;
  /** Círculo de color junto al valor (el color de la app) */
  swatch?: string;
  onPress?: () => void;
  danger?: boolean;
  /** Algo propio a la derecha, p. ej. un interruptor */
  right?: React.ReactNode;
  showArrow?: boolean;
}) => {
  const { colors: dc, ui } = useTheme();
  const tint = danger ? ui.expenseText : ui.accent;
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.7}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      <View style={[styles.icon, { backgroundColor: danger ? ui.expenseSoft : ui.accentSoft }]}>
        <Icon name={icon} size={18} color={tint} />
      </View>
      <View style={styles.content}>
        <Text style={[styles.label, { color: danger ? ui.expenseText : dc.textPrimary }]}>{label}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: dc.textSecondary }]} numberOfLines={2}>{subtitle}</Text>
        ) : null}
      </View>
      {right ?? (
        <>
          {value ? (
            <Text style={[styles.value, { color: dc.textSecondary }]} numberOfLines={1}>{value}</Text>
          ) : null}
          {swatch ? <View style={[styles.swatch, { backgroundColor: swatch }]} /> : null}
          {showArrow && onPress ? (
            <Icon name="chevron-forward" size={17} color={dc.textSecondary} style={styles.chevron} />
          ) : null}
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  section: { paddingHorizontal: 20, marginBottom: 22 },
  sectionTitle: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', marginBottom: 2 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 46 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  icon: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  content: { flex: 1, minWidth: 0 },
  label: { fontSize: 15, fontFamily: 'Poppins_500Medium' },
  subtitle: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 1 },
  value: { fontSize: 13.5, fontFamily: 'Poppins_400Regular', maxWidth: '45%' },
  swatch: { width: 18, height: 18, borderRadius: 9 },
  chevron: { opacity: 0.6 },
});
