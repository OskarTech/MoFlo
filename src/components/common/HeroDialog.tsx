import React, { useState } from 'react';
import { View, StyleSheet, Modal, TouchableOpacity, LayoutChangeEvent } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/useTheme';
import { HeroGlow } from '../layout/HeroScreen';

interface Props {
  visible: boolean;
  /** Botón atrás de Android */
  onRequestClose: () => void;
  /** Con esto se ve la X y se cierra tocando fuera */
  onClose?: () => void;
  /** La X, desactivada (p. ej. mientras se compra) */
  closeDisabled?: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  /** Debajo del título, en la cabecera (p. ej. el precio o la versión) */
  heroExtra?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Ventana centrada con la cabecera de color de la app, como las pantallas:
 * icono en un círculo blanco, título y, debajo, su contenido. Para avisos que
 * no son formularios (Premium, versión nueva).
 */
const HeroDialog = ({
  visible, onRequestClose, onClose, closeDisabled, icon, title, heroExtra, children,
}: Props) => {
  const { t } = useTranslation();
  const { ui } = useTheme();
  const [size, setSize] = useState({ width: 0, height: 0 });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.width || height !== size.height) setSize({ width, height });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onRequestClose}>
      <View style={styles.overlay}>
        {onClose ? (
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} accessible={false} />
        ) : null}
        <View style={[styles.card, { backgroundColor: ui.sheet }]}>
          <View style={styles.hero} onLayout={onLayout}>
            <HeroGlow width={size.width} height={size.height} />
            {onClose ? (
              <TouchableOpacity
                style={[styles.close, { backgroundColor: ui.heroFill }, closeDisabled && styles.disabled]}
                onPress={onClose}
                disabled={closeDisabled}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
              >
                <Ionicons name="close" size={18} color={ui.onHero} />
              </TouchableOpacity>
            ) : null}
            <View style={styles.iconCircle}>
              <Ionicons name={icon} size={30} color={ui.hero} />
            </View>
            <Text style={[styles.title, { color: ui.onHero }]}>{title}</Text>
            {heroExtra}
          </View>
          <View style={styles.body}>{children}</View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1, justifyContent: 'center', alignItems: 'center', padding: 22,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  card: {
    width: '100%', maxWidth: 440, borderRadius: 28, overflow: 'hidden',
    elevation: 12, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 24, shadowOffset: { width: 0, height: 10 },
  },
  hero: { alignItems: 'center', paddingTop: 26, paddingBottom: 22, paddingHorizontal: 22 },
  close: {
    position: 'absolute', top: 14, right: 14, width: 34, height: 34, borderRadius: 17,
    justifyContent: 'center', alignItems: 'center',
  },
  disabled: { opacity: 0.4 },
  iconCircle: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: '#FFFFFF',
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  title: { fontSize: 22, fontFamily: 'Poppins_700Bold', letterSpacing: -0.4, textAlign: 'center' },
  body: { padding: 22 },
});

export default HeroDialog;
