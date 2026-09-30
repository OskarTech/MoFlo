import type { ComponentType } from 'react';
import { Platform, type ViewProps } from 'react-native';
import { requireNativeView, requireOptionalNativeModule } from 'expo';

export type ImeChangeEvent = { nativeEvent: { height: number } };

type Props = ViewProps & { onImeChange: (e: ImeChangeEvent) => void };

/**
 * Solo Android (ver ImeHeightView.kt): avisa del alto del teclado cada vez que
 * cambia. En iOS no existe, y tampoco en una build de Android anterior a él:
 * ahí es null y quien lo use sigue con los avisos de React Native.
 */
export const ImeHeightView: ComponentType<Props> | null =
  Platform.OS === 'android' && requireOptionalNativeModule('ImeHeight') != null
    ? requireNativeView<Props>('ImeHeight')
    : null;
