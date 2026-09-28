import React, { useState, useRef, useEffect, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import Icon from '../common/Icon';
import { useMovementStore } from '../../store/movementStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useCategoryStore } from '../../store/categoryStore';
import { useSharedAccountStore } from '../../store/sharedAccountStore';
import { useSharedCategoryStore } from '../../store/sharedCategoryStore';
import { useTheme } from '../../hooks/useTheme';
import { usePremium } from '../../hooks/usePremium';
import PremiumModal from '../common/PremiumModal';
import BottomSheet, { SheetButton, SegmentedControl, FilledInput, SheetLabel } from '../common/BottomSheet';
import AmountInput from '../common/AmountInput';
import { CategoryPicker, CategoryChip, DayPicker } from './SheetPickers';
import { navigationRef } from '../../navigation/navigationRef';
import { MovementType, RecurringMovement } from '../../types';
import { lightHaptic } from '../../utils/haptics';
import { parseAmountInput, formatAmountForInput } from '../../utils/formatAmount';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  editingRecurring?: RecurringMovement | null;
}

const AddRecurringModal = ({ visible, onDismiss, editingRecurring }: Props) => {
  const { t } = useTranslation();
  const { colors: dc, ui } = useTheme();
  const { addRecurringMovement, updateRecurringMovement, movements } = useMovementStore();
  const { getCurrencySymbol } = useSettingsStore();
  const {
    customCategories, hiddenBaseCategories,
    getCategoriesForType, getCategoryName, getCategoryIcon, isCategoryDeleted,
  } = useCategoryStore();
  const { isSharedMode, sharedAccount, getSharedCurrencySymbol } = useSharedAccountStore();
  const {
    sharedCustomCategories, sharedHiddenCategories,
    getSharedCategoriesForType, getSharedCategoryName, getSharedCategoryIcon, isSharedCategoryDeleted,
  } = useSharedCategoryStore();
  const { showModal: showPremiumModal, setShowModal: setShowPremiumModal, requirePremium } = usePremium();

  const [type, setType] = useState<MovementType>('expense');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [categoryId, setCategoryId] = useState('housing');
  const [recurringDay, setRecurringDay] = useState(1);
  // Cambia al abrir o al cambiar de tipo: las filas deslizables vuelven a su sitio
  const [pickerKey, setPickerKey] = useState(0);

  const isSavingRef = useRef(false);

  const currencySymbol = isSharedMode
    ? getSharedCurrencySymbol()
    : getCurrencySymbol();

  // Las categorías más usadas, primero
  const getSortedCategoriesForType = (tp: MovementType) => {
    const list = isSharedMode
      ? getSharedCategoriesForType(tp)
      : getCategoriesForType(tp);
    const counts = new Map<string, number>();
    for (const m of movements) {
      if (m.type === tp) counts.set(m.category, (counts.get(m.category) ?? 0) + 1);
    }
    return [...list].sort(
      (a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0)
    );
  };

  const categoryList = useMemo(
    () => getSortedCategoriesForType(type),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- son los datos que lee getSortedCategoriesForType, que se crea en cada render
    [
      movements, type, isSharedMode,
      customCategories, hiddenBaseCategories,
      sharedCustomCategories, sharedHiddenCategories,
    ]
  );

  useEffect(() => {
    if (!visible) return;
    // Con mala conexión el guardado anterior puede seguir esperando a Firestore
    // (el recurrente ya está guardado en local): no bloquear el siguiente
    isSavingRef.current = false;
    if (editingRecurring) {
      setType(editingRecurring.type);
      setAmount(formatAmountForInput(editingRecurring.amount));
      setNote(editingRecurring.note ?? '');
      setCategoryId(editingRecurring.category);
      setRecurringDay(editingRecurring.recurringDay);
      setPickerKey((k) => k + 1);
      return;
    }
    const sorted = getSortedCategoriesForType(type);
    setCategoryId(sorted[0]?.id ?? 'other');
    setPickerKey((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, editingRecurring]);

  const getCatName = (id: string, tp: MovementType) =>
    isSharedMode
      ? getSharedCategoryName(id, tp, t)
      : getCategoryName(id, tp, t);

  // Al editar un recurrente cuya categoría ya se borró, esa categoría no está en
  // la lista: se añade al principio, tachada, para que se vea cuál tiene y se
  // pueda conservar. Solo si está borrada de verdad y el tipo es el suyo.
  const editingCategoryId = editingRecurring?.type === type ? editingRecurring.category : undefined;
  const chipCategories: CategoryChip[] = editingCategoryId
    && !categoryList.some(c => c.id === editingCategoryId)
    && (isSharedMode
      ? isSharedCategoryDeleted(editingCategoryId, type)
      : isCategoryDeleted(editingCategoryId, type))
    ? [
        {
          id: editingCategoryId,
          name: getCatName(editingCategoryId, type),
          icon: isSharedMode
            ? getSharedCategoryIcon(editingCategoryId, type)
            : getCategoryIcon(editingCategoryId, type),
          isCustom: true,
          deleted: true,
        },
        ...categoryList,
      ]
    : categoryList;

  const handleDismiss = () => {
    setType('expense');
    setAmount('');
    setNote('');
    setCategoryId('housing');
    setRecurringDay(1);
    onDismiss();
  };

  const handleTypeChange = (newType: MovementType) => {
    lightHaptic();
    setType(newType);
    const sorted = getSortedCategoriesForType(newType);
    setCategoryId(sorted[0]?.id ?? 'other');
    setPickerKey((k) => k + 1);
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
    const parsedAmount = parseAmountInput(amount);
    const day = recurringDay;
    if (!parsedAmount || parsedAmount <= 0) return;
    if (!day || day < 1 || day > 31) return;

    isSavingRef.current = true;
    lightHaptic();

    if (editingRecurring) {
      const updates: Partial<RecurringMovement> = {
        type,
        amount: parsedAmount,
        category: categoryId as any,
        description: getCatName(categoryId, type),
        recurringDay: day,
        note: note.trim() || undefined,
      };
      updateRecurringMovement(editingRecurring.id, updates).finally(() => {
        isSavingRef.current = false;
      });
      handleDismiss();
      return;
    }

    const newRecurring: RecurringMovement = {
      // Sufijo aleatorio, igual que en el resto de stores. Los recurrentes ya
      // creados conservan su id, así que applyRecurringMovements sigue casando
      // los movimientos que generó para ellos.
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
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
    parseAmountInput(amount) > 0 &&
    recurringDay >= 1 &&
    recurringDay <= 31;

  return (
    <>
      <BottomSheet
        visible={visible}
        onClose={handleDismiss}
        title={editingRecurring ? t('recurring.edit') : t('recurring.add')}
        footer={<SheetButton label={t('movements.save')} onPress={handleSave} disabled={!isValid} />}
      >
        <SegmentedControl
          options={[
            { key: 'expense', label: t('movements.expense'), icon: 'arrow-up', activeColor: ui.expenseText },
            { key: 'income', label: t('movements.income'), icon: 'arrow-down', activeColor: ui.incomeText },
          ]}
          value={type}
          onChange={handleTypeChange}
        />

        <AmountInput value={amount} onChangeText={setAmount} currencySymbol={currencySymbol} />

        <FilledInput
          icon="create-outline"
          value={note}
          onChangeText={setNote}
          placeholder={t('movements.descriptionPlaceholder')}
          maxLength={80}
        />

        <SheetLabel>{t('recurring.dayPickerLabel')}</SheetLabel>
        <DayPicker value={recurringDay} onChange={setRecurringDay} resetKey={pickerKey} />
        <View style={[styles.info, { backgroundColor: ui.fill }]}>
          <Icon name="repeat" size={16} color={dc.textSecondary} />
          <Text style={[styles.infoText, { color: dc.textSecondary }]}>{t('recurring.infoMessage')}</Text>
        </View>

        <SheetLabel>{t('movements.category')}</SheetLabel>
        <CategoryPicker
          categories={chipCategories}
          type={type}
          selectedId={categoryId}
          onSelect={setCategoryId}
          onAdd={handleAddCategoryPress}
          resetKey={pickerKey}
        />
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
  info: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, marginTop: 10,
  },
  infoText: { flex: 1, fontSize: 12, fontFamily: 'Poppins_400Regular', lineHeight: 17 },
});

export default AddRecurringModal;
