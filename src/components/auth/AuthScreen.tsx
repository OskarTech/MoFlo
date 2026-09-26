import React, { useState } from 'react';
import {
  View, StyleSheet, KeyboardAvoidingView, Platform, TouchableOpacity, Image,
  ActivityIndicator, TextInputProps,
} from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { HeroScrollScreen } from '../layout/HeroScreen';
import { FilledInput } from '../common/BottomSheet';

/**
 * Pantallas de acceso (entrar, crear cuenta, recuperar contraseña): cabecera
 * de color y el formulario en la hoja de debajo, como el resto de la app.
 * Con el teclado, igual que antes: en Android la vista se encoge y en iOS el
 * desplazamiento deja sitio al teclado.
 */
export const AuthScreen = ({ hero, children }: { hero: React.ReactNode; children: React.ReactNode }) => {
  const insets = useSafeAreaInsets();
  const { ui } = useTheme();
  return (
    // Con fondo propio: al cerrar el teclado, Android puede dejar un momento un
    // hueco abajo y así no se ve el gris del navegador
    <KeyboardAvoidingView
      behavior="height"
      enabled={Platform.OS === 'android'}
      style={[styles.flex, { backgroundColor: ui.sheet }]}
    >
      <HeroScrollScreen
        hero={hero}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        sheetStyle={[styles.sheet, { paddingBottom: insets.bottom + 28 }]}
      >
        {children}
      </HeroScrollScreen>
    </KeyboardAvoidingView>
  );
};

/** Logo, nombre y lema, para la cabecera */
export const AuthBrand = ({ subtitle, compact }: { subtitle?: string; compact?: boolean }) => {
  const { ui } = useTheme();
  const size = compact ? 64 : 88;
  return (
    <View style={[styles.brand, compact && styles.brandCompact]}>
      <Image
        source={require('../../../assets/icon.png')}
        style={[styles.logo, { width: size, height: size, borderRadius: size * 0.26 }]}
        resizeMode="contain"
      />
      <Text style={[styles.appName, compact && styles.appNameCompact, { color: ui.onHero }]}>MoFlo</Text>
      {subtitle ? <Text style={[styles.brandSubtitle, { color: ui.onHeroSoft }]}>{subtitle}</Text> : null}
    </View>
  );
};

/** Contraseña con el ojo para verla */
export const PasswordInput = (props: TextInputProps) => {
  const { t } = useTranslation();
  const { colors: dc } = useTheme();
  const [visible, setVisible] = useState(false);
  return (
    <FilledInput
      icon="lock-closed-outline"
      secureTextEntry={!visible}
      autoCapitalize="none"
      {...props}
      right={(
        <TouchableOpacity
          onPress={() => setVisible((v) => !v)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={visible ? t('auth.hidePassword') : t('auth.showPassword')}
        >
          <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color={dc.textSecondary} />
        </TouchableOpacity>
      )}
    />
  );
};

/** Botón secundario a lo ancho (Google), con el relleno de los campos */
export const AuthSecondaryButton = ({
  label, icon, onPress, loading, disabled,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) => {
  const { colors: dc, ui } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.secondary, { backgroundColor: ui.field }, (disabled || loading) && styles.disabled]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      accessibilityRole="button"
    >
      {loading ? (
        <ActivityIndicator color={dc.textPrimary} />
      ) : (
        <>
          <Ionicons name={icon} size={19} color={dc.textPrimary} />
          <Text style={[styles.secondaryText, { color: dc.textPrimary }]}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
};

/** Línea con una "o" en medio, entre el formulario y las otras formas de entrar */
export const AuthDivider = () => {
  const { t } = useTranslation();
  const { colors: dc, ui } = useTheme();
  return (
    <View style={styles.divider}>
      <View style={[styles.dividerLine, { backgroundColor: ui.hair2 }]} />
      <Text style={[styles.dividerText, { color: dc.textSecondary }]}>{t('auth.or')}</Text>
      <View style={[styles.dividerLine, { backgroundColor: ui.hair2 }]} />
    </View>
  );
};

/** "¿No tienes cuenta? Crear cuenta" */
export const AuthSwitchLink = ({ text, action, onPress }: { text: string; action: string; onPress: () => void }) => {
  const { colors: dc, ui } = useTheme();
  return (
    <View style={styles.switchRow}>
      <Text style={[styles.switchText, { color: dc.textSecondary }]}>{text} </Text>
      <TouchableOpacity onPress={onPress} hitSlop={8} accessibilityRole="button">
        <Text style={[styles.switchAction, { color: ui.accent }]}>{action}</Text>
      </TouchableOpacity>
    </View>
  );
};

export const authStyles = StyleSheet.create({
  field: { marginBottom: 12 },
  error: { fontSize: 13, fontFamily: 'Poppins_400Regular', marginBottom: 8 },
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  sheet: { paddingHorizontal: 24, paddingTop: 28 },
  brand: { alignItems: 'center', paddingTop: 22, paddingHorizontal: 24 },
  brandCompact: { paddingTop: 8 },
  logo: { marginBottom: 12 },
  appName: { fontSize: 30, fontFamily: 'Poppins_700Bold', letterSpacing: 0.5 },
  appNameCompact: { fontSize: 24 },
  brandSubtitle: { fontSize: 14, fontFamily: 'Poppins_400Regular', marginTop: 2, textAlign: 'center' },
  secondary: {
    height: 52, borderRadius: 16, flexDirection: 'row', gap: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  secondaryText: { fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  disabled: { opacity: 0.5 },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 18 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { marginHorizontal: 12, fontSize: 13, fontFamily: 'Poppins_400Regular' },
  switchRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', marginTop: 22 },
  switchText: { fontSize: 14, fontFamily: 'Poppins_400Regular' },
  switchAction: { fontSize: 14, fontFamily: 'Poppins_600SemiBold' },
});
