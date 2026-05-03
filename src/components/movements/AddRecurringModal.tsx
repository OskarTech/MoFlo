import React, { useState, useRef, useEffect } from 'react';
import {
  View, StyleSheet, Modal, ScrollView,
  TouchableOpacity, Keyboard, Animated, Platform, Alert,
} from 'react-native';
import { Text, TextInput, Button } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMovementStore } from '../../store/movementStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useCategoryStore } from '../../store/categoryStore';
import { useSharedAccountStore } from '../../store/sharedAccountStore';
import { useSharedCategoryStore } from '../../store/sharedCategoryStore';
import { useTheme } from '../../hooks/useTheme';
import { usePremium } from '../../hooks/usePremium';
import PremiumModal from '../common/PremiumModal';
import { navigationRef } from '../../navigation/RootNavigator';
import { MovementType, RecurringMovement } from '../../types';

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

const AddRecurringModal = ({ visible, onDismiss }: Props) => {
  const { t } = useTranslation();
  const { isDark, colors: dc } = useTheme();
  const { addRecurringMovement } = useMovementStore();
  const { getCurrencySymbol } = useSettingsStore();
  const { getCategoriesForType, getCategoryName } = useCategoryStore();
  const { isSharedMode, sharedAccount, getSharedCurrencySymbol } = useSharedAccountStore();
  const { getSharedCategoriesForType, getSharedCategoryName } = useSharedCategoryStore();
  const { showModal: showPremiumModal, setShowModal: setShowPremiumModal, requirePremium } = usePremium();
  const insets = useSafeAreaInsets();

  const [type, setType] = useState<MovementType>('expense');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [categoryId, setCategoryId] = useState('housing');
  const [recurringDay, setRecurringDay] = useState('1');

  const sheetOffset = useRef(new Animated.Value(0)).current;
  const categoryScrollRef = useRef<ScrollView>(null);
  const categoryPositions = useRef<{ [key: string]: number }>({});
  const isSavingRef = useRef(false);

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
      Animated.timing(sheetOffset, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    });

    return () => { show.remove(); hide.remove(); };
  }, [sheetOffset, insets.bottom]);

  const currencySymbol = isSharedMode
    ? getSharedCurrencySymbol()
    : getCurrencySymbol();

  const categoryList = isSharedMode
    ? getSharedCategoriesForType(type)
    : getCategoriesForType(type);

  const getCatName = (id: string, tp: MovementType) =>
    isSharedMode
      ? getSharedCategoryName(id, tp, t)
      : getCategoryName(id, tp, t);

  const typeColor = type === 'income' ? dc.income : dc.expense;
  const sheetBg = dc.surface;
  const inputBg = isDark ? dc.background : '#FFFFFF';
  const chipBg = isDark ? dc.border : '#F8F8F8';
  const chipBorder = isDark ? dc.border : '#E0E0E0';

  const handleDismiss = () => {
    setType('expense');
    setAmount('');
    setNote('');
    setCategoryId('housing');
    setRecurringDay('1');
    onDismiss();
  };

  const handleTypeChange = (newType: MovementType) => {
    setType(newType);
    const cats = isSharedMode
      ? getSharedCategoriesForType(newType)
      : getCategoriesForType(newType);
    setCategoryId(cats[0]?.id ?? 'other');
    categoryScrollRef.current?.scrollTo({ x: 0, animated: false });
  };

  const handleCategoryPress = (id: string) => {
    setCategoryId(id);
    const x = categoryPositions.current[id] ?? 0;
    categoryScrollRef.current?.scrollTo({ x: x - 16, animated: true });
  };

  const handleAddCategoryPress = () => {
    requirePremium(() => {
      handleDismiss();
      if (isSharedMode && sharedAccount) {
        navigationRef.navigate('Settings', {
          screen: 'SharedCategories',
          params: { accountId: sharedAccount.id },
        });
      } else {
        navigationRef.navigate('Settings', { screen: 'Categories' });
      }
    });
  };

  const handleSave = () => {
    if (isSavingRef.current) return;
    const parsedAmount = parseFloat(amount.replace(',', '.'));
    const day = parseInt(recurringDay);
    if (!parsedAmount || parsedAmount <= 0) return;
    if (!day || day < 1 || day > 31) return;

    isSavingRef.current = true;

    const newRecurring: RecurringMovement = {
      id: Date.now().toString(),
      type,
      amount: parsedAmount,
      category: categoryId as any,
      description: getCatName(categoryId, type),
      recurringDay: day,
      currency: currencySymbol,
      isActive: true,
      note: note.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    addRecurringMovement(newRecurring).finally(() => {
      isSavingRef.current = false;
    });
    handleDismiss();
  };

  const isValid = !!amount &&
    parseFloat(amount.replace(',', '.')) > 0 &&
    parseInt(recurringDay) >= 1 &&
    parseInt(recurringDay) <= 31;

  return (
    <>
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleDismiss}>
      <Animated.View style={[styles.overlay, { transform: [{ translateY: sheetOffset }] }]}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleDismiss} />

        <View style={[styles.sheet, {
          backgroundColor: sheetBg,
          paddingBottom: insets.bottom + 24,
        }]}>
          <View style={[styles.handleBar, { backgroundColor: dc.border }]} />

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: dc.textPrimary }]}>
                {t('recurring.add')}
              </Text>
              <TouchableOpacity
                onPress={() => Alert.alert(t('recurring.add'), t('recurring.infoMessage'))}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.infoIcon}
              >
                <Ionicons name="information-circle-outline" size={22} color={dc.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* TIPO */}
            <View style={styles.typeSelector}>
              {(['expense', 'income'] as MovementType[]).map((t_) => (
                <TouchableOpacity
                  key={t_}
                  style={[
                    styles.typeButton,
                    { backgroundColor: isDark ? dc.border : '#F0F0F0' },
                    type === t_ && {
                      backgroundColor: t_ === 'income' ? dc.income : dc.expense,
                    },
                  ]}
                  onPress={() => handleTypeChange(t_)}
                >
                  <Text style={[
                    styles.typeButtonText,
                    { color: dc.textSecondary },
                    type === t_ && { color: '#FFFFFF' },
                  ]}>
                    {t(`movements.${t_}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* IMPORTE */}
            <TextInput
              label={t('movements.amount')}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              mode="outlined"
              style={[styles.input, { backgroundColor: inputBg }]}
              outlineColor={typeColor}
              activeOutlineColor={typeColor}
              left={<TextInput.Affix text={currencySymbol} />}
            />

            {/* DÍA DEL MES */}
            <TextInput
              label={
                type === 'income' ? t('recurring.dayLabelIncome') : t('recurring.dayLabelExpense')
              }
              value={recurringDay}
              onChangeText={(val) => {
                const num = parseInt(val);
                if (val === '' || (num >= 1 && num <= 31)) setRecurringDay(val);
              }}
              keyboardType="number-pad"
              mode="outlined"
              style={[styles.input, { backgroundColor: inputBg }]}
              outlineColor={typeColor}
              activeOutlineColor={typeColor}
              right={<TextInput.Affix text={t('recurring.perMonth')} />}
            />

            {/* DESCRIPCIÓN */}
            <TextInput
              label={t('movements.description')}
              value={note}
              onChangeText={setNote}
              mode="outlined"
              placeholder={t('movements.descriptionPlaceholder')}
              style={[styles.input, { backgroundColor: inputBg }]}
              outlineColor={dc.border}
              activeOutlineColor={typeColor}
              maxLength={80}
            />

            {/* CATEGORÍAS */}
            <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
              {t('movements.category')}
            </Text>
            <ScrollView
              ref={categoryScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              style={styles.categoryScroll}
            >
              {categoryList.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.categoryChip,
                    { backgroundColor: chipBg, borderColor: chipBorder },
                    categoryId === cat.id && {
                      backgroundColor: typeColor, borderColor: typeColor,
                    },
                  ]}
                  onLayout={(e) => {
                    categoryPositions.current[cat.id] = e.nativeEvent.layout.x;
                  }}
                  onPress={() => handleCategoryPress(cat.id)}
                >
                  <Ionicons
                    name={cat.icon as any}
                    size={16}
                    color={categoryId === cat.id ? '#FFF' : dc.textSecondary}
                  />
                  <Text style={[
                    styles.categoryChipText,
                    { color: dc.textSecondary },
                    categoryId === cat.id && {
                      color: '#FFFFFF', fontFamily: 'Poppins_600SemiBold',
                    },
                  ]}>
                    {cat.isCustom ? cat.name : t(`movements.categories.${cat.id}`)}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[
                  styles.addCategoryChip,
                  { backgroundColor: typeColor + '15', borderColor: typeColor },
                ]}
                onPress={handleAddCategoryPress}
              >
                <Ionicons name="add" size={20} color={typeColor} />
              </TouchableOpacity>
            </ScrollView>

            {/* BOTONES */}
            <View style={styles.buttons}>
              <Button
                mode="outlined"
                onPress={handleDismiss}
                style={[styles.cancelButton, { borderColor: dc.border }]}
                textColor={dc.textSecondary}
              >
                {t('movements.cancel')}
              </Button>
              <Button
                mode="contained"
                onPress={handleSave}
                disabled={!isValid}
                style={styles.saveButton}
                buttonColor={typeColor}
                textColor="#FFFFFF"
              >
                {t('movements.save')}
              </Button>
            </View>
          </ScrollView>
        </View>
      </Animated.View>
    </Modal>
    <PremiumModal
      visible={showPremiumModal}
      onDismiss={() => setShowPremiumModal(false)}
      onPurchase={() => setShowPremiumModal(false)}
    />
    </>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '90%' },
  handleBar: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  titleRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 6, marginBottom: 20,
  },
  title: { fontSize: 22, fontFamily: 'Poppins_700Bold' },
  infoIcon: { padding: 2 },
  typeSelector: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  typeButton: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  typeButtonText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
  input: { marginBottom: 16 },
  sectionLabel: { fontSize: 13, fontFamily: 'Poppins_500Medium', marginBottom: 10 },
  categoryScroll: { marginBottom: 20 },
  categoryChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, marginRight: 8,
  },
  categoryChipText: { fontSize: 13, fontFamily: 'Poppins_400Regular' },
  addCategoryChip: {
    width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 20, borderWidth: 1, borderStyle: 'dashed',
    marginRight: 8,
  },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelButton: { flex: 1 },
  saveButton: { flex: 2 },
});

export default AddRecurringModal;