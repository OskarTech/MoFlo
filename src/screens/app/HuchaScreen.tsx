import React, { useState, useEffect, useRef } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Modal, Platform, Animated, Keyboard,
} from 'react-native';
import { Text, Button } from 'react-native-paper';
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

  const isClosed = !!hucha.closedAt;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        { backgroundColor: dc.surface, borderColor: dc.border },
        isClosed && { opacity: 0.65 },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.cardIcon, { backgroundColor: hucha.color + '20' }]}>
          <Ionicons
            name={isClosed ? 'checkmark-circle' : (hucha.icon as keyof typeof Ionicons.glyphMap)}
            size={24}
            color={hucha.color}
          />
        </View>
        <View style={styles.cardInfo}>
          <Text style={[styles.cardName, { color: dc.textPrimary }]} numberOfLines={1}>
            {hucha.name}
          </Text>
          {isClosed ? (
            <View style={styles.cardMetaRow}>
              <Ionicons name="lock-closed" size={11} color={dc.textSecondary} />
              <Text style={[styles.cardMeta, { color: dc.textSecondary }]}>
                {t('hucha.closedBadge')}
              </Text>
            </View>
          ) : (hucha.targetDate || hucha.isAutomatic) && (
            <View style={styles.cardMetaRow}>
              <Ionicons name="calendar-outline" size={11} color={dc.textSecondary} />
              <Text style={[styles.cardMeta, { color: dc.textSecondary }]}>
                {hucha.targetDate ? formatTargetDate(hucha.targetDate) : ''}
                {hucha.targetDate && hucha.isAutomatic ? ' · ' : ''}
                {hucha.isAutomatic && hucha.monthlyAmount
                  ? t('hucha.everyMonth', { amount: hucha.monthlyAmount, symbol: currencySymbol })
                  : ''}
              </Text>
            </View>
          )}
        </View>
        <Text style={[styles.cardPct, { color: hucha.color }]}>{pct}%</Text>
      </View>

      <View style={[styles.progressBar, { backgroundColor: hucha.color + '25' }]}>
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
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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
              <Button
                mode="outlined"
                onPress={handleDismiss}
                style={[styles.cancelButton, { borderColor: dc.border }]}
                textColor={dc.textSecondary}
              >
                {t('hucha.cancel')}
              </Button>
              <Button
                mode="contained"
                onPress={handleSave}
                disabled={!isValid || isSaving}
                style={styles.saveButton}
                buttonColor={selectedColor}
                textColor="#FFFFFF"
              >
                {t('hucha.save')}
              </Button>
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
  const { huchas, huchaMovements, getTotalTarget, showCreateModal, setShowCreateModal } = useSavingsStore();
  const { getCurrencySymbol } = useSettingsStore();
  const { isSharedMode, getSharedCurrencySymbol } = useSharedAccountStore();
  const currencySymbol = isSharedMode ? getSharedCurrencySymbol() : getCurrencySymbol();
  const activeHuchas = huchas.filter(h => !h.closedAt);
  const closedHuchas = huchas.filter(h => !!h.closedAt);
  const totalSaved = activeHuchas.reduce((acc, h) => acc + h.currentAmount, 0);
  const totalTarget = getTotalTarget();
  const overallPct = totalTarget > 0
    ? Math.min(Math.round((totalSaved / totalTarget) * 100), 100)
    : 0;

  const now = new Date();
  const thisMonthDeposited = huchaMovements
    .filter(m => {
      const d = new Date(m.date);
      return m.type === 'deposit'
        && d.getMonth() === now.getMonth()
        && d.getFullYear() === now.getFullYear();
    })
    .reduce((sum, m) => sum + m.amount, 0);

  return (
    <View style={[styles.container, { backgroundColor: dc.background }]}>
      <AppHeader title={t('hucha.title')} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Tarjeta totales */}
        {activeHuchas.length > 0 && (
          <View style={[styles.totalCard, { backgroundColor: dc.surface, borderColor: dc.border }]}>
            <View style={styles.totalCardTop}>
              <Text style={[styles.totalLabel, { color: dc.textSecondary }]}>
                {t('hucha.totalSaved').toUpperCase()}
              </Text>
              {thisMonthDeposited > 0 && (
                <Text style={[styles.thisMonthText, { color: dc.savings }]}>
                  {t('hucha.thisMonthAdded', { amount: formatAmount(thisMonthDeposited), symbol: currencySymbol })}
                </Text>
              )}
            </View>
            <Text style={[styles.totalAmount, { color: dc.textPrimary }]}>
              {formatAmount(totalSaved)} {currencySymbol}
            </Text>
            <View style={[styles.totalProgressBar, { backgroundColor: dc.border }]}>
              <View style={[styles.totalProgressFill, { width: `${overallPct}%` as any, backgroundColor: dc.primary }]} />
            </View>
            <View style={styles.totalProgressRow}>
              <Text style={[styles.totalGoalsCount, { color: dc.textSecondary }]}>
                {overallPct}% {t('hucha.of')} {formatAmount(totalTarget)} {currencySymbol}
              </Text>
              <Text style={[styles.totalGoalsCount, { color: dc.textSecondary }]}>
                {activeHuchas.length} {t('hucha.activeGoals')}
              </Text>
            </View>
          </View>
        )}

        {/* Lista de huchas activas */}
        {activeHuchas.length === 0 && closedHuchas.length === 0 ? (
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
          activeHuchas.map(hucha => (
            <HuchaCard
              key={hucha.id}
              hucha={hucha}
              onPress={() => navigation.navigate('HuchaDetail', { huchaId: hucha.id })}
            />
          ))
        )}

        {closedHuchas.length > 0 && (
          <>
            <Text style={[styles.closedSectionLabel, { color: dc.textSecondary }]}>
              {t('hucha.completedSection')}
            </Text>
            {closedHuchas.map(hucha => (
              <HuchaCard
                key={hucha.id}
                hucha={hucha}
                onPress={() => navigation.navigate('HuchaDetail', { huchaId: hucha.id })}
              />
            ))}
          </>
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
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100 },

  pageHeader: { marginBottom: 20 },
  pageSubtitle: {
    fontSize: 11, fontFamily: 'Poppins_600SemiBold',
    textTransform: 'uppercase', letterSpacing: 1.5,
  },
  pageTitle: { fontSize: 32, fontFamily: 'Poppins_700Bold', marginTop: 2 },

  totalCard: {
    borderRadius: 20, padding: 20, marginBottom: 16, borderWidth: 0.5,
  },
  totalCardTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2,
  },
  totalLabel: {
    fontSize: 11, fontFamily: 'Poppins_600SemiBold', letterSpacing: 0.8,
  },
  thisMonthText: {
    fontSize: 12, fontFamily: 'Poppins_600SemiBold',
  },
  totalAmount: {
    fontSize: 34, fontFamily: 'Poppins_700Bold', marginBottom: 12, marginTop: 4,
  },
  totalProgressBar: {
    width: '100%', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 8,
  },
  totalProgressFill: {
    height: 8, borderRadius: 4,
  },
  totalProgressRow: {
    flexDirection: 'row', justifyContent: 'space-between', width: '100%',
  },
  totalGoalsCount: {
    fontSize: 12, fontFamily: 'Poppins_400Regular',
  },
  closedSectionLabel: {
    fontSize: 12, fontFamily: 'Poppins_600SemiBold',
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginTop: 16, marginBottom: 8, marginLeft: 4,
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
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  cardMeta: { fontSize: 12, fontFamily: 'Poppins_400Regular' },
  cardPct: { fontSize: 16, fontFamily: 'Poppins_700Bold', flexShrink: 0 },
  progressBar: { height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 10 },
  progressFill: { height: 6, borderRadius: 3 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardAmount: { fontSize: 14, fontFamily: 'Poppins_600SemiBold' },
  cardTarget: { fontSize: 12, fontFamily: 'Poppins_400Regular' },

  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyText: { fontSize: 18, fontFamily: 'Poppins_600SemiBold', marginBottom: 8 },
  emptySubtext: {
    fontSize: 13, fontFamily: 'Poppins_400Regular',
    textAlign: 'center', paddingHorizontal: 32, marginBottom: 24,
  },
  createCardBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 16, borderRadius: 16, marginTop: 4, borderWidth: 0.5,
  },
  createBtnIconBox: {
    width: 36, height: 36, borderRadius: 10, borderWidth: 1.5,
    justifyContent: 'center', alignItems: 'center',
  },
  createCardBtnText: { fontSize: 15, fontFamily: 'Poppins_500Medium' },

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
  cancelButton: { flex: 1 },
  saveButton: { flex: 2 },
});

export default HuchaScreen;
