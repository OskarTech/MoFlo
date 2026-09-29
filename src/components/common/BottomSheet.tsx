import React, { useEffect, useRef, useState } from 'react';
import {
  View, StyleSheet, Modal, Animated, PanResponder, Keyboard, Platform, LayoutAnimation,
  TouchableOpacity, TouchableWithoutFeedback, ScrollView, Dimensions,
  ActivityIndicator, StyleProp, ViewStyle, TextInput, TextInputProps,
} from 'react-native';
import { Text } from 'react-native-paper';
import Icon, { IconName } from './Icon';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';

interface Props {
  visible: boolean;
  /** Cerrar: la X, tocar fuera, deslizar hacia abajo o el botón atrás de Android */
  onClose: () => void;
  /** Cuando ya se ha cerrado del todo (en iOS, cuando el Modal ha desaparecido) */
  onClosed?: () => void;
  /**
   * Flecha para volver a la vista anterior de la misma ventana (p. ej. del
   * selector de color al formulario). El botón atrás de Android hace lo mismo.
   */
  onBack?: () => void;
  title?: string;
  subtitle?: string;
  /** Junto al título, p. ej. un icono de información */
  titleAccessory?: React.ReactNode;
  children: React.ReactNode;
  /** Abajo y siempre a la vista, p. ej. el botón de guardar */
  footer?: React.ReactNode;
  scrollable?: boolean;
  /** Fracción de la pantalla que puede ocupar como mucho */
  maxHeight?: number;
  bodyStyle?: StyleProp<ViewStyle>;
}

const CLOSE_DISTANCE = 90;

// Hueco que queda arriba cuando el teclado hace subir la ventana (iOS)
const KEYBOARD_TOP_GAP = 12;

/**
 * Ventana que sube desde abajo, igual en toda la app: asa, título a la
 * izquierda y X a la derecha. Se cierra con la X, tocando fuera, deslizando
 * hacia abajo desde arriba o con el botón atrás. Sube con el teclado para que
 * el botón de guardar quede siempre a la vista.
 */
