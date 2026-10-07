import React, { useEffect, useState } from 'react';
import {
  View, StyleSheet, TouchableOpacity, TextInput, Switch, StyleProp, ViewStyle, ScrollView,
} from 'react-native';
import { Text } from 'react-native-paper';
import Icon, { IconName } from '../../components/common/Icon';
import { useTheme } from '../../hooks/useTheme';
import { withAlpha } from '../../utils/color';
import { CURRENCIES } from '../../constants/currencies';
import {
  formatAmountForInput, formatMoney, parseAmountInput,
} from '../../utils/formatAmount';
import { lightHaptic, selectionHaptic } from '../../utils/haptics';
import { useBusinessStore } from '../store/businessStore';

/**
 * Piezas de las pantallas de la empresa, con el estilo del resto de la app:
 * filas, chips, campos de importe y gráficos sencillos.
 */

/** La moneda de la empresa y su formato */
export const useMoney = () => {
  const code = useBusinessStore((s) => s.business?.currencyCode ?? 'EUR');
  const symbol = CURRENCIES.find((c) => c.code === code)?.symbol ?? '€';
  const money = (amount: number, opts?: { decimals?: number; sign?: string }) => formatMoney(amount, symbol, opts);
  return { symbol, money };
};

// ── Chips ────────────────────────────────────────────────────────

