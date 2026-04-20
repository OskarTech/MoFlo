import React, { useState, useEffect, useRef } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Modal, Platform, Animated, Keyboard,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSavingsStore } from '../../store/savingsStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useSharedAccountStore } from '../../store/sharedAccountStore';
import { useTheme } from '../../hooks/useTheme';
import { Hucha } from '../../types';
import AppHeader from '../../components/common/AppHeader';

const PRESET_ICONS: Array<keyof typeof Ionicons.glyphMap> = [
  'home-outline', 'car-outline', 'airplane-outline', 'gift-outline',
  'heart-outline', 'school-outline', 'trophy-outline', 'restaurant-outline',
];

const PRESET_COLORS = [
  '#E8735A', '#4A90D9', '#7BC67E', '#F5A623',
  '#9B59B6', '#E74C3C', '#2ECC71', '#F39C12',
];

const formatAmount = (n: number) => n % 1 === 0 ? n.toFixed(0) : n.toFixed(2);

const formatTargetDate = (yyyyMM?: string): string => {
  if (!yyyyMM) return '';
  const [year, month] = yyyyMM.split('-');
  const months: Record<string, string> = {
    '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr',
    '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago',
    '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic',
  };
  return `${months[month] ?? month} ${year}`;
};

const HuchaCard = ({ hucha, onPress }: { hucha: Hucha; onPress: () => void }) => {
  const { t } = useTranslation();
  const { colors: dc } = useTheme();
  const { getCurrencySymbol } = useSettingsStore();
  const { isSharedMode, getSharedCurrencySymbol } = useSharedAccountStore();
  const currencySymbol = isSharedMode ? getSharedCurrencySymbol() : getCurrencySymbol();
  const pct = hucha.targetAmount > 0
    ? Math.min(Math.round((hucha.currentAmount / hucha.targetAmount) * 100), 100)
    : 0;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: dc.surface, borderColor: dc.border }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.cardIcon, { backgroundColor: hucha.color + '20' }]}>
          <Ionicons name={hucha.icon as keyof typeof Ionicons.glyphMap} size={24} color={hucha.color} />
        </View>
        <View style={styles.cardInfo}>
          <Text style={[styles.cardName, { color: dc.textPrimary }]} numberOfLines={1}>
            {hucha.name}
          </Text>
          {(hucha.targetDate || hucha.isAutomatic) && (
            <Text style={[styles.cardMeta, { color: dc.textSecondary }]}>
              {hucha.targetDate ? formatTargetDate(hucha.targetDate) : ''}
              {hucha.targetDate && hucha.isAutomatic ? ' · ' : ''}
              {hucha.isAutomatic && hucha.monthlyAmount
                ? `${hucha.monthlyAmount} €/mes`
                : ''}
            </Text>
          )}
        </View>
        <Text style={[styles.cardPct, { color: hucha.color }]}>{pct}%</Text>
      </View>

      <View style={[styles.progressBar, { backgroundColor: dc.border }]}>
        <View style={[styles.progressFill, { width: `${pct}%` as any, backgroundColor: hucha.color }]} />
      </View>

      <View style={styles.cardFooter}>
        <Text style={[styles.cardAmount, { color: dc.textPrimary }]}>
          {formatAmount(hucha.currentAmount)} {currencySymbol}
        </Text>
        <Text style={[styles.cardTarget, { color: dc.textSecondary }]}>
          {t('hucha.of')} {formatAmount(hucha.targetAmount)} {currencySymbol}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const CreateHuchaModal = ({
  visible,
  onDismiss,
}: {
  visible: boolean;
  onDismiss: () => void;
}) => {
  const { t } = useTranslation();
  const { colors: dc } = useTheme();
  const { createHucha } = useSavingsStore();
  const { getCurrencySymbol } = useSettingsStore();
  const { isSharedMode, getSharedCurrencySymbol } = useSharedAccountStore();
  const currencySymbol = isSharedMode ? getSharedCurrencySymbol() : getCurrencySymbol();
  const insets = useSafeAreaInsets();
  const sheetOffset = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => {
      const offset = Platform.OS === 'ios'
        ? -(e.endCoordinates.height - insets.bottom)
        : -e.endCoordinates.height;
      Animated.timing(sheetOffset, {
        toValue: offset,
        duration: Platform.OS === 'ios' ? (e.duration ?? 250) : 200,
        useNativeDriver: true,
      }).start();
    });
    const hide = Keyboard.addListener(hideEvent, () => {
      Animated.timing(sheetOffset, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    });
    return () => { show.remove(); hide.remove(); };
  }, [sheetOffset, insets.bottom]);

  const [name, setName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState<keyof typeof Ionicons.glyphMap>('trophy-outline');
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);
  const [targetAmount, setTargetAmount] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const reset = () => {
    setName('');
    setSelectedIcon('trophy-outline');
    setSelectedColor(PRESET_COLORS[0]);
    setTargetAmount('');
    setIsSaving(false);
  };

  const handleDismiss = () => {
    reset();
    onDismiss();
  };

  const isValid = name.trim().length > 0 &&
    parseFloat(targetAmount.replace(',', '.')) > 0;

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    const target = parseFloat(targetAmount.replace(',', '.'));

    await createHucha({
      name: name.trim(),
      icon: selectedIcon,
      color: selectedColor,
      targetAmount: target,
      isAutomatic: false,
    });
    setIsSaving(false);
    handleDismiss();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleDismiss}
    >
      <Animated.View style={[styles.modalOverlay, { transform: [{ translateY: sheetOffset }] }]}>
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={handleDismiss}
        />
        <View style={[styles.sheet, { backgroundColor: dc.surface, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.sheetHandle, { backgroundColor: dc.border }]} />
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={[styles.sheetTitle, { color: dc.textPrimary }]}>
              {t('hucha.createGoal')}
            </Text>

            <TextInput
              style={[styles.input, { backgroundColor: dc.background, borderColor: dc.border, color: dc.textPrimary }]}
              placeholder={t('hucha.goalAmount', { symbol: currencySymbol })}
              placeholderTextColor={dc.textSecondary}
              keyboardType="decimal-pad"
              value={targetAmount}
              onChangeText={setTargetAmount}
            />

            <TextInput
              style={[styles.input, { backgroundColor: dc.background, borderColor: dc.border, color: dc.textPrimary }]}
              placeholder={t('hucha.goalNamePlaceholder')}
              placeholderTextColor={dc.textSecondary}
              value={name}
              onChangeText={setName}
              maxLength={40}
            />

            <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
              {t('hucha.chooseIcon')}
            </Text>
            <View style={styles.iconGrid}>
              {PRESET_ICONS.map(icon => (
                <TouchableOpacity
                  key={icon}
                  style={[
                    styles.iconOption,
                    { backgroundColor: selectedIcon === icon ? selectedColor + '25' : dc.background,
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

            <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
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

            <View style={styles.sheetButtons}>
              <TouchableOpacity
                style={[styles.sheetBtn, { backgroundColor: dc.border }]}
                onPress={handleDismiss}
              >
                <Text style={[styles.sheetBtnText, { color: dc.textSecondary }]}>
                  {t('hucha.cancel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sheetBtn, { backgroundColor: isValid && !isSaving ? selectedColor : dc.border }]}
                onPress={handleSave}
                disabled={!isValid || isSaving}
              >
                <Text style={[styles.sheetBtnText, { color: isValid ? '#fff' : dc.textSecondary }]}>
                  {t('hucha.save')}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Animated.View>
    </Modal>
  );
};

const HuchaScreen = () => {
  const { t } = useTranslation();
  const { colors: dc } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { huchas, getTotalSaved, getTotalTarget, showCreateModal, setShowCreateModal } = useSavingsStore();
  const { getCurrencySymbol } = useSettingsStore();
  const { isSharedMode, getSharedCurrencySymbol } = useSharedAccountStore();
  const currencySymbol = isSharedMode ? getSharedCurrencySymbol() : getCurrencySymbol();

  const totalSaved = getTotalSaved();
  const totalTarget = getTotalTarget();
  const overallPct = totalTarget > 0
    ? Math.min(Math.round((totalSaved / totalTarget) * 100), 100)
    : 0;

  return (
    <View style={[styles.container, { backgroundColor: dc.background }]}>
      <AppHeader title={t('hucha.title')} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Tarjeta totales */}
        {huchas.length > 0 && (
          <View style={[styles.totalCard, { backgroundColor: dc.balanceCard }]}>
            <Text style={styles.totalLabel}>{t('hucha.totalSaved')}</Text>
            <Text style={styles.totalAmount}>
              {formatAmount(totalSaved)} {currencySymbol}
            </Text>
            <View style={styles.totalProgressBar}>
              <View style={[styles.totalProgressFill, { width: `${overallPct}%` as any }]} />
            </View>
            <View style={styles.totalProgressRow}>
              <Text style={styles.totalGoalsCount}>
                {overallPct}% {t('hucha.of')} {formatAmount(totalTarget)} {currencySymbol}
              </Text>
              <Text style={styles.totalGoalsCount}>
                {t('hucha.activeGoals', { count: huchas.length })}
              </Text>
            </View>
          </View>
        )}

        {/* Lista de huchas */}
        {huchas.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🐷</Text>
            <Text style={[styles.emptyText, { color: dc.textPrimary }]}>
              {t('hucha.noGoals')}
            </Text>
            <Text style={[styles.emptySubtext, { color: dc.textSecondary }]}>
              {t('hucha.noGoalsSubtitle')}
            </Text>
          </View>
        ) : (
          huchas.map(hucha => (
            <HuchaCard
              key={hucha.id}
              hucha={hucha}
              onPress={() => navigation.navigate('HuchaDetail', { huchaId: hucha.id })}
            />
          ))
        )}

      </ScrollView>

      <CreateHuchaModal
        visible={showCreateModal}
        onDismiss={() => setShowCreateModal(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 100 },

  totalCard: {
    borderRadius: 20, padding: 24, marginBottom: 16, alignItems: 'center',
  },
  totalLabel: {
    fontSize: 13, fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.8)', marginBottom: 4,
  },
  totalAmount: {
    fontSize: 36, fontFamily: 'Poppins_700Bold', color: '#FFFFFF', marginBottom: 12,
  },
  totalProgressBar: {
    width: '100%', height: 6, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.25)', marginBottom: 8,
  },
  totalProgressFill: {
    height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.9)',
  },
  totalProgressRow: {
    flexDirection: 'row', justifyContent: 'space-between', width: '100%',
  },
  totalGoalsCount: {
    fontSize: 12, fontFamily: 'Poppins_400Regular', color: 'rgba(255,255,255,0.7)',
  },

  card: {
    borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 0.5,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 12 },
  cardIcon: {
    width: 46, height: 46, borderRadius: 23,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  cardMeta: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 2 },
  cardPct: { fontSize: 16, fontFamily: 'Poppins_700Bold', flexShrink: 0 },
  progressBar: { height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 8 },
  progressFill: { height: 6, borderRadius: 3 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardAmount: { fontSize: 14, fontFamily: 'Poppins_600SemiBold' },
  cardTarget: { fontSize: 12, fontFamily: 'Poppins_400Regular' },

  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyText: { fontSize: 18, fontFamily: 'Poppins_600SemiBold', marginBottom: 8 },
  emptySubtext: {
    fontSize: 13, fontFamily: 'Poppins_400Regular',
    textAlign: 'center', paddingHorizontal: 32,
  },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, maxHeight: '90%',
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    alignSelf: 'center', marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 18, fontFamily: 'Poppins_600SemiBold', marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 12, fontFamily: 'Poppins_600SemiBold',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 10, marginTop: 4,
  },
  iconGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16,
  },
  iconOption: {
    width: 48, height: 48, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', borderWidth: 1.5,
  },
  colorRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  colorDot: {
    width: 32, height: 32, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
  },
  colorDotSelected: { borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.6)' },
  input: {
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 12, fontSize: 15, fontFamily: 'Poppins_400Regular',
    marginBottom: 12,
  },
  sheetButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  sheetBtn: {
    flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  sheetBtnText: { fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
});

export default HuchaScreen;
