import React from 'react';
import { TouchableOpacity, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';

interface Props {
  onPress: () => void;
}

const AddTabButton = ({ onPress }: Props) => {
  const insets = useSafeAreaInsets();
  const { colors: dc } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.container, { marginBottom: insets.bottom / 2 }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={[styles.button, { backgroundColor: dc.primary, shadowColor: dc.primary }]}>
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    top: -16, // Eleva el botón sobre la barra
  },
  button: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
});

export default AddTabButton;