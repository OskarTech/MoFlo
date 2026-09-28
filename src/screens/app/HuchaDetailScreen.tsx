import React, { useEffect, useRef, useState } from 'react';
import {
  View, StyleSheet, TouchableOpacity, Alert, Keyboard, Platform, Switch, ScrollView,
  TextInput as RNTextInput,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import Icon from '../../components/common/Icon';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useSavingsStore } from '../../store/savingsStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useSharedAccountStore } from '../../store/sharedAccountStore';
import { usePremium } from '../../hooks/usePremium';
import PremiumModal from '../../components/common/PremiumModal';
import { useTheme } from '../../hooks/useTheme';
import { HuchaMovement, HuchaMovementType } from '../../types';
import { formatDate } from '../../utils/dateFormat';
import { formatAmount, parseAmountInput, formatAmountForInput } from '../../utils/formatAmount';
import { withAlpha } from '../../utils/color';
import { warningHaptic, lightHaptic } from '../../utils/haptics';
import { HeroScrollScreen } from '../../components/layout/HeroScreen';
import { HeroTitleBar, HeroIconButton } from '../../components/layout/HeroBar';
import { SectionHeader } from '../../components/layout/SheetSection';
import BottomSheet, {
  SheetButton, SegmentedControl, FilledInput, SheetLabel,
} from '../../components/common/BottomSheet';
import AmountInput from '../../components/common/AmountInput';
import SwipeableRow, { closeOpenSwipeable } from '../../components/common/SwipeableRow';

// Lo que un apunte suma a la hucha (o resta, si es una retirada)
const movementDelta = (m: HuchaMovement) => (m.type === 'deposit' ? m.amount : -m.amount);

type RouteParams = { HuchaDetail: { huchaId: string } };

// Nombre corto del mes en el idioma de la app
const useShortMonth = () => {
  const { t } = useTranslation();
  return (monthIdx0: number) => t(`home.month_${monthIdx0}`).slice(0, 3);
};

