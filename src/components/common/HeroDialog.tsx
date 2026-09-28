import React, { useRef, useState } from 'react';
import {
  View, StyleSheet, Modal, TouchableOpacity, LayoutChangeEvent, ScrollView, useWindowDimensions,
} from 'react-native';
import { Text } from 'react-native-paper';
import Icon, { IconName } from './Icon';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { HeroGlow } from '../layout/HeroScreen';

// Hueco entre la ventana y los bordes de la pantalla
const GAP = 22;

interface Props {
  visible: boolean;
  /** Botón atrás de Android */
  onRequestClose: () => void;
  /** Con esto se ve la X y se cierra tocando fuera */
  onClose?: () => void;
  /** La X, desactivada (p. ej. mientras se compra) */
  closeDisabled?: boolean;
  icon: IconName;
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
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.width || height !== size.height) setSize({ width, height });
  };

  // En móviles pequeños la ventana no cabe entera: no pasa de la zona segura,
  // la cabecera se queda fija (con la X a la vista) y lo de debajo se desplaza
  const maxHeight = screenH - insets.top - insets.bottom - GAP * 2;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onRequestClose}>
      <View style={[styles.overlay, { paddingTop: insets.top + GAP, paddingBottom: insets.bottom + GAP }]}>
        {onClose ? (
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} accessible={false} />
        ) : null}
        <View style={[styles.card, { backgroundColor: ui.sheet, maxHeight }]}>
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
                <Icon name="close" size={18} color={ui.onHero} />
              </TouchableOpacity>
            ) : null}
            <View style={styles.iconCircle}>
              <Icon name={icon} size={30} color={ui.hero} />
            </View>
            <Text style={[styles.title, { color: ui.onHero }]}>{title}</Text>
            {heroExtra}
          </View>
          <ScrollView
            ref={scrollRef}
            style={styles.bodyScroll}
            contentContainerStyle={styles.body}
            alwaysBounceVertical={false}
            persistentScrollbar
            // Si no cabe, la barra de desplazamiento se ve un momento para avisar
            onContentSizeChange={() => scrollRef.current?.flashScrollIndicators()}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: GAP,
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
  // Crece con su contenido y encoge si la ventana llega al alto máximo
  bodyScroll: { flexGrow: 0, flexShrink: 1 },
  body: { padding: 22 },
});

export default HeroDialog;
