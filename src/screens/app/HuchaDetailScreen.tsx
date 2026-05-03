import React, { useEffect, useRef, useState } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity, Alert,
  Modal, Animated, Platform, StatusBar, Keyboard, Switch,
  TextInput as RNTextInput, KeyboardAvoidingView, Dimensions,
} from 'react-native';
import { Text, Button, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSavingsStore } from '../../store/savingsStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useSharedAccountStore } from '../../store/sharedAccountStore';
import { usePremium } from '../../hooks/usePremium';
import PremiumModal from '../../components/common/PremiumModal';
import { useTheme } from '../../hooks/useTheme';
import { colors } from '../../theme';
import { HuchaMovementType } from '../../types';
import { formatDate } from '../../utils/dateFormat';

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
  huchaCurrentAmount,
  availableBalance,
  currencySymbol,
  onConfirm,
  onDismiss,
}: {
  visible: boolean;
  huchaColor: string;
  huchaCurrentAmount: number;
  availableBalance: number;
  currencySymbol: string;
  onConfirm: (amount: number, type: HuchaMovementType) => void;
  onDismiss: () => void;
}) => {
  const { t } = useTranslation();
  const { colors: dc, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const sheetOffset = useRef(new Animated.Value(0)).current;
  const isSavingRef = useRef(false);
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<HuchaMovementType>('deposit');

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
    if (isSavingRef.current) return;
    const parsed = parseFloat(amount.replace(',', '.'));
    if (!parsed || parsed <= 0) return;
    if (mode === 'withdrawal' && parsed > huchaCurrentAmount) return;
    if (mode === 'deposit' && parsed > availableBalance) return;
    isSavingRef.current = true;
    onConfirm(parsed, mode);
    setAmount('');
    setMode('deposit');
    setTimeout(() => { isSavingRef.current = false; }, 600);
  };

  const handleDismiss = () => {
    setAmount('');
    setMode('deposit');
    onDismiss();
  };

  const parsed = parseFloat(amount.replace(',', '.'));
  const isValid = parsed > 0
    && (mode === 'deposit' ? parsed <= availableBalance : parsed <= huchaCurrentAmount);
  const activeColor = mode === 'deposit' ? huchaColor : dc.expense;
  const inputBg = isDark ? dc.background : '#FFFFFF';
  const projectedAmount = !isNaN(parsed) && parsed > 0
    ? mode === 'deposit'
      ? huchaCurrentAmount + parsed
      : Math.max(0, huchaCurrentAmount - parsed)
    : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleDismiss}>
      <Animated.View style={[styles.modalOverlay, { transform: [{ translateY: sheetOffset }] }]}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={handleDismiss} />
        <View style={[styles.sheet, { backgroundColor: dc.surface, paddingBottom: insets.bottom + 24 }]}>
          <View style={[styles.sheetHandle, { backgroundColor: dc.border }]} />

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={[styles.sheetTitle, { color: dc.textPrimary }]}>
              {mode === 'deposit' ? t('hucha.addMoneyTitle') : t('hucha.withdrawMoneyTitle')}
            </Text>

            {/* Mode tabs */}
            <View style={styles.modeTabs}>
              <TouchableOpacity
                style={[
                  styles.modeTab,
                  { backgroundColor: isDark ? dc.border : '#F0F0F0' },
                  mode === 'deposit' && { backgroundColor: huchaColor },
                ]}
                onPress={() => setMode('deposit')}
                activeOpacity={0.8}
              >
                <Ionicons name="add" size={15} color={mode === 'deposit' ? '#fff' : dc.textSecondary} />
                <Text style={[styles.modeTabText, { color: mode === 'deposit' ? '#fff' : dc.textSecondary }]}>
                  {t('hucha.deposit')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modeTab,
                  { backgroundColor: isDark ? dc.border : '#F0F0F0' },
                  mode === 'withdrawal' && { backgroundColor: dc.expense },
                ]}
                onPress={() => setMode('withdrawal')}
                activeOpacity={0.8}
              >
                <Ionicons name="remove" size={15} color={mode === 'withdrawal' ? '#fff' : dc.textSecondary} />
                <Text style={[styles.modeTabText, { color: mode === 'withdrawal' ? '#fff' : dc.textSecondary }]}>
                  {t('hucha.withdraw')}
                </Text>
              </TouchableOpacity>
            </View>

            <TextInput
              label={t('hucha.amount')}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              mode="outlined"
              style={[styles.input, { backgroundColor: inputBg }]}
              outlineColor={dc.border}
              activeOutlineColor={activeColor}
              left={<TextInput.Affix text={currencySymbol} />}
            />

            {projectedAmount !== null && (
              <View style={[styles.previewRow, { backgroundColor: activeColor + '15', borderColor: activeColor + '30' }]}>
                <Text style={[styles.previewLabel, { color: dc.textSecondary }]}>
                  {huchaCurrentAmount.toFixed(2)} {currencySymbol}
                </Text>
                <Ionicons name="arrow-forward" size={14} color={activeColor} />
                <Text style={[styles.previewNew, { color: activeColor }]}>
                  {projectedAmount.toFixed(2)} {currencySymbol}
                </Text>
              </View>
            )}

            {mode === 'withdrawal' && parsed > 0 && parsed > huchaCurrentAmount && (
              <Text style={styles.errorText}>{t('hucha.insufficientFunds')}</Text>
            )}

            {mode === 'deposit' && parsed > 0 && parsed > availableBalance && (
              <Text style={styles.errorText}>{t('hucha.insufficientFunds')}</Text>
            )}

            {mode === 'deposit' && (
              <Text style={[styles.balanceHint, { color: dc.textSecondary }]}>
                {t('home.availableBalance')}: {availableBalance.toFixed(2)} {currencySymbol}
              </Text>
            )}

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
                buttonColor={activeColor}
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

