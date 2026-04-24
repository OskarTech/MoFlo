import React, { useState, useRef, useEffect } from 'react';
import {
  View, StyleSheet, Modal, ScrollView,
  TouchableOpacity, Keyboard, Animated, Platform,
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
import { colors } from '../../theme';
import { MovementType, Movement } from '../../types';

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

const AddMovementModal = ({ visible, onDismiss }: Props) => {
  const { t } = useTranslation();
  const { isDark, colors: dc } = useTheme();
  const { addMovement } = useMovementStore();
  const { getCurrencySymbol } = useSettingsStore();
  const { getCategoriesForType, getCategoryName } = useCategoryStore();
  const { isSharedMode, getSharedCurrencySymbol } = useSharedAccountStore();
  const { getSharedCategoriesForType, getSharedCategoryName } = useSharedCategoryStore();
  const insets = useSafeAreaInsets();

  const [type, setType] = useState<MovementType>('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('housing');

  const sheetOffset = useRef(new Animated.Value(0)).current;
  const categoryScrollRef = useRef<ScrollView>(null);
  const categoryPositions = useRef<{ [key: string]: number }>({});

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

  const typeColor = type === 'income' ? colors.income : colors.expense;
  const sheetBg = dc.surface;
  const inputBg = isDark ? dc.background : '#FFFFFF';
  const chipBg = isDark ? dc.border : '#F8F8F8';
  const chipBorder = isDark ? dc.border : '#E0E0E0';

  const handleDismiss = () => {
    setType('expense');
    setAmount('');
    setCategoryId('housing');
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

  const handleSave = async () => {
    const parsedAmount = parseFloat(amount.replace(',', '.'));
    if (!parsedAmount || parsedAmount <= 0) return;

    const movement: Movement = {
      id: Date.now().toString(),
      type,
      amount: parsedAmount,
      category: categoryId as any,
      description: getCatName(categoryId, type),
      date: new Date().toISOString(),
      isRecurring: false,
      currency: currencySymbol,
      createdAt: new Date().toISOString(),
    };

    await addMovement(movement);
    handleDismiss();
  };

  const isValid = !!amount && parseFloat(amount.replace(',', '.')) > 0;

  return (
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
            <Text style={[styles.title, { color: dc.textPrimary }]}>
              {t('movements.add')}
            </Text>

            {/* TIPO */}
            <View style={styles.typeSelector}>
              {(['expense', 'income'] as MovementType[]).map((t_) => (
                <TouchableOpacity
                  key={t_}
                  style={[
                    styles.typeButton,
                    { backgroundColor: isDark ? dc.border : '#F0F0F0' },
                    type === t_ && {
                      backgroundColor: t_ === 'income' ? colors.income : colors.expense,
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

            {/* CATEGORÍAS */}
            <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
              {t('movements.category')}
            </Text>
            <ScrollView
              ref={categoryScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
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
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '90%' },
  handleBar: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  title: { fontSize: 22, fontFamily: 'Poppins_700Bold', marginBottom: 20 },
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
  buttons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelButton: { flex: 1 },
  saveButton: { flex: 2 },
});

export default AddMovementModal;