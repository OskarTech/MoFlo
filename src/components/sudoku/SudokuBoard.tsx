import React, { memo, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import Svg, { Line, Rect } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/useTheme';
import { withAlpha } from '../../utils/color';
import { PEERS } from '../../utils/sudoku';

// En tabletas no crece más: con casillas enormes cuesta seguir las filas
const MAX_SIZE = 440;
const PEER_SETS = PEERS.map((peers) => new Set(peers));
const NINE = Array.from({ length: 9 }, (_, i) => i);

interface Props {
  /** Lo que se ve en cada casilla: la pista o el número puesto (0, vacía) */
  board: number[];
  /** Las casillas con pista, que no se pueden cambiar */
  givens: boolean[];
  /** Las casillas con un número repetido en su fila, columna o cuadro: lo puesto sale en rojo */
  conflicts: boolean[];
  selected: number | null;
  onSelect: (index: number) => void;
  /** Resuelto: ya no se elige ninguna casilla */
  locked?: boolean;
}

interface CellProps {
  index: number;
  digit: number;
  size: number;
  background: string;
  color: string;
  bold: boolean;
  label: string;
  isSelected: boolean;
  disabled: boolean;
  onSelect: (index: number) => void;
}

// Cada casilla solo se vuelve a dibujar si cambia algo suyo
const Cell = memo(({
  index, digit, size, background, color, bold, label, isSelected, disabled, onSelect,
}: CellProps) => (
  <Pressable
    style={[styles.cell, { width: size, height: size, backgroundColor: background }]}
    onPress={() => onSelect(index)}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ selected: isSelected, disabled }}
  >
    {digit ? (
      <Text
        style={[
          styles.digit,
          bold ? styles.given : styles.entry,
          { color, fontSize: Math.round(size * 0.5), lineHeight: Math.round(size * 0.72) },
        ]}
      >
        {digit}
      </Text>
    ) : null}
  </Pressable>
));
Cell.displayName = 'SudokuCell';

/**
 * El tablero de 9 × 9. Al elegir una casilla se marca ella y, muy suave, su
 * fila, su columna y su cuadro. Al poner un número solo cambia esa casilla:
 * las que tienen el mismo número no se marcan, y si se repite, sale en rojo
 * solo lo puesto, nunca la otra casilla (una pista no está mal). Las pistas
 * van en el color del texto y lo puesto, en el de la app. Las líneas (finas,
 * y gruesas entre cuadros) van en un Svg encima.
 */
const SudokuBoard = ({ board, givens, conflicts, selected, onSelect, locked = false }: Props) => {
  const { t } = useTranslation();
  const { colors: dc, ui } = useTheme();
  const [width, setWidth] = useState(0);

  // Casillas de un número entero de puntos: las líneas salen nítidas
  const cell = Math.floor(Math.min(width, MAX_SIZE) / 9);
  const size = cell * 9;
  const thin = ui.hair2;
  const thick = withAlpha(dc.textPrimary, 0.55);

  const backgroundOf = (i: number) => {
    if (selected === i) return withAlpha(ui.accent, 0.3);
    if (selected != null && PEER_SETS[selected].has(i)) return withAlpha(ui.accent, 0.07);
    return 'transparent';
  };
  const colorOf = (i: number) => {
    if (givens[i]) return dc.textPrimary;
    return conflicts[i] ? ui.expenseText : ui.accent;
  };

  return (
    <View style={styles.wrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {cell > 0 && (
        <View style={[styles.board, { width: size, height: size, backgroundColor: ui.sheet }]}>
          {NINE.map((row) => (
            <View key={row} style={styles.row}>
              {NINE.map((col) => {
                const i = row * 9 + col;
                return (
                  <Cell
                    key={col}
                    index={i}
                    digit={board[i]}
                    size={cell}
                    background={backgroundOf(i)}
                    color={colorOf(i)}
                    bold={givens[i]}
                    label={`${t('sudoku.cell', { row: row + 1, col: col + 1 })}: ${board[i] || t('sudoku.emptyCell')}`}
                    isSelected={selected === i}
                    disabled={locked}
                    onSelect={onSelect}
                  />
                );
              })}
            </View>
          ))}
          <Svg style={StyleSheet.absoluteFill} width={size} height={size} pointerEvents="none">
            {NINE.slice(1).map((k) => {
              const at = k * cell;
              const boxEdge = k % 3 === 0;
              const stroke = boxEdge ? thick : thin;
              const strokeWidth = boxEdge ? 2 : 1;
              return (
                <React.Fragment key={k}>
                  <Line x1={at} x2={at} y1={0} y2={size} stroke={stroke} strokeWidth={strokeWidth} />
                  <Line x1={0} x2={size} y1={at} y2={at} stroke={stroke} strokeWidth={strokeWidth} />
                </React.Fragment>
              );
            })}
            <Rect x={1} y={1} width={size - 2} height={size - 2} rx={11} fill="none" stroke={thick} strokeWidth={2} />
          </Svg>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', alignItems: 'center' },
  board: { borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row' },
  cell: { justifyContent: 'center', alignItems: 'center' },
  digit: { textAlign: 'center', includeFontPadding: false },
  given: { fontFamily: 'Poppins_600SemiBold' },
  entry: { fontFamily: 'Poppins_500Medium' },
});

export default SudokuBoard;
