import React, { useState, useRef, useEffect } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Switch,
} from 'react-native';
import { Text, Button } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppHeader from '../../components/common/AppHeader';
import { useSavingsStore } from '../../store/savingsStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useSharedAccountStore } from '../../store/sharedAccountStore';
import { useTheme } from '../../hooks/useTheme';

const PRESET_ICONS: Array<keyof typeof Ionicons.glyphMap> = [
  'home-outline', 'business-outline', 'bed-outline', 'construct-outline',
  'car-outline', 'bicycle-outline', 'bus-outline', 'boat-outline',
  'airplane-outline', 'rocket-outline', 'train-outline', 'map-outline',
  'gift-outline', 'heart-outline', 'star-outline', 'sparkles-outline',
  'trophy-outline', 'medal-outline', 'ribbon-outline', 'diamond-outline',
  'school-outline', 'library-outline', 'book-outline', 'briefcase-outline',
  'restaurant-outline', 'pizza-outline', 'fast-food-outline', 'cafe-outline',
  'wine-outline', 'beer-outline', 'ice-cream-outline', 'nutrition-outline',
  'cart-outline', 'bag-outline', 'basket-outline', 'pricetag-outline',
  'shirt-outline', 'glasses-outline', 'cut-outline', 'brush-outline',
  'color-palette-outline', 'color-wand-outline', 'flower-outline', 'leaf-outline',
  'paw-outline', 'fish-outline',
  'man-outline', 'woman-outline', 'people-outline', 'person-outline',
  'fitness-outline', 'barbell-outline', 'football-outline', 'basketball-outline',
  'tennisball-outline', 'american-football-outline',
  'medical-outline', 'pulse-outline', 'bandage-outline',
  'laptop-outline', 'desktop-outline', 'tablet-portrait-outline', 'phone-portrait-outline',
  'watch-outline', 'headset-outline', 'game-controller-outline', 'tv-outline',
  'camera-outline', 'videocam-outline', 'image-outline', 'film-outline',
  'musical-notes-outline', 'mic-outline',
  'umbrella-outline', 'sunny-outline', 'snow-outline', 'partly-sunny-outline',
  'cash-outline', 'card-outline', 'wallet-outline',
  'planet-outline', 'earth-outline', 'globe-outline',
  'balloon-outline',
];

const PRESET_COLORS = [
  '#E8735A', '#4A90D9', '#7BC67E', '#F5A623',
  '#9B59B6', '#E74C3C', '#2ECC71', '#F39C12',
  '#1ABC9C', '#3498DB', '#34495E', '#E91E63',
  '#FF6B9D', '#FFD93D', '#6C5CE7', '#00B894',
];

