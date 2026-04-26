import React, { useEffect, useMemo } from 'react';
import {
  View, StyleSheet, TouchableOpacity, Dimensions, Platform, StatusBar,
  Modal, Animated, Easing,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Mask, Rect } from 'react-native-svg';
import { useTheme } from '../../hooks/useTheme';
import { useWalkthroughStore, WALKTHROUGH_STEPS, TargetRect } from '../../store/walkthroughStore';

const SPOTLIGHT_PADDING = 4;
const SPOTLIGHT_RADIUS_DEFAULT = 14;
const TOOLTIP_MARGIN = 16;
const TOOLTIP_GAP = 16;

const computeTabRect = (
  index: number,
  insets: { bottom: number },
): TargetRect => {
  const { width: screenW, height: screenH } = Dimensions.get('window');
  const tabBarH = 64 + insets.bottom;
  const tabW = screenW / 5;
  if (index === 2) {
    // FAB elevado: AddTabButton tiene top:-16 y marginBottom:insets.bottom/2.
    // El tab bar tiene paddingBottom: insets.bottom + 8.
    // Calculamos el centro del botón visual (56x56) con esos offsets.
    const size = 64;
    const tabBarPaddingBottom = insets.bottom + 8;
    const containerH = tabBarH - tabBarPaddingBottom - insets.bottom / 2;
    const containerTop = screenH - tabBarH;
    const buttonCenterY = containerTop + containerH / 2 - 16;
    return {
      x: screenW / 2 - size / 2,
      y: buttonCenterY - size / 2,
      width: size,
      height: size,
    };
  }
  return {
    x: index * tabW + tabW * 0.18,
    y: screenH - tabBarH + 6,
    width: tabW * 0.64,
    height: tabBarH - insets.bottom - 6,
  };
};

const computeHeaderRect = (insets: { top: number }): TargetRect => {
  const { width: screenW } = Dimensions.get('window');
  const top = Platform.OS === 'android'
    ? (StatusBar.currentHeight ?? 0) + 12
    : insets.top + 12;
  return {
    x: screenW / 2 - 110,
    y: top,
    width: 220,
    height: 38,
  };
};

