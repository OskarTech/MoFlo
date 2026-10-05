import React, { useEffect, useRef, useState } from 'react';
import {
  View, StyleSheet, Modal, Animated, PanResponder, Keyboard, Platform,
  TouchableOpacity, TouchableWithoutFeedback, ScrollView, Dimensions,
  ActivityIndicator, StyleProp, ViewStyle, TextInput, TextInputProps,
  NativeScrollEvent, NativeSyntheticEvent, LayoutChangeEvent,
} from 'react-native';
import { Text } from 'react-native-paper';
import Icon, { IconName } from './Icon';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { ImeHeightView } from '../../../modules/ime-height';

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
  /**
   * Tocar un hueco de la ventana oculta el teclado. Por defecto no: solo se
   * oculta al cerrarla. Para ventanas con mucho que ver debajo del teclado
   */
  dismissKeyboardOnTap?: boolean;
  /** Fracción de la pantalla que puede ocupar como mucho */
  maxHeight?: number;
  bodyStyle?: StyleProp<ViewStyle>;
}

const CLOSE_DISTANCE = 90;

// Hueco que queda arriba cuando el teclado hace subir la ventana
const KEYBOARD_TOP_GAP = 12;

// Aire entre el campo en el que se escribe y el botón (o el teclado, si la
// ventana no tiene botón), al traerlo a la vista
const REVEAL_GAP = 12;

// Aire del pie: encima del botón y debajo de él, además de la barra de inicio
const FOOTER_TOP = 12;
const FOOTER_BOTTOM = 16;

// Lo que tarda la ventana en seguir al teclado cuando el sistema no da duración
const KEYBOARD_MS = 220;

// Android: espera antes de bajar la ventana al ocultarse el teclado. Al pasar
// de un campo de números a uno de texto hay teclados que se ocultan y vuelven
// a salir: sin la espera, la ventana bajaba y subía en un parpadeo
const ANDROID_HIDE_WAIT = 120;

/**
 * Ventana que sube desde abajo, igual en toda la app: asa, título a la
 * izquierda y X a la derecha. Se cierra con la X, tocando fuera, deslizando
 * hacia abajo desde arriba o con el botón atrás. Sube con el teclado para que
 * el botón de guardar quede siempre a la vista.
 *
 * Todo lo que se mueve lo hace por posición (transform), nunca cambiando el
 * alto de la ventana: animar el alto a la vez que la posición fallaba a veces
 * y la ventana se quedaba arriba, encogida, con el teclado ya cerrado.
 */