const AddMoneyModal = ({
  visible, huchaName, huchaColor, huchaCurrentAmount, huchaTargetAmount, quickAmounts,
  currencySymbol, onConfirm, onDismiss, editing,
}: {
  visible: boolean;
  huchaName: string;
  huchaColor: string;
  /** Lo que hay en la hucha; al corregir un apunte, lo que habría sin él */
  huchaCurrentAmount: number;
  huchaTargetAmount: number;
  quickAmounts: number[];
  currencySymbol: string;
  onConfirm: (amount: number, type: HuchaMovementType) => void;
  onDismiss: () => void;
  /** Apunte que se corrige: la ventana se abre con su tipo y su importe */
  editing?: HuchaMovement | null;
}) => {
  const { t } = useTranslation();
  const { colors: dc, ui } = useTheme();
  const isSavingRef = useRef(false);
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<HuchaMovementType>('deposit');

  // Al abrirse para corregir un apunte, sale con lo que tenía
  useEffect(() => {
    if (!visible || !editing) return;
    setMode(editing.type);
    setAmount(formatAmountForInput(editing.amount));
  }, [visible, editing]);

  const reset = () => {
    setAmount('');
    setMode('deposit');
  };

  const parsed = parseAmountInput(amount);
  const hasAmount = !isNaN(parsed) && parsed > 0;
  // Cómo quedaría la hucha: no puede bajar de cero (margen para los decimales)
  const rawProjected = hasAmount
    ? mode === 'deposit' ? huchaCurrentAmount + parsed : huchaCurrentAmount - parsed
    : huchaCurrentAmount;
  const tooMuch = hasAmount && rawProjected < -0.005;
  const changed = !editing || mode !== editing.type || Math.abs(parsed - editing.amount) > 0.001;
  const isValid = hasAmount && !tooMuch && changed;
  const hasTarget = huchaTargetAmount > 0;
  const projected = Math.max(0, rawProjected);
  const pctOf = (v: number) => (hasTarget ? Math.max(0, Math.min(100, (v / huchaTargetAmount) * 100)) : 0);
  const amountText = `${formatAmount(hasAmount ? parsed : 0)} ${currencySymbol}`;

  const handleConfirm = () => {
    if (isSavingRef.current || !isValid) return;
    isSavingRef.current = true;
    onConfirm(parsed, mode);
    reset();
    setTimeout(() => { isSavingRef.current = false; }, 600);
  };

  const handleDismiss = () => {
    reset();
    onDismiss();
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={handleDismiss}
      title={editing ? t('movements.edit') : huchaName}
      subtitle={editing
        ? `${huchaName} · ${formatDate(editing.date)}`
        : hasTarget
          ? `${formatAmount(huchaCurrentAmount)} ${t('hucha.of')} ${formatAmount(huchaTargetAmount)} ${currencySymbol}`
          : `${formatAmount(huchaCurrentAmount)} ${currencySymbol} · ${t('hucha.accumulating')}`}
      footer={editing ? (
        <SheetButton label={t('movements.save')} onPress={handleConfirm} disabled={!isValid} />
      ) : (
        <SheetButton
          label={t(mode === 'deposit' ? 'hucha.depositCta' : 'hucha.withdrawCta', { amount: amountText })}
          onPress={handleConfirm}
          disabled={!isValid}
          variant={mode === 'withdrawal' ? 'danger' : 'primary'}
        />
      )}
    >
      <SegmentedControl
        options={[
          { key: 'deposit', label: t('hucha.deposit'), icon: 'arrow-down', activeColor: ui.savingsText },
          { key: 'withdrawal', label: t('hucha.withdraw'), icon: 'arrow-up', activeColor: ui.expenseText },
        ]}
        value={mode}
        onChange={(m) => { lightHaptic(); setMode(m); }}
      />
      <AmountInput
        value={amount}
        onChangeText={setAmount}
        currencySymbol={currencySymbol}
        color={mode === 'withdrawal' ? ui.expenseText : undefined}
      />

      {/* Importes rápidos: rellenan la cifra */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.chips}>
        {quickAmounts.map((a) => {
          const on = hasAmount && parsed === a;
          return (
            <TouchableOpacity
              key={a}
              style={[styles.chip, { backgroundColor: on ? ui.accentSoft : ui.field }, on && { borderColor: ui.accent }]}
              onPress={() => { lightHaptic(); setAmount(formatAmountForInput(a)); }}
              activeOpacity={0.75}
            >
              <Text style={[styles.chipText, { color: on ? ui.accent : dc.textPrimary }]}>
                {formatAmount(a, a % 1 === 0 ? 0 : 2)} {currencySymbol}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Cómo queda la hucha */}
      {hasAmount && (
        <View style={[styles.preview, { backgroundColor: ui.field }]}>
          <View style={styles.previewHead}>
            <Text style={[styles.previewText, { color: dc.textPrimary }]}>
              {t(mode === 'deposit' ? 'hucha.willReach' : 'hucha.willRemain', {
                amount: `${formatAmount(projected)} ${currencySymbol}`,
              })}
            </Text>
            {hasTarget && (
              <Text style={[styles.previewPct, { color: ui.savingsText }]}>{Math.round(pctOf(projected))}%</Text>
            )}
          </View>
          {hasTarget && (
            <View style={[styles.previewBar, { backgroundColor: withAlpha(huchaColor, 0.18) }]}>
              <View style={{ width: `${pctOf(Math.min(huchaCurrentAmount, projected))}%`, backgroundColor: huchaColor }} />
              <View
                style={{
                  width: `${Math.abs(pctOf(projected) - pctOf(huchaCurrentAmount))}%`,
                  backgroundColor: mode === 'deposit' ? withAlpha(huchaColor, 0.5) : withAlpha(dc.expense, 0.45),
                }}
              />
            </View>
          )}
        </View>
      )}

      {tooMuch && (
        <Text style={[styles.errorText, { color: ui.expenseText }]}>
          {t(editing ? 'hucha.wouldBeNegative' : 'hucha.insufficientFunds')}
        </Text>
      )}
    </BottomSheet>
  );
};

const HuchaDetailScreen = () => {
  const { t } = useTranslation();
  const { colors: dc, ui } = useTheme();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, 'HuchaDetail'>>();
  const shortMonth = useShortMonth();

  const {
    huchas, huchaMovements,
    addToHucha, deleteHucha, updateHucha,
    updateHuchaMovement, deleteHuchaMovement,
    closeHucha, reopenHucha,
    showAddMoneyModal, setShowAddMoneyModal,
  } = useSavingsStore();
  const { getCurrencySymbol } = useSettingsStore();
  const { isSharedMode, getSharedCurrencySymbol } = useSharedAccountStore();
  const currencySymbol = isSharedMode ? getSharedCurrencySymbol() : getCurrencySymbol();
  const { isPremium, showModal: showPremiumModal, setShowModal: setShowPremiumModal } = usePremium();

  const hucha = huchas.find(h => h.id === route.params.huchaId);

  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const autoInputRowRef = useRef<View>(null);
  const showAutoInputRef = useRef(false);

  const [showAutoInput, setShowAutoInput] = useState(false);
  const [autoAmount, setAutoAmount] = useState('');
  const [autoDay, setAutoDay] = useState('');
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [editName, setEditName] = useState('');
  const [editTarget, setEditTarget] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [quickAmounts, setQuickAmounts] = useState([10, 25, 50, 100]);
  const [isEditingAmounts, setIsEditingAmounts] = useState(false);
  const [editingAmountStrings, setEditingAmountStrings] = useState(['10', '25', '50', '100']);
  const [showAllHistory, setShowAllHistory] = useState(false);
  // Apunte del historial que se corrige (se queda puesto mientras la ventana se cierra)
  const [editingMov, setEditingMov] = useState<HuchaMovement | null>(null);
  const [editMovVisible, setEditMovVisible] = useState(false);

  const hasTarget = !!hucha && hucha.targetAmount > 0;
  const pct = hasTarget
    ? Math.min((hucha!.currentAmount / hucha!.targetAmount) * 100, 100)
    : 0;

  useEffect(() => {
    AsyncStorage.getItem('@moflo_quick_amounts').then(stored => {
      if (!stored) return;
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length === 4 && parsed.every((v: unknown) => typeof v === 'number' && v > 0)) {
          setQuickAmounts(parsed);
          setEditingAmountStrings(parsed.map(formatAmountForInput));
        }
      } catch {}
    });
  }, []);

  const handleSaveQuickAmounts = async () => {
    const parsed = editingAmountStrings.map(parseAmountInput);
    if (parsed.some(v => isNaN(v) || v <= 0)) return;
    setQuickAmounts(parsed);
    setIsEditingAmounts(false);
    await AsyncStorage.setItem('@moflo_quick_amounts', JSON.stringify(parsed));
  };

  // Al abrir el teclado para la aportación automática, se desplaza para que el campo se vea
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
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
    return () => { show.remove(); };
  }, []);

  // Si la hucha desaparece (borrada localmente, eliminada por otro miembro en
  // modo compartido, o cambio entre modo personal/compartido con sets de
  // huchas distintos), el id de la ruta queda apuntando a nada y el stack
  // se quedaba atascado en este fallback sin forma de volver atrás.
  useEffect(() => {
    if (!hucha && navigation.canGoBack()) {
      navigation.goBack();
    }
  }, [hucha, navigation]);

  if (!hucha) {
    return <View style={[styles.container, { backgroundColor: ui.sheet }]} />;
  }

  const allHuchaMovs = huchaMovements
    .filter(m => m.huchaId === hucha.id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const visibleHuchaMovs = showAllHistory ? allHuchaMovs : allHuchaMovs.slice(0, 4);

  const remaining = hasTarget ? Math.max(hucha.targetAmount - hucha.currentAmount, 0) : 0;
  const monthsEstimate = hasTarget && hucha.isAutomatic && hucha.monthlyAmount && hucha.monthlyAmount > 0
    ? Math.ceil(remaining / hucha.monthlyAmount)
    : null;

  const isClosed = !!hucha.closedAt;

  const targetDateLabel = (() => {
    if (!hucha.targetDate) return '';
    const [year, month] = hucha.targetDate.split('-');
    const m = Number(month);
    return m >= 1 && m <= 12 ? `${shortMonth(m - 1)} ${year}` : hucha.targetDate;
  })();
  const nextDateLabel = (() => {
    if (!hucha.nextContributionDate) return '';
    const d = new Date(hucha.nextContributionDate);
    return `${d.getDate()} ${shortMonth(d.getMonth())}`;
  })();

  const handleDelete = () => {
    warningHaptic();
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
      ],
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
      ],
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
      ],
    );
  };

  const handleMoreMenu = () => {
    setEditName(hucha.name);
    setEditTarget(formatAmountForInput(hucha.targetAmount));
    setShowActionsMenu(true);
  };

  const parsedEditTarget = parseAmountInput(editTarget);
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
      : { name: trimmedEditName },
    );
    setIsSavingEdit(false);
    setShowActionsMenu(false);
  };

  const handleQuickAdd = async (amount: number) => {
    lightHaptic();
    await addToHucha(hucha.id, amount, 'deposit');
  };

  const handleAddMoney = (amount: number, type: HuchaMovementType) => {
    setShowAddMoneyModal(false);
    addToHucha(hucha.id, amount, type);
  };

  // Deslizar un apunte del historial: corregirlo o borrarlo
  const handleEditMovement = (m: HuchaMovement) => {
    setEditingMov(m);
    setEditMovVisible(true);
  };

  const handleSaveMovement = (amount: number, type: HuchaMovementType) => {
    setEditMovVisible(false);
    if (editingMov) updateHuchaMovement(editingMov.id, { amount, type });
  };

  const handleDeleteMovement = (m: HuchaMovement) => {
    warningHaptic();
    // Quitar un depósito que ya se ha sacado dejaría la hucha por debajo de cero
    if (hucha.currentAmount - movementDelta(m) < -0.005) {
      Alert.alert(t('hucha.wouldBeNegative'));
      return;
    }
    const label = m.type === 'deposit' ? t('hucha.depositLabel') : t('hucha.withdrawalLabel');
    Alert.alert(
      t('movementsList.deleteConfirm'),
      `${label} · ${formatAmount(m.amount)} ${currencySymbol}`,
      [
        { text: t('movements.cancel'), style: 'cancel' },
        { text: t('movementsList.delete'), style: 'destructive', onPress: () => { deleteHuchaMovement(m.id); } },
      ],
    );
  };

  const handleToggleAutomatic = async (value: boolean) => {
    if (value) {
      showAutoInputRef.current = true;
      setAutoAmount(hucha.monthlyAmount ? formatAmountForInput(hucha.monthlyAmount) : '');
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
    const parsed = parseAmountInput(autoAmount);
    if (!parsed || parsed <= 0) return;
    const dayParsed = parseInt(autoDay, 10);
    if (!dayParsed || dayParsed < 1 || dayParsed > 31) return;
    const today = new Date();
    let monthIdx = today.getMonth();
    if (today.getDate() >= dayParsed) monthIdx += 1;
    const year = today.getFullYear();
    const lastDay = new Date(year, monthIdx + 1, 0).getDate();
    const actualDay = Math.min(dayParsed, lastDay);
    // 12:00 para que un cambio de zona horaria no lo mueva al día anterior
    const next = new Date(year, monthIdx, actualDay, 12);
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

  const hero = (
    <>
      <HeroTitleBar
        title={hucha.name}
        onBack={() => navigation.goBack()}
        right={<HeroIconButton icon="ellipsis-horizontal" onPress={handleMoreMenu} accessibilityLabel={t('hucha.options')} />}
      />
      <View style={styles.heroBody}>
        {!!targetDateLabel && (
          <Text style={[styles.heroMeta, { color: ui.onHeroSoft }]}>{t('hucha.goalBy', { date: targetDateLabel })}</Text>
        )}
        <View style={styles.heroAmountRow}>
          <Text style={[styles.heroAmount, { color: ui.onHero }]} numberOfLines={1}>
            {formatAmount(hucha.currentAmount)} {currencySymbol}
          </Text>
          {hasTarget && <Text style={[styles.heroPct, { color: ui.onHero }]}>{Math.round(pct)}%</Text>}
        </View>
        <Text style={[styles.heroTarget, { color: ui.onHeroSoft }]}>
          {hasTarget
            ? `${t('hucha.of')} ${formatAmount(hucha.targetAmount)} ${currencySymbol}`
            : t('hucha.accumulating')}
        </Text>
        {hasTarget && (
          <View style={styles.heroTrack}>
            <View style={[styles.heroFill, { width: `${pct}%` }]} />
          </View>
        )}
        {remaining > 0 && monthsEstimate !== null && (
          <Text style={[styles.heroEstimate, { color: ui.onHeroSoft }]}>
            {t('hucha.remaining', { amount: formatAmount(remaining) })}
            {' · '}
            {t('hucha.monthsEstimate', { months: monthsEstimate })}
          </Text>
        )}
      </View>
    </>
  );

  return (
    <>
      <View
        style={styles.container}
        // Cualquier toque de la pantalla cierra el apunte deslizado. Devuelve false,
        // así que no se queda con el gesto y el toque llega igual a su destino.
        onStartShouldSetResponderCapture={closeOpenSwipeable}
      >
        <HeroScrollScreen
          hero={hero}
          scrollRef={scrollRef}
          onScrollBeginDrag={closeOpenSwipeable}
          onScrollEndDrag={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }}
          onMomentumScrollEnd={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }}
          keyboardShouldPersistTaps="handled"
        >
          {isClosed && (
            <View style={[styles.closedBanner, { backgroundColor: withAlpha(dc.income, 0.14) }]}>
              <Icon name="checkmark-circle" size={18} color={ui.incomeText} />
              <Text style={[styles.closedBannerText, { color: ui.incomeText }]}>
                {t('hucha.closedBanner', { date: formatDate(hucha.closedAt!) })}
              </Text>
            </View>
          )}

          {/* Añadir rápido */}
          {!isClosed && (
            <>
              <SectionHeader title={t('hucha.quickAdd')} />
              <View style={styles.quickRow}>
                {isEditingAmounts ? (
                  <>
                    {editingAmountStrings.map((val, i) => (
                      <RNTextInput
                        key={i}
                        style={[styles.quickInput, {
                          backgroundColor: ui.field, borderColor: ui.accent, color: dc.textPrimary,
                        }]}
                        value={val}
                        onChangeText={v => {
                          const next = [...editingAmountStrings];
                          next[i] = v.replace(/[^0-9.,]/g, '');
                          setEditingAmountStrings(next);
                        }}
                        keyboardType="decimal-pad"
                        maxLength={6}
                        selectTextOnFocus
                      />
                    ))}
                    <TouchableOpacity
                      style={[styles.quickEditBtn, { backgroundColor: dc.primary }]}
                      onPress={handleSaveQuickAmounts}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.quickEditBtnText, { color: '#fff' }]}>{t('hucha.saveQuickAmounts')}</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    {quickAmounts.map(a => (
                      <TouchableOpacity
                        key={a}
                        style={[styles.quickBtn, { backgroundColor: ui.field }]}
                        onPress={() => handleQuickAdd(a)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.quickBtnText, { color: ui.savingsText }]}>+{a}{currencySymbol}</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      style={[styles.quickEditBtn, { backgroundColor: ui.field }]}
                      onPress={() => {
                        setEditingAmountStrings(quickAmounts.map(formatAmountForInput));
                        setIsEditingAmounts(true);
                      }}
                      activeOpacity={0.8}
                      accessibilityLabel={t('hucha.editQuickAmounts')}
                    >
                      <Icon name="pencil" size={16} color={dc.textSecondary} />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </>
          )}

          {/* Aportación automática */}
          {!isClosed && (
            <View style={[styles.autoCard, { backgroundColor: ui.field }]}>
              <View style={styles.autoRow}>
                <View style={[styles.autoIcon, { backgroundColor: ui.accentSoft }]}>
                  <Icon name="repeat" size={19} color={ui.accent} />
                </View>
                <View style={styles.autoInfo}>
                  <Text style={[styles.autoLabel, { color: dc.textPrimary }]}>{t('hucha.automatic')}</Text>
                  {hucha.isAutomatic && hucha.monthlyAmount && !showAutoInput && (
                    <Text style={[styles.autoMeta, { color: dc.textSecondary }]}>
                      {t('hucha.everyMonth', { amount: hucha.monthlyAmount, symbol: currencySymbol })}
                      {hucha.recurringDay ? ` · ${t('hucha.dayN', { day: hucha.recurringDay })}` : ''}
                      {nextDateLabel ? ` · ${t('hucha.nextContribution', { date: nextDateLabel })}` : ''}
                    </Text>
                  )}
                </View>
                <Switch
                  value={hucha.isAutomatic || showAutoInput}
                  onValueChange={handleToggleAutomatic}
                  trackColor={{ false: ui.hair2, true: dc.primary }}
                  thumbColor="#fff"
                  ios_backgroundColor={ui.hair2}
                />
              </View>

              {showAutoInput && (() => {
                const amountValid = !!autoAmount && parseAmountInput(autoAmount) > 0;
                const dayParsed = parseInt(autoDay, 10);
                const dayValid = !!autoDay && dayParsed >= 1 && dayParsed <= 31;
                const canSave = amountValid && dayValid;
                return (
                  <View ref={autoInputRowRef} style={[styles.autoBlock, { borderTopColor: ui.hair }]}>
                    <View style={styles.autoDayRow}>
                      <Text style={[styles.autoDayLabel, { color: dc.textSecondary }]}>{t('hucha.chooseDayOfMonth')}</Text>
                      <RNTextInput
                        style={[styles.autoDayInput, { backgroundColor: ui.sheet, color: dc.textPrimary }]}
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
                        style={[styles.autoInput, { backgroundColor: ui.sheet, color: dc.textPrimary }]}
                        placeholder={t('hucha.automaticAmount')}
                        placeholderTextColor={dc.textSecondary}
                        keyboardType="decimal-pad"
                        value={autoAmount}
                        onChangeText={setAutoAmount}
                      />
                      <TouchableOpacity
                        style={[styles.autoSaveBtn, { backgroundColor: dc.primary }, !canSave && styles.disabled]}
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

          {/* Historial */}
          {allHuchaMovs.length > 0 && (
            <>
              <SectionHeader title={t('hucha.history')} style={styles.historyHeader} />
              <View style={styles.pad}>
                {visibleHuchaMovs.map((m) => {
                  const isDeposit = m.type === 'deposit';
                  return (
                    <SwipeableRow
                      key={m.id}
                      borderRadius={14}
                      actions={[
                        { icon: 'pencil', background: dc.primary, onPress: () => handleEditMovement(m) },
                        { icon: 'trash', background: ui.expenseText, onPress: () => handleDeleteMovement(m) },
                      ]}
                    >
                      {/* Con fondo propio: si no, los botones de detrás se verían sin deslizar */}
                      <View style={[styles.historyRow, { backgroundColor: ui.sheet }]}>
                        <View style={[styles.historyIcon, { backgroundColor: withAlpha(isDeposit ? hucha.color : dc.expense, 0.15) }]}>
                          <Icon name={isDeposit ? 'arrow-down' : 'arrow-up'} size={17} color={isDeposit ? hucha.color : ui.expenseText} />
                        </View>
                        <View style={styles.historyInfo}>
                          <Text style={[styles.historyLabel, { color: dc.textPrimary }]}>
                            {isDeposit ? t('hucha.depositLabel') : t('hucha.withdrawalLabel')}
                          </Text>
                          <Text style={[styles.historyDate, { color: dc.textSecondary }]}>{formatDate(m.date)}</Text>
                        </View>
                        <Text style={[styles.historyAmount, { color: isDeposit ? ui.savingsText : dc.textPrimary }]}>
                          {isDeposit ? '+' : '-'}{formatAmount(m.amount)} {currencySymbol}
                        </Text>
                      </View>
                    </SwipeableRow>
                  );
                })}
                {allHuchaMovs.length > 4 && (
                  <TouchableOpacity
                    style={styles.historyToggle}
                    onPress={() => setShowAllHistory(prev => !prev)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.historyToggleText, { color: ui.accent }]}>
                      {showAllHistory ? t('hucha.hideHistory') : t('hucha.viewAllHistory')}
                    </Text>
                    <Icon name={showAllHistory ? 'chevron-up' : 'chevron-down'} size={15} color={ui.accent} />
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}
        </HeroScrollScreen>
      </View>

      <AddMoneyModal
        visible={showAddMoneyModal && !isClosed}
        huchaName={hucha.name}
        huchaColor={hucha.color}
        huchaCurrentAmount={hucha.currentAmount}
        huchaTargetAmount={hucha.targetAmount}
        quickAmounts={quickAmounts}
        currencySymbol={currencySymbol}
        onConfirm={handleAddMoney}
        onDismiss={() => setShowAddMoneyModal(false)}
      />

      {/* Corregir un apunte: parte de lo que habría en la hucha sin él */}
      <AddMoneyModal
        visible={editMovVisible}
        editing={editingMov}
        huchaName={hucha.name}
        huchaColor={hucha.color}
        huchaCurrentAmount={editingMov ? hucha.currentAmount - movementDelta(editingMov) : hucha.currentAmount}
        huchaTargetAmount={hucha.targetAmount}
        quickAmounts={quickAmounts}
        currencySymbol={currencySymbol}
        onConfirm={handleSaveMovement}
        onDismiss={() => setEditMovVisible(false)}
      />

      {/* Opciones: editar, cerrar o reabrir, y borrar */}
      <BottomSheet
        visible={showActionsMenu}
        onClose={() => setShowActionsMenu(false)}
        title={hucha.name}
        subtitle={hasTarget
          ? `${formatAmount(hucha.currentAmount)} / ${formatAmount(hucha.targetAmount)} ${currencySymbol}`
          : `${formatAmount(hucha.currentAmount)} ${currencySymbol} · ${t('hucha.accumulating')}`}
      >
        {!isClosed && (
          <View style={styles.editBlock}>
            <SheetLabel style={styles.firstLabel}>{t('hucha.goalName')}</SheetLabel>
            <FilledInput
              placeholder={t('hucha.goalNamePlaceholder')}
              value={editName}
              onChangeText={setEditName}
              maxLength={40}
            />
            {hasTarget && (
              <>
                <SheetLabel>{t('hucha.goalAmount', { symbol: currencySymbol })}</SheetLabel>
                <FilledInput
                  placeholder="0"
                  keyboardType="decimal-pad"
                  value={editTarget}
                  onChangeText={setEditTarget}
                />
                {editTargetTooLow && (
                  <Text style={[styles.errorText, { color: ui.expenseText }]}>{t('hucha.invalidTargetAmount')}</Text>
                )}
              </>
            )}
            <SheetButton
              label={t('hucha.save')}
              icon="checkmark"
              onPress={handleSaveEdit}
              disabled={!editValid}
              loading={isSavingEdit}
              style={styles.editSave}
            />
          </View>
        )}

        <TouchableOpacity
          style={styles.actionRow}
          onPress={() => {
            setShowActionsMenu(false);
            if (isClosed) handleReopen(); else handleClose();
          }}
          activeOpacity={0.6}
        >
          <View style={[styles.actionIcon, { backgroundColor: ui.accentSoft }]}>
            <Icon name={isClosed ? 'lock-open-outline' : 'lock-closed-outline'} size={19} color={ui.accent} />
          </View>
          <Text style={[styles.actionText, { color: dc.textPrimary }]}>
            {isClosed ? t('hucha.reopen') : t('hucha.close')}
          </Text>
          <Icon name="chevron-forward" size={17} color={dc.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionRow, styles.actionRowBorder, { borderTopColor: ui.hair }]}
          onPress={() => { setShowActionsMenu(false); handleDelete(); }}
          activeOpacity={0.6}
        >
          <View style={[styles.actionIcon, { backgroundColor: ui.expenseSoft }]}>
            <Icon name="trash-outline" size={19} color={ui.expenseText} />
          </View>
          <Text style={[styles.actionText, { color: ui.expenseText }]}>{t('hucha.delete')}</Text>
          <Icon name="chevron-forward" size={17} color={dc.textSecondary} />
        </TouchableOpacity>
      </BottomSheet>

      <PremiumModal
        visible={showPremiumModal}
        onDismiss={() => setShowPremiumModal(false)}
        onPurchase={() => setShowPremiumModal(false)}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  pad: { paddingHorizontal: 20 },
  disabled: { opacity: 0.4 },

  // Cabecera
  heroBody: { paddingHorizontal: 20, paddingTop: 10 },
  heroMeta: { fontSize: 12.5, fontFamily: 'Poppins_500Medium' },
  heroAmountRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  heroAmount: { fontSize: 36, fontFamily: 'Poppins_700Bold', letterSpacing: -1, flexShrink: 1 },
  heroPct: { fontSize: 20, fontFamily: 'Poppins_700Bold' },
  heroTarget: { fontSize: 13, fontFamily: 'Poppins_400Regular', marginTop: -2 },
  heroTrack: {
    height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.22)', marginTop: 12, overflow: 'hidden',
  },
  heroFill: { height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' },
  heroEstimate: { fontSize: 12.5, fontFamily: 'Poppins_400Regular', marginTop: 8 },

  closedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, marginBottom: 18,
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14,
  },
  closedBannerText: { fontSize: 13, fontFamily: 'Poppins_500Medium', flex: 1 },

  // Añadir rápido
  quickRow: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 20, marginBottom: 18 },
  quickBtn: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  quickBtnText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold' },
  quickEditBtn: {
    borderRadius: 14, paddingVertical: 12, paddingHorizontal: 12,
    alignItems: 'center', justifyContent: 'center', minWidth: 44,
  },
  quickEditBtnText: { fontSize: 12, fontFamily: 'Poppins_600SemiBold' },
  quickInput: {
    flex: 1, borderRadius: 12, borderWidth: 1.5,
    paddingVertical: 10, paddingHorizontal: 4,
    textAlign: 'center', fontSize: 14, fontFamily: 'Poppins_600SemiBold',
  },

  // Automática
  autoCard: { borderRadius: 20, padding: 14, marginHorizontal: 20 },
  autoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  autoIcon: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  autoInfo: { flex: 1 },
  autoLabel: { fontSize: 14.5, fontFamily: 'Poppins_500Medium' },
  autoMeta: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 2 },
  autoBlock: { marginTop: 14, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, gap: 12 },
  autoDayRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  autoDayLabel: { flex: 1, fontSize: 13, fontFamily: 'Poppins_400Regular' },
  autoAmountRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  autoInput: {
    flex: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, fontFamily: 'Poppins_400Regular',
  },
  autoDayInput: {
    width: 64, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10,
    fontSize: 14, fontFamily: 'Poppins_400Regular', textAlign: 'center',
  },
  autoSaveBtn: { borderRadius: 12, paddingHorizontal: 18, paddingVertical: 11 },
  autoSaveBtnText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: '#fff' },

  // Historial
  historyHeader: { marginTop: 24 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, borderRadius: 14 },
  historyIcon: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  historyInfo: { flex: 1 },
  historyLabel: { fontSize: 14.5, fontFamily: 'Poppins_500Medium' },
  historyDate: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 1 },
  historyAmount: { fontSize: 14.5, fontFamily: 'Poppins_600SemiBold' },
  historyToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  historyToggleText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },

  // Ventana de aportar
  chips: { gap: 8, paddingBottom: 4 },
  chip: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1.5, borderColor: 'transparent' },
  chipText: { fontSize: 13.5, fontFamily: 'Poppins_600SemiBold' },
  preview: { borderRadius: 16, padding: 14, marginTop: 14 },
  previewHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 },
  previewText: { fontSize: 14, fontFamily: 'Poppins_500Medium', flexShrink: 1 },
  previewPct: { fontSize: 15, fontFamily: 'Poppins_700Bold' },
  previewBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 10 },
  errorText: { fontSize: 12.5, fontFamily: 'Poppins_400Regular', marginTop: 10 },

  // Ventana de opciones
  editBlock: { paddingBottom: 14 },
  firstLabel: { marginTop: 0 },
  editSave: { marginTop: 14 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  actionRowBorder: { borderTopWidth: StyleSheet.hairlineWidth },
  actionIcon: { width: 36, height: 36, borderRadius: 11, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  actionText: { flex: 1, fontSize: 15, fontFamily: 'Poppins_500Medium' },
});

export default HuchaDetailScreen;
