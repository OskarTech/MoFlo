import React, { useState, useRef, useEffect } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity, TextInput, Switch, Keyboard,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import Icon, { IoniconName } from '../../components/common/Icon';
import { HUCHA_ICONS } from '../../constants/huchaIcons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSavingsStore } from '../../store/savingsStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useSharedAccountStore } from '../../store/sharedAccountStore';
import { useTheme } from '../../hooks/useTheme';
import { parseAmountInput } from '../../utils/formatAmount';
import { withAlpha } from '../../utils/color';
import { HeroScrollScreen } from '../../components/layout/HeroScreen';
import { HeroTitleBar, HeroChip } from '../../components/layout/HeroBar';
import { SheetButton, FilledInput, SheetLabel } from '../../components/common/BottomSheet';
import AmountInput from '../../components/common/AmountInput';
import { ColorPickerSheet, RainbowSwatch } from '../../components/common/ColorPicker';

const PRESET_COLORS = [
  '#E8735A', '#4A90D9', '#7BC67E', '#F5A623',
  '#9B59B6', '#E74C3C', '#2ECC71', '#F39C12',
  '#1ABC9C', '#3498DB', '#34495E', '#E91E63',
  '#FF6B9D', '#FFD93D', '#6C5CE7', '#00B894',
];

