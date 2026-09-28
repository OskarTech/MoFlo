import { requireOptionalNativeModule } from 'expo';

/* eslint-disable @typescript-eslint/no-require-imports -- se cargan al usarlos: una build anterior a ellos no trae los módulos nativos y cargarlos arriba rompería el arranque */

type ImagePickerModule = typeof import('expo-image-picker');
type ManipulatorModule = typeof import('expo-image-manipulator');
type StorageModule = typeof import('@react-native-firebase/storage').default;

// Lado de la foto guardada: basta para el avatar más grande y pesa unos 50 KB
const PHOTO_SIZE = 512;

/**
 * Elegir foto necesita tres módulos nativos (galería, recorte y Storage). Con
 * una build anterior a ellos no se ofrece cambiar la foto; las que ya tengan
 * otros miembros se siguen viendo, porque solo son enlaces.
 */
export const PHOTOS_AVAILABLE =
  requireOptionalNativeModule('ExponentImagePicker') != null
  && requireOptionalNativeModule('ExpoImageManipulator') != null;

const storage = (): ReturnType<StorageModule> =>
  (require('@react-native-firebase/storage').default as StorageModule)();

// Carpetas en Storage: una por usuario y una por cuenta compartida
export const userPhotoFolder = (uid: string) => `users/${uid}`;
export const sharedPhotoFolder = (accountId: string) => `sharedAccounts/${accountId}`;

/**
 * Abre la galería (sin pedir permiso: es el selector del sistema) y devuelve la
 * foto elegida, cuadrada y reducida, lista para subir. null si se cancela.
 */
export const pickPhoto = async (): Promise<string | null> => {
  const ImagePicker = require('expo-image-picker') as ImagePickerModule;
  const { ImageManipulator, SaveFormat } = require('expo-image-manipulator') as ManipulatorModule;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  const asset = result.canceled ? undefined : result.assets?.[0];
  if (!asset) return null;

  // El recorte del sistema no siempre deja un cuadrado exacto: se centra aquí
  const side = Math.min(asset.width, asset.height);
  const image = await ImageManipulator.manipulate(asset.uri)
    .crop({
      originX: Math.floor((asset.width - side) / 2),
      originY: Math.floor((asset.height - side) / 2),
      width: side,
      height: side,
    })
    .resize({ width: Math.min(side, PHOTO_SIZE) })
    .renderAsync();
  const saved = await image.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
  return saved.uri;
};

/**
 * Sube la foto a la carpeta y devuelve su enlace. Cada foto lleva un nombre
 * nuevo, así el enlace cambia y nadie sigue viendo la anterior en caché; las
 * anteriores de la carpeta se borran después.
 */
export const uploadPhoto = async (folder: string, localUri: string): Promise<string> => {
  const ref = storage().ref(`${folder}/photo_${Date.now()}.jpg`);
  await ref.putFile(localUri, {
    contentType: 'image/jpeg',
    // El enlace no cambia nunca de contenido: los móviles la guardan y no la
    // vuelven a descargar
    cacheControl: 'public, max-age=31536000, immutable',
  });
  const url = await ref.getDownloadURL();
  deletePhotos(folder, ref.fullPath).catch(() => {});
  return url;
};

/** Borra las fotos de la carpeta, menos `keepPath` si se indica */
export const deletePhotos = async (folder: string, keepPath?: string): Promise<void> => {
  const { items } = await storage().ref(folder).listAll();
  await Promise.all(items.filter((item) => item.fullPath !== keepPath).map((item) => item.delete()));
};