export const Chip = ({
  label, selected, onPress, icon, color, style, onLongPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  /** Color del chip elegido (por defecto, el de la paleta) */
  color?: string;
  style?: StyleProp<ViewStyle>;
  onLongPress?: () => void;
}) => {
  const { colors: dc, ui } = useTheme();
  const tint = color ?? dc.primary;
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        { borderColor: selected ? tint : ui.hair2, backgroundColor: selected ? tint : 'transparent' },
        style,
      ]}
      onPress={() => { selectionHaptic(); onPress?.(); }}
      onLongPress={onLongPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
    >
      {selected
        ? <Icon name="checkmark" size={13} color="#FFFFFF" />
        : icon ? <Icon name={icon} size={13} color={dc.textSecondary} /> : null}
      <Text style={[styles.chipText, { color: selected ? '#FFFFFF' : dc.textPrimary }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
};

export const ChipRow = ({ children, style, scroll }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; scroll?: boolean }) =>
  scroll ? (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="always"
      style={styles.bleed}
      contentContainerStyle={[styles.chipScroll, style]}
    >
      {children}
    </ScrollView>
  ) : <View style={[styles.chips, style]}>{children}</View>;

// ── Campos ───────────────────────────────────────────────────────

/** Importe en un campo pequeño a la derecha de una fila. null si está vacío */
export const AmountBox = ({
  value, onChange, placeholder = '0', width = 104, autoFocus, accessibilityLabel, integer,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  width?: number;
  autoFocus?: boolean;
  accessibilityLabel?: string;
  /** Solo enteros (tickets) */
  integer?: boolean;
}) => {
  const { colors: dc, ui } = useTheme();
  const [text, setText] = useState(value == null ? '' : integer ? String(value) : formatAmountForInput(value));
  const [focused, setFocused] = useState(false);
  // Si cambia desde fuera (se rellena con los pedidos), se reescribe
  useEffect(() => {
    if (focused) return;
    setText(value == null ? '' : integer ? String(value) : formatAmountForInput(value));
  }, [value, focused, integer]);
  return (
    <TextInput
      value={text}
      onChangeText={(raw) => {
        setText(raw);
        if (!raw.trim()) return onChange(null);
        const n = integer ? parseInt(raw.replace(/\D/g, ''), 10) : parseAmountInput(raw);
        onChange(Number.isFinite(n) && n >= 0 ? n : null);
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      keyboardType={integer ? 'number-pad' : 'decimal-pad'}
      placeholder={placeholder}
      placeholderTextColor={ui.hair2}
      selectionColor={ui.accent}
      autoFocus={autoFocus}
      maxLength={12}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.amountBox,
        { width, color: dc.textPrimary, backgroundColor: ui.field, borderColor: focused ? ui.accent : 'transparent' },
      ]}
    />
  );
};

/** Una fila de un formulario: icono, nombre (y debajo un detalle) y algo a la derecha */
export const FieldRow = ({
  icon, color, title, subtitle, right, style,
}: {
  icon?: IconName;
  color?: string;
  title: string;
  subtitle?: string | null;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) => {
  const { colors: dc, ui } = useTheme();
  return (
    <View style={[styles.fieldRow, { borderBottomColor: ui.hair }, style]}>
      {icon ? (
        <View style={[styles.fieldIcon, { backgroundColor: withAlpha(color ?? ui.accent, 0.15) }]}>
          <Icon name={icon} size={16} color={color ?? ui.accent} />
        </View>
      ) : null}
      <View style={styles.fieldText}>
        <Text style={[styles.fieldTitle, { color: dc.textPrimary }]} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={[styles.fieldSub, { color: dc.textSecondary }]} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
};

/** + algo, en el color de la paleta */
export const AddLink = ({ label, onPress, style }: { label: string; onPress: () => void; style?: StyleProp<ViewStyle> }) => {
  const { ui } = useTheme();
  return (
    <TouchableOpacity style={[styles.addLink, style]} onPress={() => { lightHaptic(); onPress(); }} activeOpacity={0.7} accessibilityRole="button">
      <Icon name="add" size={15} color={ui.accent} />
      <Text style={[styles.addLinkText, { color: ui.accent }]}>{label}</Text>
    </TouchableOpacity>
  );
};

// ── Filas de lista ───────────────────────────────────────────────

export const ListRow = ({
  icon, color, initial, title, subtitle, right, rightSub, rightColor, onPress, struck, dim, style, accessibilityLabel,
}: {
  icon?: IconName;
  color?: string;
  /** En vez de icono, la inicial (personas) */
  initial?: string;
  title: string;
  subtitle?: string | null;
  right?: string | null;
  rightSub?: string | null;
  rightColor?: string;
  onPress?: () => void;
  /** Tachado (un pedido anulado) */
  struck?: boolean;
  dim?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) => {
  const { colors: dc, ui } = useTheme();
  const tint = color ?? ui.accent;
  const body = (
    <View style={[styles.listRow, dim && styles.dim, style]}>
      {initial !== undefined ? (
        <View style={[styles.listIcon, styles.round, { backgroundColor: withAlpha(tint, 0.16) }]}>
          <Text style={[styles.initial, { color: tint }]}>{initial}</Text>
        </View>
      ) : icon ? (
        <View style={[styles.listIcon, { backgroundColor: withAlpha(tint, 0.15) }]}>
          <Icon name={icon} size={19} color={tint} />
        </View>
      ) : null}
      <View style={styles.listText}>
        <Text
          style={[styles.listTitle, { color: struck ? dc.textSecondary : dc.textPrimary }, struck && styles.struck]}
          numberOfLines={2}
        >
          {title}
        </Text>
        {subtitle ? <Text style={[styles.listSub, { color: dc.textSecondary }]} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {right ? (
        <View style={styles.listRight}>
          <Text
            style={[styles.listAmount, { color: struck ? dc.textSecondary : rightColor ?? dc.textPrimary }, struck && styles.struck]}
            numberOfLines={1}
          >
            {right}
          </Text>
          {rightSub ? <Text style={[styles.listSub, { color: dc.textSecondary }]} numberOfLines={1}>{rightSub}</Text> : null}
        </View>
      ) : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
      {body}
    </TouchableOpacity>
  );
};

/** Texto suave para cuando no hay nada */
export const EmptyNote = ({ text, style }: { text: string; style?: StyleProp<ViewStyle> }) => {
  const { colors: dc } = useTheme();
  return (
    <View style={[styles.empty, style]}>
      <Text style={[styles.emptyText, { color: dc.textSecondary }]}>{text}</Text>
    </View>
  );
};

/** Un aviso suave dentro de la hoja (con icono) */
export const Note = ({ icon = 'information-circle-outline', text, color, style }: {
  icon?: IconName; text: string; color?: string; style?: StyleProp<ViewStyle>;
}) => {
  const { colors: dc, ui } = useTheme();
  return (
    <View style={[styles.note, { backgroundColor: ui.field }, style]}>
      <Icon name={icon} size={17} color={color ?? ui.accent} />
      <Text style={[styles.noteText, { color: dc.textPrimary }]}>{text}</Text>
    </View>
  );
};

/** Botón de acción pequeño en forma de pastilla */
export const PillButton = ({
  label, icon, onPress, tone = 'primary', disabled, style,
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  tone?: 'primary' | 'soft' | 'danger';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) => {
  const { colors: dc, ui } = useTheme();
  const bg = tone === 'primary' ? dc.primary : tone === 'danger' ? ui.expenseSoft : ui.accentSoft;
  const fg = tone === 'primary' ? '#FFFFFF' : tone === 'danger' ? ui.expenseText : ui.accent;
  return (
    <TouchableOpacity
      style={[styles.pill, { backgroundColor: bg }, disabled && styles.dim, style]}
      onPress={() => { lightHaptic(); onPress(); }}
      disabled={disabled}
      activeOpacity={0.8}
      accessibilityRole="button"
    >
      {icon ? <Icon name={icon} size={15} color={fg} /> : null}
      <Text style={[styles.pillText, { color: fg }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
};

// ── Ajustes ──────────────────────────────────────────────────────

export const SettingsGroup = ({ title, children, style }: { title?: string; children: React.ReactNode; style?: StyleProp<ViewStyle> }) => {
  const { colors: dc, ui } = useTheme();
  return (
    <View style={style}>
      {title ? <Text style={[styles.groupTitle, { color: dc.textSecondary }]}>{title}</Text> : null}
      <View style={[styles.group, { backgroundColor: ui.field }]}>{children}</View>
    </View>
  );
};

export const SettingsRow = ({
  icon, label, value, onPress, right, danger, last, subtitle,
}: {
  icon: IconName;
  label: string;
  value?: string | null;
  subtitle?: string | null;
  onPress?: () => void;
  right?: React.ReactNode;
  danger?: boolean;
  last?: boolean;
}) => {
  const { colors: dc, ui } = useTheme();
  const color = danger ? ui.expenseText : dc.textPrimary;
  const body = (
    <View style={[styles.setRow, !last && { borderBottomColor: ui.hair, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <View style={[styles.setIcon, { backgroundColor: ui.sheet }]}>
        <Icon name={icon} size={16} color={danger ? ui.expenseText : ui.accent} />
      </View>
      <View style={styles.setText}>
        <Text style={[styles.setLabel, { color }]} numberOfLines={1}>{label}</Text>
        {subtitle ? <Text style={[styles.setSub, { color: dc.textSecondary }]} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {value ? <Text style={[styles.setValue, { color: dc.textSecondary }]} numberOfLines={1}>{value}</Text> : null}
      {right ?? (onPress ? <Icon name="chevron-forward" size={15} color={dc.textSecondary} /> : null)}
    </View>
  );
  if (!onPress) return body;
  return <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="button">{body}</TouchableOpacity>;
};

export const SettingsSwitch = ({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) => {
  const { colors: dc, ui } = useTheme();
  return (
    <Switch
      value={value}
      onValueChange={(v) => { selectionHaptic(); onChange(v); }}
      trackColor={{ false: ui.hair2, true: dc.income }}
      thumbColor="#FFFFFF"
      ios_backgroundColor={ui.hair2}
      accessibilityLabel={label}
    />
  );
};

// ── Gráficos ─────────────────────────────────────────────────────

/** Tres cifras pequeñas en fila */
export const StatTiles = ({ items, style }: { items: { value: string; label: string }[]; style?: StyleProp<ViewStyle> }) => {
  const { colors: dc, ui } = useTheme();
  return (
    <View style={[styles.tiles, style]}>
      {items.map((item) => (
        <View key={item.label} style={[styles.tile, { backgroundColor: ui.field }]}>
          <Text style={[styles.tileValue, { color: dc.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {item.value}
          </Text>
          <Text style={[styles.tileLabel, { color: dc.textSecondary }]} numberOfLines={2}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
};

/** Una barra partida en trozos y su leyenda */
export const StackBar = ({
  parts, format,
}: {
  parts: { key: string; label: string; value: number; color: string }[];
  format: (value: number) => string;
}) => {
  const { colors: dc, ui } = useTheme();
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (total <= 0) return null;
  return (
    <View>
      <View style={[styles.stack, { backgroundColor: ui.fill2 }]}>
        {parts.map((p) => (
          <View key={p.key} style={{ flex: p.value / total, backgroundColor: p.color }} />
        ))}
      </View>
      <View style={styles.legend}>
        {parts.map((p) => (
          <View key={p.key} style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: p.color }]} />
            <Text style={[styles.legendLabel, { color: dc.textPrimary }]} numberOfLines={1}>{p.label}</Text>
            <Text style={[styles.legendValue, { color: dc.textPrimary }]}>{format(p.value)}</Text>
            <Text style={[styles.legendPct, { color: dc.textSecondary }]}>{Math.round((p.value / total) * 100)}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

/** Una lista de más a menos con su barra */
export const RankList = ({
  rows, color,
}: {
  rows: { key: string; label: string; value: string; sub?: string; weight: number }[];
  color: string;
}) => {
  const { colors: dc, ui } = useTheme();
  const max = Math.max(1, ...rows.map((r) => r.weight));
  return (
    <View>
      {rows.map((r, i) => (
        <View key={r.key} style={styles.rankRow}>
          <View style={[styles.rankPos, { backgroundColor: ui.fill2 }]}>
            <Text style={[styles.rankPosText, { color: dc.textPrimary }]}>{i + 1}</Text>
          </View>
          <View style={styles.rankMid}>
            <View style={styles.rankTop}>
              <Text style={[styles.rankLabel, { color: dc.textPrimary }]} numberOfLines={1}>{r.label}</Text>
              <Text style={[styles.rankValue, { color: dc.textPrimary }]} numberOfLines={1}>{r.value}</Text>
            </View>
            <View style={[styles.rankTrack, { backgroundColor: ui.fill2 }]}>
              <View style={[styles.rankFill, { width: `${(r.weight / max) * 100}%`, backgroundColor: color }]} />
            </View>
            {r.sub ? <Text style={[styles.rankSub, { color: dc.textSecondary }]} numberOfLines={1}>{r.sub}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
};

/** El resultado de cada día: hacia arriba en verde lo ganado, hacia abajo en rojo lo perdido */
export const DayBars = ({
  days, onPressDay, accessibilityLabel, firstLabel, middleLabel, lastLabel,
}: {
  days: { id: string; value: number | null; future?: boolean }[];
  onPressDay?: (id: string) => void;
  accessibilityLabel: string;
  firstLabel: string;
  middleLabel: string;
  lastLabel: string;
}) => {
  const { colors: dc, ui } = useTheme();
  const max = Math.max(1, ...days.map((d) => Math.abs(d.value ?? 0)));
  return (
    <View accessible accessibilityLabel={accessibilityLabel}>
      <View style={styles.dayBars}>
        {days.map((d) => {
          const h = d.value == null || d.future ? 0 : (Math.abs(d.value) / max) * 100;
          const col = (
            <View style={styles.dayCol}>
              <View style={[styles.dayHalf, styles.dayUp, { borderBottomColor: ui.hair2 }]}>
                {d.value != null && d.value > 0 && !d.future
                  ? <View style={[styles.dayBar, styles.dayBarUp, { height: `${h}%`, backgroundColor: dc.income }]} /> : null}
              </View>
              <View style={styles.dayHalf}>
                {d.value != null && d.value < 0 && !d.future
                  ? <View style={[styles.dayBar, styles.dayBarDown, { height: `${h}%`, backgroundColor: dc.expense }]} /> : null}
              </View>
            </View>
          );
          return onPressDay ? (
            <TouchableOpacity key={d.id} style={styles.dayTouch} onPress={() => onPressDay(d.id)} activeOpacity={0.6}>{col}</TouchableOpacity>
          ) : <View key={d.id} style={styles.dayTouch}>{col}</View>;
        })}
      </View>
      <View style={styles.dayLabels}>
        <Text style={[styles.dayLabel, { color: dc.textSecondary }]}>{firstLabel}</Text>
        <Text style={[styles.dayLabel, { color: dc.textSecondary }]}>{middleLabel}</Text>
        <Text style={[styles.dayLabel, { color: dc.textSecondary }]}>{lastLabel}</Text>
      </View>
    </View>
  );
};

/** Barras verticales con su etiqueta debajo (horas, días de la semana) */
export const ColumnBars = ({
  columns, color, accessibilityLabel,
}: {
  columns: { key: string; label: string; value: number }[];
  color: string;
  accessibilityLabel: string;
}) => {
  const { colors: dc } = useTheme();
  const max = Math.max(1, ...columns.map((c) => c.value));
  return (
    <View accessible accessibilityLabel={accessibilityLabel}>
      <View style={styles.cols}>
        {columns.map((c) => (
          <View key={c.key} style={styles.colWrap}>
            <View
              style={[
                styles.col,
                { height: `${Math.max(2, (c.value / max) * 100)}%`, backgroundColor: c.value === max ? color : withAlpha(color, 0.38) },
              ]}
            />
          </View>
        ))}
      </View>
      <View style={styles.colLabels}>
        {columns.map((c) => (
          <Text key={c.key} style={[styles.colLabel, { color: dc.textSecondary }]} numberOfLines={1}>{c.label}</Text>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  bleed: { marginHorizontal: -20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipScroll: { paddingHorizontal: 20, gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, maxWidth: 260,
  },
  chipText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', flexShrink: 1 },
  amountBox: {
    borderRadius: 11, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 8,
    fontSize: 15, fontFamily: 'Poppins_600SemiBold', textAlign: 'right',
  },
  fieldRow: {
    flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fieldIcon: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  fieldText: { flex: 1, minWidth: 0 },
  fieldTitle: { fontSize: 14.5, fontFamily: 'Poppins_500Medium' },
  fieldSub: { fontSize: 12, fontFamily: 'Poppins_400Regular' },
  addLink: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10 },
  addLinkText: { fontSize: 13.5, fontFamily: 'Poppins_600SemiBold' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  listIcon: { width: 42, height: 42, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  round: { borderRadius: 21 },
  initial: { fontSize: 16, fontFamily: 'Poppins_700Bold' },
  listText: { flex: 1, minWidth: 0 },
  listTitle: { fontSize: 15, fontFamily: 'Poppins_500Medium' },
  listSub: { fontSize: 12.5, fontFamily: 'Poppins_400Regular', marginTop: 1 },
  listRight: { alignItems: 'flex-end', flexShrink: 0, maxWidth: '45%' },
  listAmount: { fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  struck: { textDecorationLine: 'line-through' },
  dim: { opacity: 0.5 },
  empty: { paddingVertical: 14 },
  emptyText: { fontSize: 13.5, fontFamily: 'Poppins_400Regular' },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 14, padding: 12 },
  noteText: { flex: 1, fontSize: 13, fontFamily: 'Poppins_400Regular', lineHeight: 18.5 },
  pill: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9,
  },
  pillText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
  groupTitle: {
    fontSize: 12, fontFamily: 'Poppins_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.6,
    marginBottom: 8, marginTop: 22, marginLeft: 4,
  },
  group: { borderRadius: 18, paddingHorizontal: 14 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingVertical: 8 },
  setIcon: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  setText: { flex: 1, minWidth: 0 },
  setLabel: { fontSize: 14.5, fontFamily: 'Poppins_500Medium' },
  setSub: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 1 },
  setValue: { fontSize: 13, fontFamily: 'Poppins_400Regular', maxWidth: '45%' },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, borderRadius: 16, padding: 12, minWidth: 0 },
  tileValue: { fontSize: 18, fontFamily: 'Poppins_700Bold', letterSpacing: -0.3 },
  tileLabel: { fontSize: 11.5, fontFamily: 'Poppins_400Regular', marginTop: 1 },
  stack: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2 },
  legend: { marginTop: 12, gap: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 3 },
  legendLabel: { flex: 1, fontSize: 13.5, fontFamily: 'Poppins_400Regular' },
  legendValue: { fontSize: 13.5, fontFamily: 'Poppins_600SemiBold' },
  legendPct: { width: 40, textAlign: 'right', fontSize: 12.5, fontFamily: 'Poppins_400Regular' },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7 },
  rankPos: { width: 26, height: 26, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  rankPosText: { fontSize: 12, fontFamily: 'Poppins_700Bold' },
  rankMid: { flex: 1, minWidth: 0, gap: 4 },
  rankTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  rankLabel: { flex: 1, fontSize: 14, fontFamily: 'Poppins_500Medium' },
  rankValue: { fontSize: 14, fontFamily: 'Poppins_600SemiBold' },
  rankTrack: { height: 5, borderRadius: 3, overflow: 'hidden' },
  rankFill: { height: 5, borderRadius: 3 },
  rankSub: { fontSize: 11.5, fontFamily: 'Poppins_400Regular' },
  dayBars: { flexDirection: 'row', height: 96, gap: 2 },
  dayTouch: { flex: 1 },
  dayCol: { flex: 1 },
  dayHalf: { flex: 1, alignItems: 'center' },
  dayUp: { justifyContent: 'flex-end', borderBottomWidth: StyleSheet.hairlineWidth },
  dayBar: { width: '78%', maxWidth: 9 },
  dayBarUp: { borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  dayBarDown: { borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  dayLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  dayLabel: { fontSize: 11, fontFamily: 'Poppins_400Regular' },
  cols: { flexDirection: 'row', height: 72, gap: 5, alignItems: 'flex-end' },
  colWrap: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  col: { width: '100%', maxWidth: 22, borderTopLeftRadius: 5, borderTopRightRadius: 5 },
  colLabels: { flexDirection: 'row', gap: 5, marginTop: 5 },
  colLabel: { flex: 1, textAlign: 'center', fontSize: 10, fontFamily: 'Poppins_400Regular' },
});