const BottomSheet = ({
  visible, onClose, onClosed, onBack, title, subtitle, titleAccessory, children, footer,
  scrollable = true, dismissKeyboardOnTap = false, maxHeight = 0.9, bodyStyle,
}: Props) => {
  const { t } = useTranslation();
  const { ui, colors: dc } = useTheme();
  const insets = useSafeAreaInsets();
  const screenH = Dimensions.get('window').height;

  const [mounted, setMounted] = useState(visible);
  // Lo que el teclado tapa de la ventana cuando esta ya no puede subir más:
  // el botón sube esa distancia y el cuerpo deja ese hueco al final
  const [overlap, setOverlap] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;
  const drag = useRef(new Animated.Value(0)).current;
  const keyboardOffset = useRef(new Animated.Value(0)).current;
  const footerOffset = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const sheetRef = useRef<View>(null);
  // Principio del contenido que se desplaza, y alto de su hueco en la ventana
  const contentTopRef = useRef<View>(null);
  const bodyHeight = useRef(0);
  // Alto del cuerpo cuando se dejó el hueco del teclado (overlap): mientras
  // está el hueco, el cuerpo se queda con ese alto. 0, sin hueco
  const lockedBodyHeight = useRef(0);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  // Sin botón no hay pie: su aire va al final del cuerpo (ver abajo)
  const hasFooterRef = useRef(!!footer);
  hasFooterRef.current = !!footer;
  // Alto de la ventana, para saber cuánto puede subir
  const sheetHeight = useRef(0);
  // Del efecto del teclado: bajar la ventana si está subida, y recolocarla si
  // cambia de alto con el teclado abierto
  const lowerRef = useRef<() => void>(() => {});
  const reflowRef = useRef<() => void>(() => {});
  // Android: alto de la ventana (Modal) en la que va, para saber cuánto puede
  // subir, y qué hacer cuando cambia el alto del teclado (ver ImeHeightView)
  const modalHeight = useRef(0);
  const imeRef = useRef<(height: number) => void>(() => {});

  useEffect(() => {
    if (visible) {
      setMounted(true);
      drag.setValue(0);
      progress.setValue(0);
      // Android: sale siempre abajo. Una animación de bajar con el teclado que
      // se cortaba al cerrarse devolvía después su valor (arriba) y la ventana
      // se abría la siguiente vez subida y sin teclado
      if (Platform.OS === 'android') {
        keyboardOffset.setValue(0);
        footerOffset.setValue(0);
      }
      // Sin rebote (amortiguación crítica): con rebote la ventana se pasaba
      // unos 24 puntos hacia arriba, dejaba ver un hueco debajo y volvía; en
      // las ventanas altas se notaba como una entrada brusca
      Animated.spring(progress, {
        toValue: 1, useNativeDriver: true, damping: 30, stiffness: 240, mass: 0.9,
      }).start();
    } else if (mounted) {
      // El teclado se va a la vez que la ventana. Antes seguía en pantalla
      // hasta que la ventana desaparecía y se cerraba después, por separado
      Keyboard.dismiss();
      Animated.timing(progress, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
        setMounted(false);
        // En iOS lo avisa el Modal al terminar de cerrarse (onDismiss)
        if (Platform.OS !== 'ios') onClosedRef.current?.();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir o cerrar
  }, [visible]);

  // Sube con el teclado
  useEffect(() => {
    if (!mounted) return;
    const ios = Platform.OS === 'ios';
    const showEvent = ios ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = ios ? 'keyboardWillHide' : 'keyboardDidHide';
    // Lo que pide el teclado que suba la ventana
    let target = 0;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    // Desplazamiento hecho para enseñar el campo: de dónde a dónde
    let revealed: { from: number; to: number } | null = null;

    // La ventana sube entera hasta donde cabe. Si no cabe (ventanas altas o
    // pantallas bajas como el iPhone SE o los Android 16:9), se queda con el
    // título a la vista y lo que falta lo sube solo el botón, por encima del
    // cuerpo, que se desplaza. Antes subía entera y el título, la X y hasta
    // el importe se salían por arriba. En Android se mide el alto de la
    // ventana en la que va: el de Dimensions puede no contar las barras
    const place = (duration: number) => {
      // Android: cerrándose no se mueve con el teclado, baja con la ventana.
      // Animándolo ahora, la animación se cortaba al cerrarse (ver arriba)
      if (!ios && !visibleRef.current) return;
      const available = ios ? screenH : (modalHeight.current || screenH);
      const room = Math.max(0, available - sheetHeight.current - insets.top - KEYBOARD_TOP_GAP);
      const shift = scrollable ? Math.min(target, room) : target;
      const covered = target - shift;
      Animated.parallel([
        Animated.timing(keyboardOffset, { toValue: -shift, duration, useNativeDriver: true }),
        Animated.timing(footerOffset, { toValue: -covered, duration, useNativeDriver: true }),
      ]).start();
      // El hueco del final solo da recorrido para desplazarse: el cuerpo se
      // queda con el alto que tenía. Si crecía con él, la ventana se hacía más
      // alta, se volvía a colocar con el alto nuevo (onLayout) y dejaba un
      // hueco mayor: las que no caben sobre el teclado (fijos, categorías)
      // subían a tirones hasta ocupar casi toda la pantalla
      if (covered === 0) lockedBodyHeight.current = 0;
      else if (lockedBodyHeight.current === 0) lockedBodyHeight.current = bodyHeight.current;
      setOverlap(covered);
      if (covered > 0) setTimeout(() => revealFocusedInput(covered), duration + 40);
      // Al irse el teclado, el contenido vuelve a donde estaba, salvo que
      // entretanto se haya desplazado a mano
      if (target === 0 && revealed) {
        if (Math.abs(scrollY.current - revealed.to) < 2) {
          scrollRef.current?.scrollTo({ y: revealed.from, animated: true });
        }
        revealed = null;
      }
    };

    // El campo en el que se escribe, a la vista si el botón lo tapa (pantallas
    // bajas, como el iPhone SE). Se mide dónde cae dentro del contenido, que
    // no depende de lo que se haya desplazado ni de lo que el botón y la
    // ventana hayan subido con el teclado: midiendo en la pantalla eso no se
    // contaba y el campo se quedaba debajo del botón
    const revealFocusedInput = (covered: number) => {
      const input = TextInput.State.currentlyFocusedInput();
      const scroll = scrollRef.current;
      const sheet = sheetRef.current;
      const contentTop = contentTopRef.current;
      if (!input || !scroll || !sheet || !contentTop) return;
      contentTop.measureLayout(sheet, (_cx, top) => {
        input.measureLayout(sheet, (_x, y, _w, height) => {
          // Lo que se ve del cuerpo: hasta el botón, que ha subido lo que tapa
          // el teclado. Sin botón, hasta el teclado, que tapa también la franja
          // de la barra de inicio (o la de navegación en Android): la ventana
          // sube el alto del teclado sin contarla
          const visibleBody = bodyHeight.current - covered - (hasFooterRef.current ? 0 : insets.bottom);
          // Desplazamiento con el que el campo queda justo encima
          const needed = y - top + height + REVEAL_GAP - visibleBody;
          if (needed > scrollY.current) {
            revealed = { from: revealed?.from ?? scrollY.current, to: needed };
            scroll.scrollTo({ y: needed, animated: true });
          }
        });
      });
    };

    const moveTo = (lift: number, duration: number) => {
      // iOS repite el aviso al pasar de un campo a otro con el mismo teclado
      if (lift === target) return;
      target = lift;
      place(duration);
    };
    reflowRef.current = () => { if (target > 0) place(150); };
    lowerRef.current = () => moveTo(0, 200);

    const show = Keyboard.addListener(showEvent, (e) => {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      const lift = ios ? e.endCoordinates.height - insets.bottom : e.endCoordinates.height;
      // Al cambiar de teclado (de números a letras) iOS da duración 0. Con 0
      // la ventana no llegaba a moverse y el botón quedaba tapado por el
      // teclado nuevo, más alto; y moverla de golpe se ve como un salto
      moveTo(lift, ios ? (e.duration || KEYBOARD_MS) : 200);
    });
    const hide = Keyboard.addListener(hideEvent, () => {
      if (ios) { moveTo(0, 200); return; }
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => { hideTimer = null; moveTo(0, 200); }, ANDROID_HIDE_WAIT);
    });
    // Android 11 o posterior: React Native no avisa si el teclado cambia de
    // alto sin ocultarse (del importe, con números, a la nota, con letras y
    // sugerencias, más alto), y el botón quedaba medio tapado. Este aviso sale
    // de la propia ventana cada vez que cambia. Solo con el teclado ya abierto:
    // al salir, el alto lo da React Native, como siempre
    imeRef.current = (height) => {
      if (height > 0) {
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
        if (target > 0 && Math.abs(height - target) >= 1) moveTo(height, 200);
      } else if (target > 0 && !hideTimer) {
        hideTimer = setTimeout(() => { hideTimer = null; moveTo(0, 200); }, ANDROID_HIDE_WAIT);
      }
    };
    return () => {
      show.remove();
      hide.remove();
      if (hideTimer) clearTimeout(hideTimer);
      lowerRef.current = () => {};
      reflowRef.current = () => {};
      imeRef.current = () => {};
      keyboardOffset.setValue(0);
      footerOffset.setValue(0);
      lockedBodyHeight.current = 0;
      setOverlap(0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- screenH, maxHeight y scrollable no cambian con la ventana abierta
  }, [mounted, keyboardOffset, footerOffset, insets.bottom, insets.top]);

  // Android avisa de que el teclado se ha ocultado cuando la pantalla de debajo
  // se vuelve a dibujar, y con una ventana encima eso puede no pasar: la
  // ventana se quedaba arriba sin teclado. Si tras un toque no queda ningún
  // campo activo, el teclado ya no está: se baja sin esperar al aviso
  const lowerIfKeyboardGone = Platform.OS === 'android'
    ? () => {
        setTimeout(() => {
          if (!TextInput.State.currentlyFocusedInput()) lowerRef.current();
        }, 250);
      }
    : undefined;

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

  const slide = progress.interpolate({ inputRange: [0, 1], outputRange: [screenH, 0] });
  const translateY = Animated.add(Animated.add(slide, drag), keyboardOffset);

  const Body = scrollable ? ScrollView : View;
  const bodyProps = scrollable
    ? {
        ref: scrollRef,
        keyboardShouldPersistTaps: dismissKeyboardOnTap ? 'handled' as const : 'always' as const,
        showsVerticalScrollIndicator: false,
        // Con el hueco del teclado, el alto de antes (ver place)
        style: [
          styles.bodyScroll,
          overlap > 0 && lockedBodyHeight.current > 0 ? { height: lockedBodyHeight.current } : null,
        ],
        contentContainerStyle: [styles.body, bodyStyle],
        onLayout: (e: LayoutChangeEvent) => { bodyHeight.current = e.nativeEvent.layout.height; },
        scrollEventThrottle: 32,
        onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => { scrollY.current = e.nativeEvent.contentOffset.y; },
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
      {ImeHeightView ? (
        <ImeHeightView
          style={styles.imeProbe}
          pointerEvents="none"
          onImeChange={(e) => imeRef.current(e.nativeEvent.height)}
        />
      ) : null}
      <TouchableWithoutFeedback onPress={onClose} accessible={false}>
        <Animated.View
          style={[styles.backdrop, { opacity: progress }]}
          onLayout={Platform.OS === 'android'
            ? (e) => { modalHeight.current = e.nativeEvent.layout.height; }
            : undefined}
        />
      </TouchableWithoutFeedback>

      <Animated.View
        ref={sheetRef}
        style={[
          styles.sheet,
          {
            backgroundColor: ui.sheet,
            maxHeight: screenH * maxHeight,
            transform: [{ translateY }],
          },
        ]}
        onLayout={(e) => {
          const { height } = e.nativeEvent.layout;
          if (height === sheetHeight.current) return;
          sheetHeight.current = height;
          reflowRef.current();
        }}
        onTouchEnd={lowerIfKeyboardGone}
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

        <Body {...bodyProps}>
          {scrollable ? (
            <View ref={contentTopRef} collapsable={false} pointerEvents="none" style={styles.contentTop} />
          ) : null}
          {children}
          {overlap > 0 ? <View style={{ height: overlap }} /> : null}
          {/* Sin botón, el aire del pie va al final del contenido, que así se
              desplaza hasta el borde de la pantalla. Como pie vacío era una
              franja del color de la ventana que cortaba la lista por abajo */}
          {footer ? null : <View style={{ height: insets.bottom + FOOTER_TOP + FOOTER_BOTTOM }} />}
        </Body>

        {footer ? (
          <Animated.View
            style={[
              styles.footer,
              {
                paddingBottom: insets.bottom + FOOTER_BOTTOM,
                backgroundColor: ui.sheet,
                transform: [{ translateY: footerOffset }],
              },
            ]}
          >
            {footer}
          </Animated.View>
        ) : null}
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
  options, value, onChange, style, pill = false,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (key: T) => void;
  style?: StyleProp<ViewStyle>;
  /** Pastilla centrada, del ancho de sus opciones, en vez de ocupar todo el ancho */
  pill?: boolean;
}) => {
  const { colors: dc, ui } = useTheme();
  return (
    <View style={[styles.segment, pill && styles.segmentPill, { backgroundColor: ui.fill2 }, style]}>
      {options.map((o) => {
        const on = o.key === value;
        const color = on ? (o.activeColor ?? dc.textPrimary) : dc.textSecondary;
        return (
          <TouchableOpacity
            key={o.key}
            style={[
              styles.segmentItem,
              pill && styles.segmentItemPill,
              on && [styles.segmentOn, { backgroundColor: ui.sheetRaised }],
            ]}
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
  imeProbe: { position: 'absolute', width: 0, height: 0 },
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
  // Marca sin tamaño en el principio del contenido, fuera del flujo
  contentTop: { position: 'absolute', top: 0, left: 0, width: 0, height: 0 },
  footer: { paddingHorizontal: 20, paddingTop: FOOTER_TOP },
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
  segmentPill: { alignSelf: 'center', borderRadius: 999 },
  segmentItemPill: { flex: 0, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 999 },
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
