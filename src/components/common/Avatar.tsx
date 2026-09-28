import React, { ReactNode, useState } from 'react';
import { Image, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import PhotoViewer from './PhotoViewer';

interface Props {
  /** Enlace a la foto (del usuario, de un miembro o de la cuenta compartida) */
  uri?: string | null;
  /** Tamaño, forma y colores: los de cada sitio donde se usa */
  style: StyleProp<ViewStyle>;
  /** Lo que se ve sin foto: la inicial o un icono */
  children: ReactNode;
  /** Si se indica, al tocar la foto se amplía, con este título debajo */
  zoomTitle?: string;
}

/**
 * Círculo (o cuadrado redondeado) con una foto. Sin foto, o si no carga
 * (borrada, o sin conexión y sin caché), enseña lo de siempre: `children`.
 */
const Avatar = ({ uri, style, children, zoomTitle }: Props) => {
  // Se guarda qué enlace falló: con una foto nueva se vuelve a intentar
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const showPhoto = !!uri && uri !== failedUri;
  // La foto lleva también el redondeo: en Android recortar solo el contenedor
  // no siempre redondea la imagen de dentro
  const { borderRadius } = StyleSheet.flatten(style) ?? {};

  const avatar = (
    <View style={[style, showPhoto && styles.clip]}>
      {showPhoto ? (
        <Image
          source={{ uri }}
          style={[StyleSheet.absoluteFill, { borderRadius }]}
          onError={() => setFailedUri(uri)}
          accessibilityIgnoresInvertColors
        />
      ) : children}
    </View>
  );

  if (!showPhoto || !uri || zoomTitle === undefined) return avatar;
  return (
    <>
      <Pressable onPress={() => setZoomed(true)} accessibilityRole="imagebutton" accessibilityLabel={zoomTitle}>
        {avatar}
      </Pressable>
      <PhotoViewer visible={zoomed} uri={uri} title={zoomTitle} onClose={() => setZoomed(false)} />
    </>
  );
};

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});

export default Avatar;
