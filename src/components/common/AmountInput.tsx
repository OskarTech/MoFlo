import React, { useState, forwardRef } from 'react';
import { View, StyleSheet, TextInput, Text as RNText } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { symbolGoesBefore } from '../../utils/formatAmount';

interface Props {
  value: string;
  onChangeText: (v: string) => void;
  currencySymbol: string;
  placeholder?: string;
  autoFocus?: boolean;
  /** Color de la cifra (por defecto, el del texto) */
  color?: string;
}

const FONT_SIZE = 44;
const SYMBOL_GAP = 10;

/**
 * Importe en grande y centrado, con su símbolo (delante o detrás según la
 * moneda), como en las ventanas de añadir. La cifra se escribe en un campo que
 * ocupa todo el ancho; debajo, un texto invisible con lo mismo empuja el
 * símbolo a su sitio.
 *
 * Antes el campo medía lo escrito y se ensanchaba un instante después de cada
 * dígito: en ese instante la cifra no cabía y se veía cortada, parpadeando.
 */
const AmountInput = forwardRef<TextInput, Props>(({
  value, onChangeText, currencySymbol, placeholder = '0', autoFocus, color,
}, ref) => {
  const { colors: dc, ui } = useTheme();
  // Para centrar la cifra junto con su símbolo, el campo deja a ese lado el
  // hueco del símbolo. Al principio se estima; luego, el ancho real
  const [symbolWidth, setSymbolWidth] = useState(() => currencySymbol.length * 17);
  // Delante en las monedas que lo llevan así ($), detrás en el resto (€)
  const before = symbolGoesBefore(currencySymbol);
  const symbolGap = symbolWidth + SYMBOL_GAP;

  const symbol = (
    <RNText
      style={[styles.symbol, before ? styles.symbolBefore : styles.symbolAfter, { color: dc.textSecondary }]}
      onLayout={(e) => setSymbolWidth(e.nativeEvent.layout.width)}
    >
      {currencySymbol}
    </RNText>
  );

  return (
    <View style={styles.row}>
      {before && symbol}
      <RNText style={[styles.amount, styles.ghost]} numberOfLines={1}>
        {value || placeholder}
      </RNText>
      {!before && symbol}
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        placeholder={placeholder}
        placeholderTextColor={ui.hair2}
        selectionColor={ui.accent}
        autoFocus={autoFocus}
        maxLength={12}
        style={[
          styles.amount, styles.input,
          { color: color ?? dc.textPrimary },
          before ? { paddingLeft: symbolGap } : { paddingRight: symbolGap },
        ]}
      />
    </View>
  );
});
AmountInput.displayName = 'AmountInput';

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, minHeight: 84,
  },
  amount: { fontSize: FONT_SIZE, fontFamily: 'Poppins_700Bold', letterSpacing: -1.2 },
  ghost: { opacity: 0, flexShrink: 1 },
  input: { ...StyleSheet.absoluteFillObject, padding: 0, margin: 0, textAlign: 'center' },
  symbol: { fontSize: 26, fontFamily: 'Poppins_600SemiBold', marginTop: 6 },
  symbolAfter: { marginLeft: SYMBOL_GAP },
  symbolBefore: { marginRight: SYMBOL_GAP },
});

export default AmountInput;
