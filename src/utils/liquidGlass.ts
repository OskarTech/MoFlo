import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';

/**
 * El cristal del sistema (Liquid Glass) existe en iOS 26 o posterior. Es un
 * módulo nativo (expo-glass-effect): una build anterior a él no lo trae, así
 * que primero se mira que exista. Sin él, la barra de abajo sigue como antes y
 * Ajustes no enseña la opción.
 */
export const LIQUID_GLASS_AVAILABLE =
  Platform.OS === 'ios' &&
  requireOptionalNativeModule('ExpoGlassEffect') != null &&
  isLiquidGlassAvailable() &&
  isGlassEffectAPIAvailable();
