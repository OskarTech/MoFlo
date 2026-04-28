import React from 'react';
import { View, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { COLOR_PALETTES, ColorPaletteId } from '../../theme';

export const PALETTE_ORDER: ColorPaletteId[] = [
  'green', 'blue', 'earth', 'mint', 'rose',
];

interface Props {
  visible: boolean;
  selectedPalette: ColorPaletteId;
  onSelect: (id: ColorPaletteId) => void;
  onDismiss: () => void;
}

const ColorPaletteModal = ({ visible, selectedPalette, onSelect, onDismiss }: Props) => {
  const { t } = useTranslation();
  const { colors: dc } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onDismiss} />
        <View style={[styles.sheet, {
          backgroundColor: dc.surface,
          paddingBottom: insets.bottom + 24,
        }]}>
          <View style={[styles.handle, { backgroundColor: dc.border }]} />
          <Text style={[styles.title, { color: dc.textPrimary }]}>
            {t('settings.selectColorPalette')}
          </Text>
          <View style={styles.grid}>
            {PALETTE_ORDER.map((id) => {
              const p = COLOR_PALETTES[id];
              const isSelected = selectedPalette === id;
              const label = t(`settings.palette${id.charAt(0).toUpperCase() + id.slice(1)}`);
              return (
                <TouchableOpacity
                  key={id}
                  style={styles.item}
                  onPress={() => { onSelect(id); onDismiss(); }}
                  activeOpacity={0.75}
                >
                  <View style={[
                    styles.circle,
                    { backgroundColor: p.primary },
                    isSelected && styles.circleSelected,
                  ]}>
                    {isSelected && <Ionicons name="checkmark" size={22} color="#FFFFFF" />}
                  </View>
                  <Text style={[styles.label, { color: dc.textSecondary }]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    alignSelf: 'center', marginBottom: 20,
  },
  title: { fontSize: 20, fontFamily: 'Poppins_700Bold', marginBottom: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'center' },
  item: { alignItems: 'center', gap: 6, width: 72 },
  circle: {
    width: 56, height: 56, borderRadius: 28,
    justifyContent: 'center', alignItems: 'center',
  },
  circleSelected: {
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.6)',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, elevation: 4,
  },
  label: { fontSize: 11, fontFamily: 'Poppins_400Regular', textAlign: 'center' },
});

export default ColorPaletteModal;