const WalkthroughOverlay = () => {
  const { t } = useTranslation();
  const { colors: dc, isDark } = useTheme();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = Dimensions.get('window');

  const isActive = useWalkthroughStore(s => s.isActive);
  const currentStep = useWalkthroughStore(s => s.currentStep);
  const targets = useWalkthroughStore(s => s.targets);
  const next = useWalkthroughStore(s => s.next);
  const prev = useWalkthroughStore(s => s.prev);
  const skip = useWalkthroughStore(s => s.skip);

  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const step = WALKTHROUGH_STEPS[currentStep];

  useEffect(() => {
    if (!isActive || !step) return;
    // Navegar a la pestaña correspondiente
    try {
      const targetTab = step.tab;
      navigation.navigate(targetTab === 'HuchaTab' ? 'HuchaTab' : targetTab);
    } catch {}
  }, [isActive, currentStep, step, navigation]);

  useEffect(() => {
    if (isActive) {
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    }
  }, [isActive, currentStep, fadeAnim]);

  const targetRect: TargetRect | null = useMemo(() => {
    if (!step) return null;
    if (step.isTab && step.tabIndex !== undefined) {
      return computeTabRect(step.tabIndex, insets);
    }
    if (step.customTarget === 'header') {
      return computeHeaderRect(insets);
    }
    return targets[step.id] ?? null;
  }, [step, targets, insets]);

  if (!isActive || !step) return null;

  const isLast = currentStep === WALKTHROUGH_STEPS.length - 1;
  const isFirst = currentStep === 0;

  // Calcular padding del rectángulo expandido
  const padX = targetRect ? targetRect.x - SPOTLIGHT_PADDING : 0;
  const padY = targetRect ? targetRect.y - SPOTLIGHT_PADDING : 0;
  const padW = targetRect ? targetRect.width + SPOTLIGHT_PADDING * 2 : 0;
  const padH = targetRect ? targetRect.height + SPOTLIGHT_PADDING * 2 : 0;

  // Radio del recorte del spotlight según configuración del paso
  const spotlightRadius = !targetRect
    ? 0
    : step.spotlightShape === 'circle'
      ? Math.max(padW, padH) / 2
      : typeof step.spotlightShape === 'number'
        ? step.spotlightShape + SPOTLIGHT_PADDING
        : SPOTLIGHT_RADIUS_DEFAULT;

  // Decidir posición del tooltip (arriba o abajo del target)
  const tooltipMaxW = screenW - TOOLTIP_MARGIN * 2;
  const spaceBelow = targetRect ? screenH - (padY + padH) - insets.bottom - TOOLTIP_GAP : screenH;
  const spaceAbove = targetRect ? padY - insets.top - TOOLTIP_GAP : 0;
  const placeBelow = targetRect ? spaceBelow >= spaceAbove : true;

  // Posición del tooltip: usamos `bottom` cuando va ARRIBA del spotlight para
  // que se ancle al borde superior del recorte sin importar su altura real.
  const tooltipPlacement: { top?: number; bottom?: number } = !targetRect
    ? { top: screenH / 2 - 100 }
    : placeBelow
      ? { top: padY + padH + TOOLTIP_GAP }
      : { bottom: screenH - (padY - TOOLTIP_GAP) };

  const overlayColor = 'rgba(0,0,0,0.78)';

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={skip}>
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: fadeAnim }]}>
        {/* SPOTLIGHT SVG */}
        <Svg width={screenW} height={screenH} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <Mask id="walkthrough-mask">
              <Rect x={0} y={0} width={screenW} height={screenH} fill="white" />
              {targetRect && (
                <Rect
                  x={padX}
                  y={padY}
                  width={padW}
                  height={padH}
                  rx={spotlightRadius}
                  ry={spotlightRadius}
                  fill="black"
                />
              )}
            </Mask>
          </Defs>
          <Rect
            x={0}
            y={0}
            width={screenW}
            height={screenH}
            fill={overlayColor}
            mask="url(#walkthrough-mask)"
          />
        </Svg>

        {/* CAPTURADORES DE TAP — bloquean toda la pantalla menos la zona del spotlight */}
        <TouchableOpacity
          activeOpacity={1}
          style={StyleSheet.absoluteFillObject}
          onPress={() => {}}
        />

        {/* TOOLTIP CARD */}
        <View
          style={[
            styles.tooltipWrap,
            {
              ...tooltipPlacement,
              maxWidth: tooltipMaxW,
              left: TOOLTIP_MARGIN,
              right: TOOLTIP_MARGIN,
            },
          ]}
        >
          <View
            style={[
              styles.tooltip,
              {
                backgroundColor: dc.surface,
                borderColor: isDark ? dc.border : 'transparent',
              },
            ]}
          >
            <View style={styles.tooltipHeader}>
              <Text style={[styles.stepIndicator, { color: dc.primary }]}>
                {t('walkthrough.stepOf', { current: currentStep + 1, total: WALKTHROUGH_STEPS.length })}
              </Text>
              <TouchableOpacity onPress={skip} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={[styles.skipText, { color: dc.textSecondary }]}>
                  {t('walkthrough.skip')}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.title, { color: dc.textPrimary }]}>
              {t(step.titleKey)}
            </Text>
            <Text style={[styles.body, { color: dc.textSecondary }]}>
              {t(step.bodyKey)}
            </Text>

            <View style={styles.actionsRow}>
              <View style={styles.dotsRow}>
                {WALKTHROUGH_STEPS.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      {
                        backgroundColor: i === currentStep ? dc.primary : dc.border,
                        width: i === currentStep ? 18 : 6,
                      },
                    ]}
                  />
                ))}
              </View>
              <View style={styles.navBtns}>
                {!isFirst && (
                  <TouchableOpacity
                    onPress={prev}
                    style={[styles.navBtn, { borderColor: dc.border }]}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.navBtnText, { color: dc.textPrimary }]}>
                      {t('walkthrough.prev')}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={next}
                  style={[styles.navBtnPrimary, { backgroundColor: dc.primary }]}
                  activeOpacity={0.85}
                >
                  <Text style={styles.navBtnPrimaryText}>
                    {isLast ? t('walkthrough.done') : t('walkthrough.next')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  tooltipWrap: { position: 'absolute' },
  tooltip: {
    borderRadius: 18,
    padding: 18,
    borderWidth: 0.5,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  tooltipHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  stepIndicator: {
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  skipText: {
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
  },
  title: {
    fontSize: 18,
    fontFamily: 'Poppins_700Bold',
    marginBottom: 8,
  },
  body: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    lineHeight: 19,
    marginBottom: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  navBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  navBtnText: {
    fontSize: 13,
    fontFamily: 'Poppins_600SemiBold',
  },
  navBtnPrimary: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 10,
  },
  navBtnPrimaryText: {
    fontSize: 13,
    fontFamily: 'Poppins_600SemiBold',
    color: '#FFFFFF',
  },
});

export default WalkthroughOverlay;
