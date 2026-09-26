import React, { useState, forwardRef } from 'react';
import { View, StyleSheet, TextInput, TouchableWithoutFeedback, Text as RNText } from 'react-native';
import { useTheme } from '../../hooks/useTheme';

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

/**
 * Importe en grande y centrado, con el símbolo detrás, como en las ventanas
 * de añadir. El ancho del campo se ajusta a lo escrito midiéndolo con un
 * texto invisible: así queda igual de centrado en iOS y en Android.
 */
const AmountInput = forwardRef<TextInput, Props>(({
  value, onChangeText, currencySymbol, placeholder = '0', autoFocus, color,
}, ref) => {
  const { colors: dc, ui } = useTheme();
  const [textWidth, setTextWidth] = useState(0);
  const inputRef = React.useRef<TextInput | null>(null);

  const setRefs = (node: TextInput | null) => {
    inputRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  };

  return (
    <TouchableWithoutFeedback onPress={() => inputRef.current?.focus()} accessible={false}>
      <View style={styles.row}>
        {/* Medidor invisible con el mismo estilo que la cifra */}
        <RNText
          style={[styles.amount, styles.measure]}
          onLayout={(e) => setTextWidth(e.nativeEvent.layout.width)}
          numberOfLines={1}
        >
          {value || placeholder}
        </RNText>
        <TextInput
          ref={setRefs}
          value={value}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
          placeholder={placeholder}
          placeholderTextColor={ui.hair2}
          selectionColor={ui.accent}
          autoFocus={autoFocus}
          maxLength={12}
          style={[styles.amount, styles.input, { color: color ?? dc.textPrimary, width: Math.max(28, textWidth + 8) }]}
        />
        <RNText style={[styles.symbol, { color: dc.textSecondary }]}>{currencySymbol}</RNText>
      </View>
    </TouchableWithoutFeedback>
  );
});
AmountInput.displayName = 'AmountInput';

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, minHeight: 84,
  },
  amount: { fontSize: FONT_SIZE, fontFamily: 'Poppins_700Bold', letterSpacing: -1.2 },
  measure: { position: 'absolute', opacity: 0, left: 0, top: 0 },
  input: { padding: 0, margin: 0, textAlign: 'center' },
  symbol: { fontSize: 26, fontFamily: 'Poppins_600SemiBold', marginLeft: 6, marginTop: 6 },
});

export default AmountInput;