const HuchaDetailScreen = () => {
  const { t } = useTranslation();
  const { colors: dc, isDark } = useTheme();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, 'HuchaDetail'>>();
  const insets = useSafeAreaInsets();

  const {
    huchas, huchaMovements,
    addToHucha, deleteHucha, updateHucha,
    closeHucha, reopenHucha,
    showAddMoneyModal, setShowAddMoneyModal,
    getAvailableBalance,
  } = useSavingsStore();
  const availableBalance = getAvailableBalance();
  const { getCurrencySymbol } = useSettingsStore();
  const { isSharedMode, getSharedCurrencySymbol } = useSharedAccountStore();
  const currencySymbol = isSharedMode ? getSharedCurrencySymbol() : getCurrencySymbol();
  const { isPremium, showModal: showPremiumModal, setShowModal: setShowPremiumModal } = usePremium();

  const hucha = huchas.find(h => h.id === route.params.huchaId);

  const fillAnim = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const headerH = useRef(0);
  const autoInputRowRef = useRef<View>(null);
  const showAutoInputRef = useRef(false);

  const [showAutoInput, setShowAutoInput] = useState(false);
  const [autoAmount, setAutoAmount] = useState('');
  const [autoDay, setAutoDay] = useState('');
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [editName, setEditName] = useState('');
  const [editTarget, setEditTarget] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const hasTarget = !!hucha && hucha.targetAmount > 0;
  const pct = hasTarget
    ? Math.min((hucha!.currentAmount / hucha!.targetAmount) * 100, 100)
    : 0;

  useEffect(() => {
    Animated.timing(fillAnim, {
      toValue: hasTarget ? pct : 100,
      duration: 900,
      useNativeDriver: false,
    }).start();
  }, [pct, hasTarget]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => {
      if (!showAutoInputRef.current || !autoInputRowRef.current) return;
      // screenY = top del teclado en coordenadas absolutas de pantalla
      const keyboardTop = e.endCoordinates.screenY;
      setTimeout(() => {
        // measure() da pageY = posición absoluta en la pantalla
        autoInputRowRef.current?.measure((x, y, w, h, _pageX, pageY) => {
          const inputBottom = pageY + h + 24;
          if (inputBottom > keyboardTop) {
            const delta = inputBottom - keyboardTop;
            scrollRef.current?.scrollTo({ y: scrollY.current + delta, animated: true });
          }
        });
      }, 100);
    });
    const hide = Keyboard.addListener(hideEvent, () => {});
    return () => { show.remove(); hide.remove(); };
  }, []);

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

  const recentMovements = huchaMovements
    .filter(m => m.huchaId === hucha.id)
    .slice(0, 4);

  const remaining = hasTarget ? Math.max(hucha.targetAmount - hucha.currentAmount, 0) : 0;
  const monthsEstimate = hasTarget && hucha.isAutomatic && hucha.monthlyAmount && hucha.monthlyAmount > 0
    ? Math.ceil(remaining / hucha.monthlyAmount)
    : null;

  const headerBg = isDark ? dc.surface : dc.secondary;
  const headerColor = isDark ? dc.textPrimary : '#fff';
  const paddingTop = Platform.OS === 'android'
    ? (StatusBar.currentHeight ?? 0) + 12
    : insets.top + 12;

  const isClosed = !!hucha.closedAt;

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

  const handleClose = () => {
    Alert.alert(
      t('hucha.closeConfirmTitle'),
      t('hucha.closeConfirmMsg'),
      [
        { text: t('hucha.cancel'), style: 'cancel' },
        {
          text: t('hucha.close'),
          onPress: async () => {
            await closeHucha(hucha.id);
          },
        },
      ]
    );
  };

  const handleReopen = () => {
    const activeCount = huchas.filter(h => !h.closedAt && h.id !== hucha.id).length;
    if (!isPremium && !isSharedMode && activeCount >= 1) {
      setShowPremiumModal(true);
      return;
    }
    Alert.alert(
      t('hucha.reopenConfirmTitle'),
      t('hucha.reopenConfirmMsg'),
      [
        { text: t('hucha.cancel'), style: 'cancel' },
        {
          text: t('hucha.reopen'),
          onPress: async () => {
            await reopenHucha(hucha.id);
          },
        },
      ]
    );
  };

  const handleMoreMenu = () => {
    setEditName(hucha.name);
    setEditTarget(String(hucha.targetAmount));
    setShowActionsMenu(true);
  };

  const parsedEditTarget = parseFloat(editTarget.replace(',', '.'));
  const trimmedEditName = editName.trim();
  const editTargetTooLow = hasTarget
    && !isNaN(parsedEditTarget)
    && parsedEditTarget < hucha.currentAmount;
  const editChanged = hasTarget
    ? (trimmedEditName !== hucha.name || parsedEditTarget !== hucha.targetAmount)
    : trimmedEditName !== hucha.name;
  const editValid = hasTarget
    ? (trimmedEditName.length > 0 && parsedEditTarget > 0 && !editTargetTooLow && editChanged)
    : (trimmedEditName.length > 0 && editChanged);

  const handleSaveEdit = async () => {
    if (!editValid || isSavingEdit) return;
    setIsSavingEdit(true);
    await updateHucha(hucha.id, hasTarget
      ? { name: trimmedEditName, targetAmount: parsedEditTarget }
      : { name: trimmedEditName }
    );
    setIsSavingEdit(false);
    setShowActionsMenu(false);
  };

  const handleQuickAdd = async (amount: number) => {
    if (amount > availableBalance) {
      Alert.alert(t('hucha.insufficientFunds'));
      return;
    }
    await addToHucha(hucha.id, amount, 'deposit');
  };

  const handleAddMoney = (amount: number, type: HuchaMovementType) => {
    if (type === 'deposit' && amount > availableBalance) {
      Alert.alert(t('hucha.insufficientFunds'));
      return;
    }
    setShowAddMoneyModal(false);
    addToHucha(hucha.id, amount, type);
  };

  const handleToggleAutomatic = async (value: boolean) => {
    if (value) {
      showAutoInputRef.current = true;
      setAutoAmount(hucha.monthlyAmount ? String(hucha.monthlyAmount) : '');
      setAutoDay(hucha.recurringDay ? String(hucha.recurringDay) : '1');
      setShowAutoInput(true);
    } else {
      showAutoInputRef.current = false;
      setShowAutoInput(false);
      setAutoAmount('');
      setAutoDay('');
      await updateHucha(hucha.id, {
        isAutomatic: false,
        monthlyAmount: undefined,
        recurringDay: undefined,
        nextContributionDate: undefined,
      });
    }
  };

  const handleSaveAutomatic = async () => {
    const parsed = parseFloat(autoAmount.replace(',', '.'));
    if (!parsed || parsed <= 0) return;
    const dayParsed = parseInt(autoDay, 10);
    if (!dayParsed || dayParsed < 1 || dayParsed > 31) return;
    const today = new Date();
    let monthIdx = today.getMonth();
    if (today.getDate() >= dayParsed) monthIdx += 1;
    const year = today.getFullYear();
    const lastDay = new Date(year, monthIdx + 1, 0).getDate();
    const actualDay = Math.min(dayParsed, lastDay);
    const next = new Date(year, monthIdx, actualDay);
    await updateHucha(hucha.id, {
      isAutomatic: true,
      monthlyAmount: parsed,
      recurringDay: dayParsed,
      nextContributionDate: next.toISOString(),
    });
    showAutoInputRef.current = false;
    setShowAutoInput(false);
    setAutoAmount('');
    setAutoDay('');
  };

  return (
    <View style={[styles.container, { backgroundColor: dc.background }]}>
      {/* Custom header */}
      <View
        style={[styles.header, { backgroundColor: headerBg, paddingTop }]}
        onLayout={(e) => { headerH.current = e.nativeEvent.layout.height; }}
      >
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
          onPress={handleMoreMenu}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={headerColor} />
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
      >
        {/* Liquid fill */}
        <View style={styles.fillWrapper}>
          <View style={[styles.fillContainer, { backgroundColor: dc.border }]}>
            <Animated.View
              style={[
                styles.fillBar,
                { height: fillHeight, backgroundColor: hucha.color, opacity: hasTarget ? 1 : 0.55 },
              ]}
            />
            <View style={styles.fillOverlay}>
              {hasTarget ? (
                <Text style={styles.fillPct}>{Math.round(pct)}%</Text>
              ) : (
                <Ionicons name="infinite" size={48} color="#fff" />
              )}
            </View>
          </View>
        </View>

        {isClosed && (
          <View style={[styles.closedBanner, { backgroundColor: dc.income + '15', borderColor: dc.income + '40' }]}>
            <Ionicons name="checkmark-circle" size={18} color={dc.income} />
            <Text style={[styles.closedBannerText, { color: dc.income }]}>
              {t('hucha.closedBanner', { date: formatDate(hucha.closedAt!) })}
            </Text>
          </View>
        )}

        {/* Importes */}
        <View style={styles.amountsRow}>
          <Text style={[styles.currentAmount, { color: dc.textPrimary }]}>
            {hucha.currentAmount.toFixed(2)}
          </Text>
          {hasTarget ? (
            <Text style={[styles.targetAmount, { color: dc.textSecondary }]}>
              {'/'}{hucha.targetAmount.toFixed(2)} {currencySymbol}
            </Text>
          ) : (
            <Text style={[styles.targetAmount, { color: dc.textSecondary }]}>
              {currencySymbol} · {t('hucha.accumulating')}
            </Text>
          )}
        </View>

        {remaining > 0 && monthsEstimate !== null && (
          <Text style={[styles.estimate, { color: dc.textSecondary }]}>
            {t('hucha.remaining', { amount: remaining.toFixed(2) })}
            {' · '}
            {t('hucha.monthsEstimate', { months: monthsEstimate })}
          </Text>
        )}

        {/* Quick add */}
        {!isClosed && (
          <>
            <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
              {t('hucha.quickAdd')}
            </Text>
            <View style={styles.quickRow}>
              {QUICK_AMOUNTS.map(a => {
                const disabled = a > availableBalance;
                return (
                  <TouchableOpacity
                    key={a}
                    style={[
                      styles.quickBtn,
                      { backgroundColor: dc.surface, borderColor: dc.border },
                      disabled && { opacity: 0.4 },
                    ]}
                    onPress={() => handleQuickAdd(a)}
                    activeOpacity={0.7}
                    disabled={disabled}
                  >
                    <Text style={[styles.quickBtnText, { color: hucha.color }]}>+{a}{currencySymbol}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {/* Automático */}
        {!isClosed && (
        <View style={[styles.automaticCard, { backgroundColor: dc.surface, borderColor: dc.border }]}>
          <View style={styles.automaticRow}>
            <View style={[styles.automaticIconWrap, { backgroundColor: hucha.color + '20' }]}>
              <Ionicons name="repeat" size={20} color={hucha.color} />
            </View>
            <View style={styles.automaticInfo}>
              <Text style={[styles.automaticLabel, { color: dc.textPrimary }]}>
                {t('hucha.automatic')}
              </Text>
              {hucha.isAutomatic && hucha.monthlyAmount && !showAutoInput && (
                <Text style={[styles.automaticMeta, { color: dc.textSecondary }]}>
                  {t('hucha.everyMonth', { amount: hucha.monthlyAmount, symbol: currencySymbol })}
                  {hucha.recurringDay
                    ? ` · ${t('hucha.dayN', { day: hucha.recurringDay })}`
                    : ''}
                  {hucha.nextContributionDate
                    ? ` · ${t('hucha.nextContribution', { date: formatNextDate(hucha.nextContributionDate) })}`
                    : ''}
                </Text>
              )}
            </View>
            <Switch
              value={hucha.isAutomatic || showAutoInput}
              onValueChange={handleToggleAutomatic}
              trackColor={{ false: dc.border, true: hucha.color }}
              thumbColor="#fff"
            />
          </View>

          {showAutoInput && (() => {
            const amountValid = !!autoAmount && parseFloat(autoAmount.replace(',', '.')) > 0;
            const dayParsed = parseInt(autoDay, 10);
            const dayValid = !!autoDay && dayParsed >= 1 && dayParsed <= 31;
            const canSave = amountValid && dayValid;
            return (
              <View
                ref={autoInputRowRef}
                style={[styles.autoInputBlock, { borderTopColor: dc.border }]}
              >
                <View style={styles.autoDayRow}>
                  <Text style={[styles.autoDayLabel, { color: dc.textSecondary }]}>
                    {t('hucha.chooseDayOfMonth')}
                  </Text>
                  <RNTextInput
                    style={[styles.autoDayInput, { backgroundColor: dc.background, borderColor: dc.border, color: dc.textPrimary }]}
                    placeholder={t('hucha.dayOfMonth')}
                    placeholderTextColor={dc.textSecondary}
                    keyboardType="number-pad"
                    value={autoDay}
                    onChangeText={(v) => setAutoDay(v.replace(/[^0-9]/g, '').slice(0, 2))}
                    maxLength={2}
                  />
                </View>
                <View style={styles.autoAmountRow}>
                  <RNTextInput
                    style={[styles.autoInput, { backgroundColor: dc.background, borderColor: dc.border, color: dc.textPrimary }]}
                    placeholder={t('hucha.automaticAmount')}
                    placeholderTextColor={dc.textSecondary}
                    keyboardType="decimal-pad"
                    value={autoAmount}
                    onChangeText={setAutoAmount}
                  />
                  <TouchableOpacity
                    style={[
                      styles.autoSaveBtn,
                      { backgroundColor: hucha.color },
                      !canSave && { opacity: 0.4 },
                    ]}
                    onPress={handleSaveAutomatic}
                    activeOpacity={0.8}
                    disabled={!canSave}
                  >
                    <Text style={styles.autoSaveBtnText}>{t('hucha.save')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })()}
        </View>
        )}

        {/* Mini historial de movimientos */}
        {recentMovements.length > 0 && (
          <View style={[styles.historyCard, { backgroundColor: dc.surface, borderColor: dc.border }]}>
            <Text style={[styles.sectionLabel, { color: dc.textSecondary, marginBottom: 12 }]}>
              {t('hucha.history')}
            </Text>
            {recentMovements.map((m, idx) => {
              const isDeposit = m.type === 'deposit';
              const movColor = isDeposit ? dc.income : dc.expense;
              return (
                <View
                  key={m.id}
                  style={[
                    styles.historyRow,
                    idx < recentMovements.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: dc.border },
                  ]}
                >
                  <View style={[styles.historyIconWrap, { backgroundColor: movColor + '20' }]}>
                    <Ionicons
                      name={isDeposit ? 'arrow-down' : 'arrow-up'}
                      size={14}
                      color={movColor}
                    />
                  </View>
                  <View style={styles.historyInfo}>
                    <Text style={[styles.historyLabel, { color: dc.textPrimary }]}>
                      {isDeposit ? t('hucha.depositLabel') : t('hucha.withdrawalLabel')}
                    </Text>
                    <Text style={[styles.historyDate, { color: dc.textSecondary }]}>
                      {formatDate(m.date)}
                    </Text>
                  </View>
                  <Text style={[styles.historyAmount, { color: movColor }]}>
                    {isDeposit ? '+' : '-'}{m.amount.toFixed(2)} {currencySymbol}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <AddMoneyModal
        visible={showAddMoneyModal && !isClosed}
        huchaColor={hucha.color}
        huchaCurrentAmount={hucha.currentAmount}
        availableBalance={availableBalance}
        currencySymbol={currencySymbol}
        onConfirm={handleAddMoney}
        onDismiss={() => setShowAddMoneyModal(false)}
      />

      <Modal
        visible={showActionsMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowActionsMenu(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.actionsOverlay}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setShowActionsMenu(false)}
          />
          <View style={[styles.actionsSheet, { backgroundColor: dc.surface, paddingBottom: insets.bottom + 12 }]}>
            <View style={[styles.sheetHandle, { backgroundColor: dc.border }]} />
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.actionsHeader}>
                <View style={[styles.actionsHeaderIcon, { backgroundColor: hucha.color + '20' }]}>
                  <Ionicons
                    name={isClosed ? 'checkmark-circle' : (hucha.icon as keyof typeof Ionicons.glyphMap)}
                    size={22}
                    color={hucha.color}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.actionsTitle, { color: dc.textPrimary }]} numberOfLines={1}>
                    {hucha.name}
                  </Text>
                  <Text style={[styles.actionsSubtitle, { color: dc.textSecondary }]}>
                    {hasTarget
                      ? `${hucha.currentAmount.toFixed(2)} / ${hucha.targetAmount.toFixed(2)} ${currencySymbol}`
                      : `${hucha.currentAmount.toFixed(2)} ${currencySymbol} · ${t('hucha.accumulating')}`}
                  </Text>
                </View>
              </View>

              {!isClosed && (
                <View style={[styles.editBlock, { borderTopColor: dc.border }]}>
                  <Text style={[styles.editLabel, { color: dc.textSecondary }]}>
                    {t('hucha.goalName')}
                  </Text>
                  <RNTextInput
                    style={[styles.editInput, { backgroundColor: dc.background, borderColor: dc.border, color: dc.textPrimary }]}
                    placeholder={t('hucha.goalNamePlaceholder')}
                    placeholderTextColor={dc.textSecondary}
                    value={editName}
                    onChangeText={setEditName}
                    maxLength={40}
                  />

                  {hasTarget && (
                    <>
                      <Text style={[styles.editLabel, { color: dc.textSecondary, marginTop: 12 }]}>
                        {t('hucha.goalAmount', { symbol: currencySymbol })}
                      </Text>
                      <RNTextInput
                        style={[styles.editInput, { backgroundColor: dc.background, borderColor: dc.border, color: dc.textPrimary }]}
                        placeholder="0"
                        placeholderTextColor={dc.textSecondary}
                        keyboardType="decimal-pad"
                        value={editTarget}
                        onChangeText={setEditTarget}
                      />

                      {editTargetTooLow && (
                        <Text style={[styles.errorText, { marginTop: 8 }]}>
                          {t('hucha.invalidTargetAmount')}
                        </Text>
                      )}
                    </>
                  )}

                  <TouchableOpacity
                    style={[
                      styles.editSaveBtn,
                      { backgroundColor: hucha.color },
                      (!editValid || isSavingEdit) && { opacity: 0.4 },
                    ]}
                    onPress={handleSaveEdit}
                    activeOpacity={0.8}
                    disabled={!editValid || isSavingEdit}
                  >
                    <Ionicons name="checkmark" size={18} color="#fff" />
                    <Text style={styles.editSaveBtnText}>{t('hucha.save')}</Text>
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity
                style={[styles.actionRow, { borderTopColor: dc.border }]}
                onPress={() => { setShowActionsMenu(false); isClosed ? handleReopen() : handleClose(); }}
                activeOpacity={0.6}
              >
                <View style={[styles.actionIconWrap, { backgroundColor: (isClosed ? dc.income : dc.savings) + '15' }]}>
                  <Ionicons
                    name={isClosed ? 'lock-open-outline' : 'lock-closed-outline'}
                    size={20}
                    color={isClosed ? dc.income : dc.savings}
                  />
                </View>
                <Text style={[styles.actionText, { color: dc.textPrimary }]}>
                  {isClosed ? t('hucha.reopen') : t('hucha.close')}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={dc.textSecondary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionRow, { borderTopColor: dc.border }]}
                onPress={() => { setShowActionsMenu(false); handleDelete(); }}
                activeOpacity={0.6}
              >
                <View style={[styles.actionIconWrap, { backgroundColor: dc.expense + '15' }]}>
                  <Ionicons name="trash-outline" size={20} color={dc.expense} />
                </View>
                <Text style={[styles.actionText, { color: dc.expense }]}>{t('hucha.delete')}</Text>
                <Ionicons name="chevron-forward" size={18} color={dc.textSecondary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionsCloseBtn, { backgroundColor: isDark ? dc.border + '60' : '#F2F2F7' }]}
                onPress={() => setShowActionsMenu(false)}
                activeOpacity={0.7}
              >
                <Text style={[styles.actionsCloseBtnText, { color: dc.textPrimary }]}>
                  {t('hucha.cancel')}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <PremiumModal
        visible={showPremiumModal}
        onDismiss={() => setShowPremiumModal(false)}
        onPurchase={() => setShowPremiumModal(false)}
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

  scrollContent: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 100 },

  fillWrapper: { alignItems: 'center', marginBottom: 24 },
  fillContainer: {
    width: 160, height: FILL_HEIGHT, borderRadius: 24,
    overflow: 'hidden', justifyContent: 'flex-end',
  },
  fillBar: { width: '100%', borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  fillOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  fillPct: {
    fontSize: 32, fontFamily: 'Poppins_700Bold', color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },

  closedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 12, borderWidth: 0.5,
    marginBottom: 16,
  },
  closedBannerText: { fontSize: 13, fontFamily: 'Poppins_500Medium', flex: 1 },
  amountsRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', marginBottom: 6 },
  currentAmount: { fontSize: 32, fontFamily: 'Poppins_700Bold' },
  targetAmount: { fontSize: 18, fontFamily: 'Poppins_400Regular', marginLeft: 4 },
  estimate: { fontSize: 13, fontFamily: 'Poppins_400Regular', textAlign: 'center', marginBottom: 28 },

  sectionLabel: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  quickRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  quickBtn: { flex: 1, borderRadius: 12, borderWidth: 1, paddingVertical: 12, alignItems: 'center' },
  quickBtnText: { fontSize: 15, fontFamily: 'Poppins_600SemiBold' },

  automaticCard: { borderRadius: 16, borderWidth: 0.5, padding: 16, marginBottom: 16 },
  automaticRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  autoInputBlock: {
    marginTop: 14, paddingTop: 14, borderTopWidth: 0.5,
    gap: 12,
  },
  autoDayRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  autoDayLabel: {
    flex: 1, fontSize: 13, fontFamily: 'Poppins_400Regular',
  },
  autoAmountRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  autoInput: {
    flex: 1, borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, fontFamily: 'Poppins_400Regular',
  },
  autoDayInput: {
    width: 64, borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 10,
    fontSize: 14, fontFamily: 'Poppins_400Regular',
    textAlign: 'center',
  },
  autoSaveBtn: { borderRadius: 10, paddingHorizontal: 18, paddingVertical: 11 },
  autoSaveBtnText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: '#fff' },
  automaticIconWrap: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  automaticInfo: { flex: 1 },
  automaticLabel: { fontSize: 14, fontFamily: 'Poppins_500Medium' },
  automaticMeta: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 2 },

  historyCard: { borderRadius: 16, borderWidth: 0.5, padding: 16, marginBottom: 24 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  historyIconWrap: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  historyInfo: { flex: 1 },
  historyLabel: { fontSize: 13, fontFamily: 'Poppins_500Medium' },
  historyDate: { fontSize: 11, fontFamily: 'Poppins_400Regular', marginTop: 1 },
  historyAmount: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '90%' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: 22, fontFamily: 'Poppins_700Bold', marginBottom: 20 },

  modeTabs: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  modeTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 12,
  },
  modeTabText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },

  input: { marginBottom: 12 },

  previewRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10,
    marginBottom: 12,
  },
  previewLabel: { fontSize: 13, fontFamily: 'Poppins_400Regular', flex: 1 },
  previewNew: { fontSize: 14, fontFamily: 'Poppins_600SemiBold' },

  errorText: {
    fontSize: 12, fontFamily: 'Poppins_400Regular',
    color: '#EF4444', marginBottom: 8, paddingHorizontal: 4,
  },
  balanceHint: {
    fontSize: 12, fontFamily: 'Poppins_400Regular',
    marginBottom: 8, paddingHorizontal: 4,
  },
  sheetButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelButton: { flex: 1 },
  saveButton: { flex: 2 },

  actionsOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  actionsSheet: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingTop: 10,
  },
  actionsHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: 4,
  },
  actionsHeaderIcon: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  actionsTitle: { fontSize: 17, fontFamily: 'Poppins_600SemiBold' },
  actionsSubtitle: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 2 },

  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 14, paddingHorizontal: 4,
    borderTopWidth: 0.5,
  },
  actionIconWrap: {
    width: 36, height: 36, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  actionText: { flex: 1, fontSize: 15, fontFamily: 'Poppins_500Medium' },

  actionsCloseBtn: {
    marginTop: 14, paddingVertical: 14,
    borderRadius: 14, alignItems: 'center',
  },
  actionsCloseBtnText: { fontSize: 15, fontFamily: 'Poppins_600SemiBold' },

  editBlock: {
    paddingTop: 16, paddingBottom: 16,
    borderTopWidth: 0.5,
  },
  editLabel: {
    fontSize: 11, fontFamily: 'Poppins_600SemiBold',
    textTransform: 'uppercase', letterSpacing: 0.6,
    marginBottom: 6, marginLeft: 2,
  },
  editInput: {
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, fontFamily: 'Poppins_400Regular',
  },
  editSaveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: 14,
    paddingVertical: 12, borderRadius: 12,
  },
  editSaveBtnText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: '#fff' },
});

export default HuchaDetailScreen;