const BottomSheet = ({
  visible, onClose, onClosed, onBack, title, subtitle, titleAccessory, children, footer,
  scrollable = true, maxHeight = 0.9, bodyStyle,
}: Props) => {
  const { t } = useTranslation();
  const { ui, colors: dc } = useTheme();
  const insets = useSafeAreaInsets();
  const screenH = Dimensions.get('window').height;

  const [mounted, setMounted] = useState(visible);
  // Lo que ha subido la ventana con el teclado (iOS); 0 sin teclado
  const [keyboardLift, setKeyboardLift] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;
  const drag = useRef(new Animated.Value(0)).current;
  const keyboardOffset = useRef(new Animated.Value(0)).current;

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      drag.setValue(0);
      progress.setValue(0);
      Animated.spring(progress, {
        toValue: 1, useNativeDriver: true, damping: 22, stiffness: 240, mass: 0.9,
      }).start();
    } else if (mounted) {
      Animated.timing(progress, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
        setMounted(false);
        // En iOS lo avisa el Modal al terminar de cerrarse (onDismiss)
        if (Platform.OS !== 'ios') onClosedRef.current?.();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir o cerrar
  }, [visible]);

  // Sube con el teclado (mismos valores que usaban las ventanas antiguas)
  useEffect(() => {
    if (!mounted) return;
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => {
      const lift = Platform.OS === 'ios'
        ? e.endCoordinates.height - insets.bottom
        : e.endCoordinates.height;
      Animated.timing(keyboardOffset, {
        toValue: -lift,
        duration: Platform.OS === 'ios' ? (e.duration ?? 250) : 200,
        useNativeDriver: true,
      }).start();
      // iOS: la ventana no pasa de lo que queda entre el teclado y la parte de
      // arriba; el cuerpo se encoge y se desplaza. Antes subía entera y en
      // pantallas bajas (iPhone SE) el título, la X y hasta el importe se
      // salían por arriba. Al ritmo del teclado, como KeyboardAvoidingView
      if (Platform.OS === 'ios') {
        LayoutAnimation.configureNext({
          duration: Math.max(10, e.duration || 250),
          update: { type: LayoutAnimation.Types.keyboard },
        });
        setKeyboardLift(lift);
      }
    });
    const hide = Keyboard.addListener(hideEvent, (e) => {
      Animated.timing(keyboardOffset, { toValue: 0, duration: 200, useNativeDriver: true }).start();
      if (Platform.OS === 'ios') {
        LayoutAnimation.configureNext({
          duration: Math.max(10, e.duration || 200),
          update: { type: LayoutAnimation.Types.keyboard },
        });
        setKeyboardLift(0);
      }
    });
    return () => {
      show.remove();
      hide.remove();
      keyboardOffset.setValue(0);
      setKeyboardLift(0);
    };
  }, [mounted, keyboardOffset, insets.bottom]);

  // Deslizar hacia abajo desde el asa o el título
  const pan = useRef(
    PanResponder.create({
      // Se queda con el toque desde el principio: esperando a que el dedo se
      // mueva, dentro de la ventana (Modal) de Android el gesto no llegaba.
      // La X, que está dentro, sigue recibiendo sus toques.
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => drag.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy > CLOSE_DISTANCE || g.vy > 1) {
          Keyboard.dismiss();
          onCloseRef.current();
          // Si no se ha cerrado (p. ej. mientras guarda), vuelve a su sitio
          setTimeout(() => {
            if (visibleRef.current) {
              Animated.spring(drag, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
            }
          }, 60);
        } else {
          Animated.spring(drag, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(drag, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
      },
    }),
  ).current;

  // Con el teclado abierto (iOS), el alto que cabe por encima de él. Solo si el
  // cuerpo se desplaza: uno fijo no encoge y el botón se quedaría debajo
  const sheetMaxHeight = scrollable && keyboardLift > 0
    ? Math.min(screenH * maxHeight, screenH - keyboardLift - insets.top - KEYBOARD_TOP_GAP)
    : screenH * maxHeight;

  const slide = progress.interpolate({ inputRange: [0, 1], outputRange: [screenH, 0] });
  const translateY = Animated.add(Animated.add(slide, drag), keyboardOffset);

  const Body = scrollable ? ScrollView : View;
  const bodyProps = scrollable
    ? {
        keyboardShouldPersistTaps: 'handled' as const,
        showsVerticalScrollIndicator: false,
        style: styles.bodyScroll,
        contentContainerStyle: [styles.body, bodyStyle],
      }
    : { style: [styles.body, bodyStyle] };

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onBack ?? onClose}
      onDismiss={() => onClosedRef.current?.()}
    >
      <TouchableWithoutFeedback onPress={onClose} accessible={false}>
        <Animated.View style={[styles.backdrop, { opacity: progress }]} />
      </TouchableWithoutFeedback>

      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: ui.sheet,
            maxHeight: sheetMaxHeight,
            transform: [{ translateY }],
          },
        ]}
      >
        <View {...pan.panHandlers}>
          <View style={[styles.grab, { backgroundColor: ui.hair2 }]} />
          {(title || subtitle) ? (
            <View style={styles.header}>
              {onBack ? (
                <TouchableOpacity
                  style={[styles.close, { backgroundColor: ui.fill }]}
                  onPress={onBack}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.back')}
                >
                  <Icon name="arrow-back" size={18} color={dc.textSecondary} />
                </TouchableOpacity>
              ) : null}
              <View style={styles.headerText}>
                <View style={styles.titleRow}>
                  {title ? (
                    <Text style={[styles.title, { color: dc.textPrimary }]} numberOfLines={2}>{title}</Text>
                  ) : null}
                  {titleAccessory}
                </View>
                {subtitle ? (
                  <Text style={[styles.subtitle, { color: dc.textSecondary }]}>{subtitle}</Text>
                ) : null}
              </View>
              <TouchableOpacity
                style={[styles.close, { backgroundColor: ui.fill }]}
                onPress={onClose}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
              >
                <Icon name="close" size={18} color={dc.textSecondary} />
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        <Body {...bodyProps}>{children}</Body>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>{footer}</View>
      </Animated.View>
    </Modal>
  );
};