const CreateHuchaScreen = () => {
  const { t } = useTranslation();
  const { colors: dc, ui } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { createHucha } = useSavingsStore();
  const { getCurrencySymbol } = useSettingsStore();
  const { isSharedMode, getSharedCurrencySymbol } = useSharedAccountStore();
  const currencySymbol = isSharedMode ? getSharedCurrencySymbol() : getCurrencySymbol();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState<IoniconName>('trophy-outline');
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);
  const [showPicker, setShowPicker] = useState(false);
  const customColor = !PRESET_COLORS.includes(selectedColor);
  const [targetAmount, setTargetAmount] = useState('');
  const [noTarget, setNoTarget] = useState(false);
  const [initialAmount, setInitialAmount] = useState('');
  const [isAutomatic, setIsAutomatic] = useState(false);
  const [monthlyAmount, setMonthlyAmount] = useState('');
  const [recurringDay, setRecurringDay] = useState('1');
  const [isSaving, setIsSaving] = useState(false);

  const targetRef = useRef<TextInput>(null);
  const nameRef = useRef<TextInput>(null);
  const initialRef = useRef<TextInput>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      if (step === 1 && !noTarget) targetRef.current?.focus();
      else if (step === 2) nameRef.current?.focus();
      else if (step === 3) initialRef.current?.focus();
    }, 80);
    return () => clearTimeout(id);
  }, [step, noTarget]);

  const parsedTarget = parseAmountInput(targetAmount);
  const parsedInitial = parseAmountInput(initialAmount);
  const parsedMonthly = parseAmountInput(monthlyAmount);
  const parsedDay = parseInt(recurringDay, 10);
  const initialValue = !isNaN(parsedInitial) && parsedInitial > 0 ? parsedInitial : 0;
  const initialExceedsTarget = !noTarget
    && initialValue > 0
    && parsedTarget > 0
    && initialValue > parsedTarget;

  const step1Valid = noTarget || parsedTarget > 0;
  const step2Valid = name.trim().length > 0;
  const automaticValid = !isAutomatic
    || (parsedMonthly > 0 && parsedDay >= 1 && parsedDay <= 31);
  const step3Valid = automaticValid && !initialExceedsTarget;
  const isValid = step1Valid && step2Valid && step3Valid;

  const handleNext = () => {
    if (step === 1 && step1Valid) setStep(2);
    else if (step === 2 && step2Valid) setStep(3);
  };

  const handleBack = () => {
    if (step === 1) navigation.goBack();
    else if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
  };

  const handleSave = () => {
    if (isSaving || !isValid) return;
    setIsSaving(true);

    createHucha({
      name: name.trim(),
      icon: selectedIcon,
      color: selectedColor,
      targetAmount: noTarget ? 0 : parsedTarget,
      currentAmount: initialValue,
      isAutomatic,
      monthlyAmount: isAutomatic ? parsedMonthly : undefined,
      recurringDay: isAutomatic ? parsedDay : undefined,
    }).finally(() => {
      setIsSaving(false);
    });
    navigation.goBack();
  };

  const primaryDisabled =
    (step === 1 && !step1Valid) ||
    (step === 2 && !step2Valid) ||
    (step === 3 && (!isValid || isSaving));

  const stepTitle = step === 1 ? t('hucha.step1Title') : step === 2 ? t('hucha.step2Title') : t('hucha.step3Title');
  const stepSubtitle = step === 1 ? t('hucha.step1Subtitle') : step === 2 ? t('hucha.step2Subtitle') : t('hucha.step3Subtitle');

  const hero = (
    <>
      <HeroTitleBar
        title={t('hucha.createGoal')}
        onBack={handleBack}
        right={<HeroChip label={`${step}/3`} />}
      />
      <View style={styles.heroBody}>
        <Text style={[styles.heroTitle, { color: ui.onHero }]}>{stepTitle}</Text>
        <Text style={[styles.heroSubtitle, { color: ui.onHeroSoft }]}>{stepSubtitle}</Text>
        <View style={styles.dots}>
          {[1, 2, 3].map(s => (
            <View
              key={s}
              style={[
                styles.dot,
                { backgroundColor: s <= step ? '#FFFFFF' : 'rgba(255,255,255,0.3)' },
                step === s && styles.dotOn,
              ]}
            />
          ))}
        </View>
      </View>
    </>
  );

  return (
    <>
      <HeroScrollScreen hero={hero} keyboardShouldPersistTaps="handled">
        <View style={styles.body}>
          {step === 1 && (
            <>
              {!noTarget && (
                <AmountInput
                  ref={targetRef}
                  value={targetAmount}
                  onChangeText={setTargetAmount}
                  currencySymbol={currencySymbol}
                />
              )}

              <View style={[styles.toggleCard, { backgroundColor: ui.field }]}>
                <View style={styles.toggleRow}>
                  <View style={[styles.toggleIcon, { backgroundColor: withAlpha(selectedColor, 0.18) }]}>
                    <Icon name="infinite" size={18} color={selectedColor} />
                  </View>
                  <View style={styles.toggleInfo}>
                    <Text style={[styles.toggleLabel, { color: dc.textPrimary }]}>{t('hucha.noTarget')}</Text>
                    <Text style={[styles.toggleHint, { color: dc.textSecondary }]}>{t('hucha.noTargetHint')}</Text>
                  </View>
                  <Switch
                    value={noTarget}
                    onValueChange={(v) => {
                      setNoTarget(v);
                      if (v) setTargetAmount('');
                    }}
                    trackColor={{ false: ui.hair2, true: dc.primary }}
                    thumbColor="#fff"
                    ios_backgroundColor={ui.hair2}
                  />
                </View>
              </View>

              <SheetLabel>{t('hucha.chooseColor')}</SheetLabel>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.bleed}
                contentContainerStyle={styles.colorRow}
                keyboardShouldPersistTaps="handled"
              >
                {PRESET_COLORS.map(color => {
                  const on = selectedColor === color;
                  return (
                    <TouchableOpacity
                      key={color}
                      style={[styles.colorDot, { backgroundColor: color }, on && [styles.colorDotOn, { borderColor: ui.sheet }]]}
                      onPress={() => setSelectedColor(color)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                    >
                      {on && <Icon name="checkmark" size={16} color="#fff" />}
                    </TouchableOpacity>
                  );
                })}
                {/* Color libre: abre el panel para elegirlo con el dedo */}
                <TouchableOpacity
                  style={[
                    styles.colorDot,
                    customColor && [{ backgroundColor: selectedColor }, styles.colorDotOn, { borderColor: ui.sheet }],
                  ]}
                  onPress={() => { Keyboard.dismiss(); setShowPicker(true); }}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.customColor')}
                >
                  {customColor ? (
                    <Icon name="checkmark" size={16} color="#fff" />
                  ) : (
                    <>
                      <RainbowSwatch size={34} />
                      <View style={styles.rainbowIcon}>
                        <Icon name="add" size={18} color="#fff" />
                      </View>
                    </>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </>
          )}

          {step === 2 && (
            <>
              {/* Así se verá */}
              <View style={styles.preview}>
                <View style={[styles.previewIcon, { backgroundColor: withAlpha(selectedColor, 0.18) }]}>
                  <Icon name={selectedIcon} size={30} color={selectedColor} />
                </View>
              </View>
              <FilledInput
                ref={nameRef}
                placeholder={t('hucha.goalNamePlaceholder')}
                value={name}
                onChangeText={setName}
                maxLength={40}
              />

              <SheetLabel>{t('hucha.chooseIcon')}</SheetLabel>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.bleed}
                contentContainerStyle={styles.iconScrollContent}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.iconGrid}>
                  {HUCHA_ICONS.map(icon => {
                    const on = selectedIcon === icon;
                    return (
                      <TouchableOpacity
                        key={icon}
                        style={[styles.iconOption, { backgroundColor: on ? selectedColor : ui.field }]}
                        onPress={() => setSelectedIcon(icon)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                      >
                        <Icon name={icon} size={22} color={on ? '#FFFFFF' : dc.textSecondary} />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            </>
          )}

          {step === 3 && (
            <>
              <View style={[styles.toggleCard, { backgroundColor: ui.field }]}>
                <View style={styles.toggleRow}>
                  <View style={[styles.toggleIcon, { backgroundColor: withAlpha(selectedColor, 0.18) }]}>
                    <Icon name="repeat" size={18} color={selectedColor} />
                  </View>
                  <Text style={[styles.toggleLabel, styles.toggleInfo, { color: dc.textPrimary }]}>
                    {t('hucha.automatic')}
                  </Text>
                  <Switch
                    value={isAutomatic}
                    onValueChange={setIsAutomatic}
                    trackColor={{ false: ui.hair2, true: dc.primary }}
                    thumbColor="#fff"
                    ios_backgroundColor={ui.hair2}
                  />
                </View>

                {isAutomatic && (
                  <View style={[styles.autoFields, { borderTopColor: ui.hair }]}>
                    <FilledInput
                      placeholder={t('hucha.automaticAmount', { symbol: currencySymbol })}
                      keyboardType="decimal-pad"
                      value={monthlyAmount}
                      onChangeText={setMonthlyAmount}
                      containerStyle={{ backgroundColor: ui.sheet }}
                    />
                    <View style={styles.dayRow}>
                      <Text style={[styles.dayLabel, { color: dc.textSecondary }]}>{t('hucha.chooseDayOfMonth')}</Text>
                      <TextInput
                        style={[styles.dayInput, { backgroundColor: ui.sheet, color: dc.textPrimary }]}
                        placeholder={t('hucha.dayOfMonth')}
                        placeholderTextColor={dc.textSecondary}
                        keyboardType="number-pad"
                        value={recurringDay}
                        onChangeText={(v) => setRecurringDay(v.replace(/[^0-9]/g, '').slice(0, 2))}
                        maxLength={2}
                      />
                    </View>
                  </View>
                )}
              </View>

              <SheetLabel>{t('hucha.initialAmountSection')}</SheetLabel>
              <FilledInput
                ref={initialRef}
                placeholder={t('hucha.initialAmount', { symbol: currencySymbol })}
                keyboardType="decimal-pad"
                value={initialAmount}
                onChangeText={setInitialAmount}
              />
              <Text style={[styles.hint, { color: dc.textSecondary }]}>{t('hucha.initialAmountHint')}</Text>
              {initialExceedsTarget && (
                <Text style={[styles.error, { color: ui.expenseText }]}>{t('hucha.invalidTargetAmount')}</Text>
              )}
            </>
          )}

          <SheetButton
            label={step < 3 ? t('hucha.next') : t('hucha.save')}
            onPress={step < 3 ? handleNext : handleSave}
            disabled={primaryDisabled}
            style={styles.primary}
          />
        </View>
      </HeroScrollScreen>
      <ColorPickerSheet
        visible={showPicker}
        value={selectedColor}
        onDismiss={() => setShowPicker(false)}
        onSelect={setSelectedColor}
      />
    </>
  );
};

const styles = StyleSheet.create({
  heroBody: { paddingHorizontal: 20, paddingTop: 12 },
  heroTitle: { fontSize: 24, fontFamily: 'Poppins_700Bold', letterSpacing: -0.4 },
  heroSubtitle: { fontSize: 13.5, fontFamily: 'Poppins_400Regular', marginTop: 4, lineHeight: 20 },
  dots: { flexDirection: 'row', gap: 6, marginTop: 14 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotOn: { width: 24 },

  body: { paddingHorizontal: 20 },
  bleed: { marginHorizontal: -20 },
  toggleCard: { borderRadius: 18, padding: 14, marginTop: 6 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleIcon: { width: 36, height: 36, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  toggleInfo: { flex: 1 },
  toggleLabel: { fontSize: 14.5, fontFamily: 'Poppins_500Medium' },
  toggleHint: { fontSize: 11.5, fontFamily: 'Poppins_400Regular', marginTop: 2, lineHeight: 15 },
  colorRow: { paddingHorizontal: 20, gap: 10, alignItems: 'center' },
  colorDot: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  rainbowIcon: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  colorDotOn: { borderWidth: 3 },
  preview: { alignItems: 'center', marginBottom: 16 },
  previewIcon: { width: 66, height: 66, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },
  iconScrollContent: { paddingHorizontal: 20 },
  iconGrid: {
    flexDirection: 'column', flexWrap: 'wrap',
    height: 48 * 2 + 8, alignContent: 'flex-start', gap: 8,
  },
  iconOption: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  autoFields: { marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 10 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dayLabel: { flex: 1, fontSize: 12.5, fontFamily: 'Poppins_400Regular' },
  dayInput: {
    width: 70, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, fontFamily: 'Poppins_500Medium', textAlign: 'center',
  },
  hint: { fontSize: 11.5, fontFamily: 'Poppins_400Regular', marginTop: 6, marginHorizontal: 4, lineHeight: 15 },
  error: { fontSize: 12.5, fontFamily: 'Poppins_400Regular', marginTop: 6, marginHorizontal: 4 },
  primary: { marginTop: 22 },
});

export default CreateHuchaScreen;
