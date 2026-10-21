import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { IconName } from '../../components/common/Icon';
import { Chip } from './kit';

export type TypeOption = { id: string; name: string; icon: string; archived?: boolean };

const PAD = 20;

/**
 * Los tipos de gasto en dos filas que se deslizan, en el orden que se le pase
 * (el de uso: el más usado arriba a la izquierda, el segundo debajo, y así).
 * Al abrir la ventana vuelve al principio; si el elegido no se ve (al editar
 * un gasto, o al elegir un proveedor con su tipo), se desliza hasta él.
 */
export const TypePicker = ({
  types, selectedId, onSelect, resetKey,
}: {
  types: TypeOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** Al cambiar, vuelve al principio de las filas (al abrir la ventana) */
  resetKey?: unknown;
}) => {
  const scrollRef = useRef<ScrollView>(null);
  // Dónde está cada tipo dentro de su fila, y la parte que se ve
  const spots = useRef<Record<string, { x: number; width: number }>>({});
  const view = useRef({ x: 0, width: 0 });
  // El que hay que enseñar en cuanto se sepa dónde está
  const pending = useRef<string | null>(null);

  const reveal = (id: string, animated: boolean): boolean => {
    const spot = spots.current[id];
    if (!spot || !view.current.width) return false;
    const left = PAD + spot.x;
    if (left >= view.current.x && left + spot.width <= view.current.x + view.current.width) return true;
    const x = Math.max(0, left - PAD);
    scrollRef.current?.scrollTo({ x, animated });
    view.current.x = x;
    return true;
  };
  const revealPending = () => {
    if (pending.current && reveal(pending.current, false)) pending.current = null;
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ x: 0, animated: false });
    view.current.x = 0;
  }, [resetKey]);

  useEffect(() => {
    pending.current = reveal(selectedId, true) ? null : selectedId;
  }, [selectedId, resetKey]);

  const rows = [types.filter((_, i) => i % 2 === 0), types.filter((_, i) => i % 2 === 1)];

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="always"
      style={styles.bleed}
      contentContainerStyle={styles.content}
      scrollEventThrottle={32}
      onScroll={(e) => { view.current.x = e.nativeEvent.contentOffset.x; }}
      onLayout={(e) => { view.current.width = e.nativeEvent.layout.width; revealPending(); }}
    >
      <View style={styles.rows}>
        {rows.map((row, r) => (row.length ? (
          <View key={r} style={styles.row}>
            {row.map((x) => (
              <View
                key={x.id}
                onLayout={(e) => {
                  const { x: left, width } = e.nativeEvent.layout;
                  spots.current[x.id] = { x: left, width };
                  if (pending.current === x.id) revealPending();
                }}
              >
                <Chip
                  label={x.name}
                  icon={x.icon as IconName}
                  selected={x.id === selectedId}
                  onPress={() => onSelect(x.id)}
                  style={x.archived ? styles.archived : undefined}
                />
              </View>
            ))}
          </View>
        ) : null))}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  bleed: { marginHorizontal: -PAD },
  content: { paddingHorizontal: PAD },
  rows: { gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  archived: { opacity: 0.55 },
});