/** Botón principal de las ventanas: ancho, con el color de la paleta */
export const SheetButton = ({
  label, onPress, disabled, loading, variant = 'primary', icon, style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'danger';
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) => {
  const { colors: dc, ui } = useTheme();
  const bg = variant === 'danger' ? ui.expenseText : dc.primary;
  return (
    <TouchableOpacity
      style={[styles.button, { backgroundColor: bg }, (disabled || loading) && styles.buttonDisabled, style]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading) }}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <>
          {icon && <Icon name={icon} size={19} color="#FFFFFF" />}
          <Text style={styles.buttonText}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
};

export interface SegmentOption<T extends string> {
  key: T;
  label: string;
  icon?: IconName;
  /** Color del texto cuando está elegido (p. ej. verde para ingreso) */
  activeColor?: string;
}

/** Control de dos o tres opciones (Gasto / Ingreso, Añadir / Sacar...) */
export const SegmentedControl = <T extends string>({
  options, value, onChange, style,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (key: T) => void;
  style?: StyleProp<ViewStyle>;
}) => {
  const { colors: dc, ui } = useTheme();
  return (
    <View style={[styles.segment, { backgroundColor: ui.fill2 }, style]}>
      {options.map((o) => {
        const on = o.key === value;
        const color = on ? (o.activeColor ?? dc.textPrimary) : dc.textSecondary;
        return (
          <TouchableOpacity
            key={o.key}
            style={[styles.segmentItem, on && [styles.segmentOn, { backgroundColor: ui.sheetRaised }]]}
            onPress={() => onChange(o.key)}
            activeOpacity={0.8}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
          >
            {o.icon && <Icon name={o.icon} size={15} color={color} />}
            <Text style={[styles.segmentText, { color }]} numberOfLines={1}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

/** Campo con relleno suave y sin borde; el activo se marca con el color de la paleta */
export const FilledInput = React.forwardRef<TextInput, TextInputProps & {
  icon?: IconName;
  containerStyle?: StyleProp<ViewStyle>;
  /** A la derecha del campo, p. ej. el ojo para ver la contraseña */
  right?: React.ReactNode;
}>(({ icon, containerStyle, right, style, onFocus, onBlur, ...props }, ref) => {
  const { colors: dc, ui } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={[
        styles.field,
        { backgroundColor: ui.field, borderColor: focused ? ui.accent : 'transparent' },
        containerStyle,
      ]}
    >
      {icon && <Icon name={icon} size={18} color={dc.textSecondary} />}
      <TextInput
        ref={ref}
        placeholderTextColor={dc.textSecondary}
        selectionColor={ui.accent}
        style={[styles.fieldInput, { color: dc.textPrimary }, style]}
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); onBlur?.(e); }}
        {...props}
      />
      {right}
    </View>
  );
});
FilledInput.displayName = 'FilledInput';

/** Etiqueta pequeña encima de un grupo de la ventana ("Categoría", "Icono"...) */
export const SheetLabel = ({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) => {
  const { colors: dc } = useTheme();
  return (
    <View style={[styles.labelWrap, style]}>
      <Text style={[styles.label, { color: dc.textSecondary }]}>{children}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.46)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    elevation: 16, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 20,
    shadowOffset: { width: 0, height: -6 },
  },
  grab: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginTop: 10, marginBottom: 12 },
  header: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingHorizontal: 20, marginBottom: 14,
  },
  headerText: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 21, fontFamily: 'Poppins_700Bold', letterSpacing: -0.4, flexShrink: 1 },
  subtitle: { fontSize: 13, fontFamily: 'Poppins_400Regular', marginTop: 2 },
  close: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  bodyScroll: { flexGrow: 0, flexShrink: 1 },
  body: { paddingHorizontal: 20 },
  footer: { paddingHorizontal: 20, paddingTop: 12 },
  button: {
    height: 52, borderRadius: 16, flexDirection: 'row', gap: 8,
    justifyContent: 'center', alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontFamily: 'Poppins_600SemiBold' },
  segment: { flexDirection: 'row', borderRadius: 14, padding: 3 },
  segmentItem: {
    flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 9, borderRadius: 11,
  },
  segmentOn: {
    elevation: 1, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  segmentText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold' },
  field: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 14,
    minHeight: 50,
  },
  fieldInput: { flex: 1, fontSize: 15, fontFamily: 'Poppins_400Regular', paddingVertical: 12 },
  labelWrap: { marginTop: 18, marginBottom: 8 },
  label: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
});

export default BottomSheet;