const CreateHuchaScreen = () => {
  const { t } = useTranslation();
  const { colors: dc } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { createHucha } = useSavingsStore();
  const { getCurrencySymbol } = useSettingsStore();
  const { isSharedMode, getSharedCurrencySymbol } = useSharedAccountStore();
  const currencySymbol = isSharedMode ? getSharedCurrencySymbol() : getCurrencySymbol();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState<keyof typeof Ionicons.glyphMap>('trophy-outline');
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);
  const [targetAmount, setTargetAmount] = useState('');
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
      if (step === 1) targetRef.current?.focus();
      else if (step === 2) nameRef.current?.focus();
      else if (step === 3) initialRef.current?.focus();
    }, 80);
    return () => clearTimeout(id);
  }, [step]);

  const parsedTarget = parseFloat(targetAmount.replace(',', '.'));
  const parsedInitial = parseFloat(initialAmount.replace(',', '.'));
  const parsedMonthly = parseFloat(monthlyAmount.replace(',', '.'));
  const parsedDay = parseInt(recurringDay, 10);
  const initialValue = !isNaN(parsedInitial) && parsedInitial > 0 ? parsedInitial : 0;
  const initialExceedsTarget = initialValue > 0 && parsedTarget > 0 && initialValue > parsedTarget;

  const step1Valid = parsedTarget > 0;
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
      targetAmount: parsedTarget,
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

  const renderActions = () => (
    <View style={styles.actionRow}>
      <Button
        mode="outlined"
        onPress={handleBack}
        style={[styles.cancelButton, { borderColor: dc.border }]}
        textColor={dc.textSecondary}
      >
        {step === 1 ? t('hucha.cancel') : t('hucha.back')}
      </Button>
      <Button
        mode="contained"
        onPress={step < 3 ? handleNext : handleSave}
        disabled={primaryDisabled}
        style={styles.saveButton}
        buttonColor={selectedColor}
        textColor="#FFFFFF"
      >
        {step < 3 ? t('hucha.next') : t('hucha.save')}
      </Button>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: dc.background }]}>
      <AppHeader title={t('hucha.createGoal')} showBack showBell={false} />

      <View style={styles.stepIndicator}>
        {[1, 2, 3].map(s => (
          <View
            key={s}
            style={[
              styles.stepDot,
              { backgroundColor: dc.border },
              step === s && { backgroundColor: selectedColor, width: 24 },
              step > s && { backgroundColor: selectedColor + '80' },
            ]}
          />
        ))}
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 16 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {step === 1 && (
          <>
            <Text style={[styles.stepTitle, { color: dc.textPrimary }]}>
              {t('hucha.step1Title')}
            </Text>
            <Text style={[styles.stepSubtitle, { color: dc.textSecondary }]}>
              {t('hucha.step1Subtitle')}
            </Text>

            <TextInput
              ref={targetRef}
              style={[styles.input, { backgroundColor: dc.surface, borderColor: dc.border, color: dc.textPrimary, textAlign: 'center', fontSize: 18, paddingVertical: 14 }]}
              placeholder={t('hucha.goalAmount', { symbol: currencySymbol })}
              placeholderTextColor={dc.textSecondary}
              keyboardType="decimal-pad"
              value={targetAmount}
              onChangeText={setTargetAmount}
            />

            <Text style={[styles.sectionLabel, { color: dc.textSecondary, marginTop: 12 }]}>
              {t('hucha.chooseColor')}
            </Text>
            <View style={styles.colorRow}>
              {PRESET_COLORS.map(color => (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.colorDot,
                    { backgroundColor: color },
                    selectedColor === color && styles.colorDotSelected,
                  ]}
                  onPress={() => setSelectedColor(color)}
                >
                  {selectedColor === color && (
                    <Ionicons name="checkmark" size={14} color="#fff" />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            {renderActions()}
          </>
        )}

        {step === 2 && (
          <>
            <Text style={[styles.stepTitle, { color: dc.textPrimary, marginBottom: 28 }]}>
              {t('hucha.step2Title')}
            </Text>

            <TextInput
              ref={nameRef}
              style={[styles.input, { backgroundColor: dc.surface, borderColor: dc.border, color: dc.textPrimary }]}
              placeholder={t('hucha.goalNamePlaceholder')}
              placeholderTextColor={dc.textSecondary}
              value={name}
              onChangeText={setName}
              maxLength={40}
            />

            <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
              {t('hucha.chooseIcon')}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.iconScroll}
              contentContainerStyle={styles.iconScrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.iconGridTwoRows}>
                {PRESET_ICONS.map(icon => (
                  <TouchableOpacity
                    key={icon}
                    style={[
                      styles.iconOption,
                      { backgroundColor: selectedIcon === icon ? selectedColor + '25' : dc.surface,
                        borderColor: selectedIcon === icon ? selectedColor : dc.border },
                    ]}
                    onPress={() => setSelectedIcon(icon)}
                  >
                    <Ionicons
                      name={icon}
                      size={22}
                      color={selectedIcon === icon ? selectedColor : dc.textSecondary}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {renderActions()}
          </>
        )}

        {step === 3 && (
          <>
            <Text style={[styles.stepTitle, { color: dc.textPrimary }]}>
              {t('hucha.step3Title')}
            </Text>
            <Text style={[styles.stepSubtitle, { color: dc.textSecondary }]}>
              {t('hucha.step3Subtitle')}
            </Text>

            <View style={[styles.toggleCard, { backgroundColor: dc.surface, borderColor: dc.border }]}>
              <View style={styles.toggleRow}>
                <View style={[styles.toggleIconWrap, { backgroundColor: selectedColor + '20' }]}>
                  <Ionicons name="repeat" size={18} color={selectedColor} />
                </View>
                <Text style={[styles.toggleLabel, { color: dc.textPrimary }]}>
                  {t('hucha.automatic')}
                </Text>
                <Switch
                  value={isAutomatic}
                  onValueChange={setIsAutomatic}
                  trackColor={{ false: dc.border, true: selectedColor }}
                  thumbColor="#fff"
                />
              </View>

              {isAutomatic && (
                <View style={[styles.autoFields, { borderTopColor: dc.border }]}>
                  <TextInput
                    style={[styles.input, { backgroundColor: dc.background, borderColor: dc.border, color: dc.textPrimary, marginBottom: 10 }]}
                    placeholder={t('hucha.automaticAmount')}
                    placeholderTextColor={dc.textSecondary}
                    keyboardType="decimal-pad"
                    value={monthlyAmount}
                    onChangeText={setMonthlyAmount}
                  />
                  <View style={styles.dayRow}>
                    <Text style={[styles.dayLabel, { color: dc.textSecondary }]}>
                      {t('hucha.chooseDayOfMonth')}
                    </Text>
                    <TextInput
                      style={[styles.dayInput, { backgroundColor: dc.background, borderColor: dc.border, color: dc.textPrimary }]}
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

            <Text style={[styles.sectionLabel, { color: dc.textSecondary, marginTop: 16 }]}>
              {t('hucha.initialAmountSection')}
            </Text>
            <TextInput
              ref={initialRef}
              style={[styles.input, { backgroundColor: dc.surface, borderColor: dc.border, color: dc.textPrimary, marginBottom: 6 }]}
              placeholder={t('hucha.initialAmount', { symbol: currencySymbol })}
              placeholderTextColor={dc.textSecondary}
              keyboardType="decimal-pad"
              value={initialAmount}
              onChangeText={setInitialAmount}
            />
            <Text style={[styles.initialHint, { color: dc.textSecondary }]}>
              {t('hucha.initialAmountHint')}
            </Text>
            {initialExceedsTarget && (
              <Text style={styles.initialError}>
                {t('hucha.invalidTargetAmount')}
              </Text>
            )}

            {renderActions()}
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  stepIndicator: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14,
  },
  stepDot: {
    width: 8, height: 8, borderRadius: 4,
  },
  scrollContent: {
    paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24,
  },
  stepTitle: {
    fontSize: 26, fontFamily: 'Poppins_700Bold', marginBottom: 8,
  },
  stepSubtitle: {
    fontSize: 14, fontFamily: 'Poppins_400Regular', marginBottom: 28, lineHeight: 20,
  },
  input: {
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 12, fontSize: 15, fontFamily: 'Poppins_400Regular',
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 12, fontFamily: 'Poppins_600SemiBold',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 10, marginTop: 4,
  },
  iconScroll: {
    marginHorizontal: -24, marginBottom: 16,
  },
  iconScrollContent: {
    paddingHorizontal: 24,
  },
  iconGridTwoRows: {
    flexDirection: 'column',
    flexWrap: 'wrap',
    height: 48 * 2 + 8,
    alignContent: 'flex-start',
    gap: 8,
  },
  iconOption: {
    width: 48, height: 48, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', borderWidth: 1.5,
  },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  colorDot: {
    width: 32, height: 32, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
  },
  colorDotSelected: { borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.6)' },
  toggleCard: {
    borderWidth: 0.5, borderRadius: 14, padding: 14,
  },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  toggleIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  toggleLabel: {
    flex: 1, fontSize: 14, fontFamily: 'Poppins_500Medium',
  },
  autoFields: {
    marginTop: 12, paddingTop: 12, borderTopWidth: 1,
  },
  dayRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  dayLabel: {
    flex: 1, fontSize: 12, fontFamily: 'Poppins_400Regular',
  },
  dayInput: {
    width: 70, borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, fontFamily: 'Poppins_500Medium',
    textAlign: 'center',
  },
  initialHint: {
    fontSize: 11, fontFamily: 'Poppins_400Regular',
    marginBottom: 8, marginHorizontal: 4, lineHeight: 15,
  },
  initialError: {
    fontSize: 12, fontFamily: 'Poppins_400Regular',
    color: '#EF4444', marginBottom: 8, marginHorizontal: 4,
  },
  actionRow: {
    flexDirection: 'row', gap: 12,
    marginTop: 16,
  },
  cancelButton: { flex: 1 },
  saveButton: { flex: 2 },
});

export default CreateHuchaScreen;
