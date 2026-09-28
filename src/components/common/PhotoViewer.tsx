import React from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  visible: boolean;
  uri: string;
  /** Debajo de la foto: de quién es */
  title?: string;
  onClose: () => void;
}

/**
 * Foto a pantalla completa sobre fondo oscuro, para verla bien. Se cierra
 * tocando en cualquier sitio, con la X o con el botón atrás de Android.
 */
const PhotoViewer = ({ visible, uri, title, onClose }: Props) => {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Las fotos se guardan de 512 px: más grande se vería borrosa en tablets
  const size = Math.min(width - 40, 480);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
      >
        <View style={[styles.close, { top: insets.top + 12 }]}>
          <Ionicons name="close" size={24} color="#FFFFFF" />
        </View>
        <Image
          source={{ uri }}
          style={[styles.photo, { width: size, height: size }]}
          accessibilityIgnoresInvertColors
        />
        {!!title && <Text style={styles.title} numberOfLines={1}>{title}</Text>}
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20,
  },
  close: {
    position: 'absolute', right: 16, width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.16)', justifyContent: 'center', alignItems: 'center',
  },
  photo: { borderRadius: 24 },
  title: { color: '#FFFFFF', fontSize: 17, fontFamily: 'Poppins_600SemiBold', marginTop: 18 },
});

export default PhotoViewer;
