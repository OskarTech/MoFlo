import React, { useEffect, useRef, useState } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput,
  Modal, Animated, Platform, StatusBar, Keyboard, Switch,
} from 'react-native';
import { Text, Button } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSavingsStore } from '../../store/savingsStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useSharedAccountStore } from '../../store/sharedAccountStore';
import { useTheme } from '../../hooks/useTheme';

type RouteParams = { HuchaDetail: { huchaId: string } };

const FILL_HEIGHT = 200;
const QUICK_AMOUNTS = [10, 25, 50, 100];

const MONTH_NAMES: Record<string, string> = {
  '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic',
};

const formatTargetDate = (yyyyMM?: string): string => {
  if (!yyyyMM) return '';
  const [year, month] = yyyyMM.split('-');
  return `${MONTH_NAMES[month] ?? month} ${year}`;
};

const formatNextDate = (isoDate?: string): string => {
  if (!isoDate) return '';
  const d = new Date(isoDate);
  const day = d.getDate();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day} ${MONTH_NAMES[month]}`;
};

const AddMoneyModal = ({
  visible,
  huchaColor,
  onConfirm,
  onDismiss,
}: {
  visible: boolean;
  huchaColor: string;
  onConfirm: (amount: number) => void;
  onDismiss: () => void;
}) => {
  const { t } = useTranslation();
  const { colors: dc } = useTheme();
  const insets = useSafeAreaInsets();
  const sheetOffset = useRef(new Animated.Value(0)).current;
  const [amount, setAmount] = useState('');

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

  const handleConfirm = () => {
    const parsed = parseFloat(amount.replace(',', '.'));
    if (!parsed || parsed <= 0) return;
    onConfirm(parsed);
    setAmount('');
  };

  const handleDismiss = () => { setAmount(''); onDismiss(); };
  const isValid = parseFloat(amount.replace(',', '.')) > 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleDismiss}>
      <Animated.View style={[styles.modalOverlay, { transform: [{ translateY: sheetOffset }] }]}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={handleDismiss} />
        <View style={[styles.sheet, { backgroundColor: dc.surface, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.sheetHandle, { backgroundColor: dc.border }]} />
          <Text style={[styles.sheetTitle, { color: dc.textPrimary }]}>{t('hucha.addMoneyTitle')}</Text>
          <TextInput
            style={[styles.input, { backgroundColor: dc.background, borderColor: dc.border, color: dc.textPrimary }]}
            placeholder={t('hucha.amount')}
            placeholderTextColor={dc.textSecondary}
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
            autoFocus
          />
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
              onPress={handleConfirm}
              disabled={!isValid}
              style={styles.saveButton}
              buttonColor={huchaColor}
              textColor="#FFFFFF"
            >
              {t('hucha.save')}
            </Button>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
};

const HuchaDetailScreen = () => {
  const { t } = useTranslation();
  const { colors: dc, isDark } = useTheme();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, 'HuchaDetail'>>();
  const insets = useSafeAreaInsets();

  const { huchas, addToHucha, deleteHucha, updateHucha, showAddMoneyModal, setShowAddMoneyModal } = useSavingsStore();
  const { getCurrencySymbol } = useSettingsStore();
  const { isSharedMode, getSharedCurrencySymbol } = useSharedAccountStore();
  const currencySymbol = isSharedMode ? getSharedCurrencySymbol() : getCurrencySymbol();

  const hucha = huchas.find(h => h.id === route.params.huchaId);

  const fillAnim = useRef(new Animated.Value(0)).current;

  const pct = hucha && hucha.targetAmount > 0
    ? Math.min((hucha.currentAmount / hucha.targetAmount) * 100, 100)
    : 0;

  useEffect(() => {
    Animated.timing(fillAnim, {
      toValue: pct,
      duration: 900,
      useNativeDriver: false,
    }).start();
  }, [pct]);

  const fillHeight = fillAnim.interpolate({
    inputRange: [0, 100],
    outputRange: [0, FILL_HEIGHT],
  });

  if (!hucha) {
    return (
      <View style={[styles.container, { backgroundColor: dc.background }]}>
        <Text style={{ color: dc.textSecondary, padding: 24 }}>Hucha no encontrada</Text>
      </View>
    );
  }

  const remaining = Math.max(hucha.targetAmount - hucha.currentAmount, 0);
  const monthsEstimate = hucha.isAutomatic && hucha.monthlyAmount && hucha.monthlyAmount > 0
    ? Math.ceil(remaining / hucha.monthlyAmount)
    : null;

  const headerBg = isDark ? dc.surface : dc.secondary;
  const headerColor = isDark ? dc.textPrimary : '#fff';
  const paddingTop = Platform.OS === 'android'
    ? (StatusBar.currentHeight ?? 0) + 12
    : insets.top + 12;

  const handleDelete = () => {
    Alert.alert(
      t('hucha.deleteConfirm'),
      t('hucha.deleteConfirmMsg'),
      [
        { text: t('hucha.cancel'), style: 'cancel' },
        {
          text: t('hucha.delete'), style: 'destructive',
          onPress: async () => {
            await deleteHucha(hucha.id);
            navigation.goBack();
          },
        },
      ]
    );
  };

  const handleQuickAdd = async (amount: number) => {
    await addToHucha(hucha.id, amount);
  };

  const handleAddMoney = async (amount: number) => {
    setShowAddMoneyModal(false);
    await addToHucha(hucha.id, amount);
  };

  const handleToggleAutomatic = async (value: boolean) => {
    const nextDate = value
      ? (() => {
          const d = new Date();
          d.setDate(1);
          d.setMonth(d.getMonth() + 1);
          return d.toISOString();
        })()
      : undefined;
    await updateHucha(hucha.id, { isAutomatic: value, nextContributionDate: nextDate });
  };

  return (
    <View style={[styles.container, { backgroundColor: dc.background }]}>
      {/* Custom header */}
      <View style={[styles.header, { backgroundColor: headerBg, paddingTop }]}>
        <TouchableOpacity
          style={[styles.headerBtn, { backgroundColor: isDark ? dc.border + '80' : 'rgba(255,255,255,0.15)' }]}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={20} color={headerColor} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          {hucha.targetDate && (
            <Text style={[styles.headerSubtitle, { color: isDark ? dc.textSecondary : 'rgba(255,255,255,0.7)' }]}>
              {t('hucha.goalMeta', { date: formatTargetDate(hucha.targetDate) })}
            </Text>
          )}
          <Text style={[styles.headerTitle, { color: headerColor }]} numberOfLines={1}>
            {hucha.name}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.headerBtn, { backgroundColor: isDark ? dc.border + '80' : 'rgba(255,255,255,0.15)' }]}
          onPress={handleDelete}
        >
          <Ionicons name="trash-outline" size={20} color={headerColor} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Liquid fill */}
        <View style={styles.fillWrapper}>
          <View style={[styles.fillContainer, { backgroundColor: dc.border }]}>
            <Animated.View
              style={[
                styles.fillBar,
                { height: fillHeight, backgroundColor: hucha.color },
              ]}
            />
            <View style={styles.fillOverlay}>
              <Text style={styles.fillPct}>{Math.round(pct)}%</Text>
            </View>
          </View>
        </View>

        {/* Importes */}
        <View style={styles.amountsRow}>
          <Text style={[styles.currentAmount, { color: dc.textPrimary }]}>
            {hucha.currentAmount.toFixed(2)}
          </Text>
          <Text style={[styles.targetAmount, { color: dc.textSecondary }]}>
            {'/'}{hucha.targetAmount.toFixed(2)} {currencySymbol}
          </Text>
        </View>

        {remaining > 0 && monthsEstimate !== null && (
          <Text style={[styles.estimate, { color: dc.textSecondary }]}>
            {t('hucha.remaining', { amount: remaining.toFixed(2) })}
            {' · '}
            {t('hucha.monthsEstimate', { months: monthsEstimate })}
          </Text>
        )}

        {/* Quick add */}
        <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
          {t('hucha.quickAdd')}
        </Text>
        <View style={styles.quickRow}>
          {QUICK_AMOUNTS.map(a => (
            <TouchableOpacity
              key={a}
              style={[styles.quickBtn, { backgroundColor: dc.surface, borderColor: dc.border }]}
              onPress={() => handleQuickAdd(a)}
              activeOpacity={0.7}
            >
              <Text style={[styles.quickBtnText, { color: hucha.color }]}>+{a}€</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Automático */}
        <View style={[styles.automaticCard, { backgroundColor: dc.surface, borderColor: dc.border }]}>
          <View style={styles.automaticRow}>
            <View style={[styles.automaticIconWrap, { backgroundColor: hucha.color + '20' }]}>
              <Ionicons name="repeat" size={20} color={hucha.color} />
            </View>
            <View style={styles.automaticInfo}>
              <Text style={[styles.automaticLabel, { color: dc.textPrimary }]}>
                {t('hucha.automatic')}
              </Text>
              {hucha.isAutomatic && hucha.monthlyAmount && (
                <Text style={[styles.automaticMeta, { color: dc.textSecondary }]}>
                  {hucha.monthlyAmount} {t('hucha.everyMonth')}
                  {hucha.nextContributionDate
                    ? ` · ${t('hucha.nextContribution', { date: formatNextDate(hucha.nextContributionDate) })}`
                    : ''}
                </Text>
              )}
            </View>
            <Switch
              value={hucha.isAutomatic}
              onValueChange={handleToggleAutomatic}
              trackColor={{ false: dc.border, true: hucha.color }}
              thumbColor="#fff"
            />
          </View>
        </View>

      </ScrollView>

      <AddMoneyModal
        visible={showAddMoneyModal}
        huchaColor={hucha.color}
        onConfirm={handleAddMoney}
        onDismiss={() => setShowAddMoneyModal(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12, gap: 8,
  },
  headerBtn: {
    width: 38, height: 38, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerSubtitle: { fontSize: 10, fontFamily: 'Poppins_600SemiBold', letterSpacing: 0.8, textTransform: 'uppercase' },
  headerTitle: { fontSize: 16, fontFamily: 'Poppins_600SemiBold' },

  scrollContent: { padding: 24, paddingBottom: 100 },

  fillWrapper: { alignItems: 'center', marginBottom: 24 },
  fillContainer: {
    width: 160,
    height: FILL_HEIGHT,
    borderRadius: 24,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  fillBar: {
    width: '100%',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  fillOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fillPct: {
    fontSize: 32, fontFamily: 'Poppins_700Bold', color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },

  amountsRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', marginBottom: 6 },
  currentAmount: { fontSize: 32, fontFamily: 'Poppins_700Bold' },
  targetAmount: { fontSize: 18, fontFamily: 'Poppins_400Regular', marginLeft: 4 },
  estimate: { fontSize: 13, fontFamily: 'Poppins_400Regular', textAlign: 'center', marginBottom: 28 },

  sectionLabel: {
    fontSize: 12, fontFamily: 'Poppins_600SemiBold',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10,
  },
  quickRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  quickBtn: {
    flex: 1, borderRadius: 12, borderWidth: 1,
    paddingVertical: 12, alignItems: 'center',
  },
  quickBtnText: { fontSize: 15, fontFamily: 'Poppins_600SemiBold' },

  automaticCard: {
    borderRadius: 16, borderWidth: 0.5, padding: 16, marginBottom: 24,
  },
  automaticRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  automaticIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  automaticInfo: { flex: 1 },
  automaticLabel: { fontSize: 14, fontFamily: 'Poppins_500Medium' },
  automaticMeta: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 2 },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    alignSelf: 'center', marginBottom: 20,
  },
  sheetTitle: { fontSize: 18, fontFamily: 'Poppins_600SemiBold', marginBottom: 16 },
  input: {
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 12, fontSize: 15, fontFamily: 'Poppins_400Regular', marginBottom: 12,
  },
  sheetButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelButton: { flex: 1 },
  saveButton: { flex: 2 },
});

export default HuchaDetailScreen;
