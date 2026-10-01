import React, { useState, useRef, useEffect, useMemo } from 'react';
import { TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
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
import { CategoryPicker, CategoryChip } from './SheetPickers';
import { navigationRef } from '../../navigation/navigationRef';
import { MovementType, Movement } from '../../types';
import { lightHaptic } from '../../utils/haptics';
import { parseAmountInput, formatAmountForInput } from '../../utils/formatAmount';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  initialType?: MovementType;
  editingMovement?: Movement | null;
}

const AddMovementModal = ({ visible, onDismiss, initialType, editingMovement }: Props) => {
  const { t } = useTranslation();
  const { ui } = useTheme();
  const { addMovement, updateMovement, movements } = useMovementStore();
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

  const [type, setType] = useState<MovementType>(initialType ?? 'expense');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [categoryId, setCategoryId] = useState('housing');
  // Cambia al abrir o al cambiar de tipo: la fila de categorías vuelve al principio
  const [pickerKey, setPickerKey] = useState(0);

  const isSavingRef = useRef(false);
  const amountRef = useRef<TextInput>(null);

  // Añadiendo, el teclado numérico sale solo, listo para el importe. Editando,
  // no: casi siempre se cambia otra cosa. Con un momento de espera, cuando la
  // hoja ya está en pantalla: enfocando el campo mientras aparecía, iOS no la
  // enseñaba hasta tener el teclado listo, y la primera vez tras abrir la app
  // tardaba segundos en salir
  useEffect(() => {
    if (!visible || editingMovement) return;
    const id = setTimeout(() => amountRef.current?.focus(), 250);
    return () => clearTimeout(id);
  }, [visible, editingMovement]);

  // El movimiento que se edita, el mismo mientras la ventana se cierra: quien
  // la abre lo quita en cuanto se pide cerrar, y la ventana pasaba a decir
  // "Añadir movimiento" mientras bajaba
  const shownEditing = useRef(editingMovement ?? null);
  if (visible) shownEditing.current = editingMovement ?? null;
  const editing = shownEditing.current;

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
    // (el movimiento ya está guardado en local): no bloquear el siguiente
    isSavingRef.current = false;
    setPickerKey((k) => k + 1);
    if (editingMovement) {
      setType(editingMovement.type);
      setAmount(formatAmountForInput(editingMovement.amount));
      setNote(editingMovement.note ?? '');
      setCategoryId(editingMovement.category);
      return;
    }
    // Una nueva sale vacía. Se vacía aquí, al abrir, y no al cerrar: al cerrar
    // se veía cómo se borraba lo escrito mientras la ventana bajaba
    const newType = initialType ?? 'expense';
    setType(newType);
    setAmount('');
    setNote('');
    const sorted = getSortedCategoriesForType(newType);
    setCategoryId(sorted[0]?.id ?? 'other');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialType, editingMovement]);

  const getCatName = (id: string, tp: MovementType) =>
    isSharedMode
      ? getSharedCategoryName(id, tp, t)
      : getCategoryName(id, tp, t);

  // Al editar un movimiento cuya categoría ya se borró, esa categoría no está en
  // la lista: se añade al principio, tachada, para que se vea cuál tiene y se
  // pueda conservar. Solo si está borrada de verdad y el tipo es el suyo.
  const editingCategoryId = editing?.type === type ? editing.category : undefined;
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

  const handleTypeChange = (newType: MovementType) => {
    lightHaptic();
    setType(newType);
    const sorted = getSortedCategoriesForType(newType);
    setCategoryId(sorted[0]?.id ?? 'other');
    setPickerKey((k) => k + 1);
  };

  const handleAddCategoryPress = () => {
    requirePremium(() => {
      onDismiss();
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
    if (!parsedAmount || parsedAmount <= 0) return;

    isSavingRef.current = true;
    lightHaptic();

    if (editing) {
      // La fecha original se conserva: el store ignora cualquier cambio de fecha
      updateMovement(editing.id, {
        type,
        amount: parsedAmount,
        category: categoryId as any,
        description: getCatName(categoryId, type),
        note: note.trim() || undefined,
        currency: currencySymbol,
      }).finally(() => {
        isSavingRef.current = false;
      });
      onDismiss();
      return;
    }

    const movement: Movement = {
      // Sufijo aleatorio: dos miembros de una cuenta compartida guardando en el
      // mismo milisegundo generaban el mismo id y uno pisaba al otro
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      amount: parsedAmount,
      category: categoryId as any,
      description: getCatName(categoryId, type),
      note: note.trim() || undefined,
      date: new Date().toISOString(),
      isRecurring: false,
      currency: currencySymbol,
      createdAt: new Date().toISOString(),
    };

    addMovement(movement).finally(() => {
      isSavingRef.current = false;
    });
    onDismiss();
  };

  const isValid = !!amount && parseAmountInput(amount) > 0;
  const saveLabel = editing
    ? t('movements.save')
    : t(type === 'income' ? 'movements.saveIncome' : 'movements.saveExpense');

  return (
    <BottomSheet
      visible={visible}
      onClose={onDismiss}
      title={editing ? t('movements.edit') : t('movements.add')}
      footer={<SheetButton label={saveLabel} onPress={handleSave} disabled={!isValid} />}
    >
      <SegmentedControl
        options={[
          { key: 'expense', label: t('movements.expense'), icon: 'arrow-up', activeColor: ui.expenseText },
          { key: 'income', label: t('movements.income'), icon: 'arrow-down', activeColor: ui.incomeText },
        ]}
        value={type}
        onChange={handleTypeChange}
      />

      <AmountInput
        ref={amountRef}
        value={amount}
        onChangeText={setAmount}
        currencySymbol={currencySymbol}
      />

      <FilledInput
        icon="create-outline"
        value={note}
        onChangeText={setNote}
        placeholder={t('movements.descriptionPlaceholder')}
        maxLength={80}
      />

      <SheetLabel>{t('movements.category')}</SheetLabel>
      <CategoryPicker
        categories={chipCategories}
        type={type}
        selectedId={categoryId}
        onSelect={setCategoryId}
        onAdd={handleAddCategoryPress}
        resetKey={pickerKey}
      />

      {/* Dentro de la hoja y no al lado: iOS no abre una ventana mientras hay
          otra abierta, salvo que vaya dentro de ella. Al lado, "Nueva" no hacía
          nada sin premium. Al cerrarla se sigue en la hoja, con lo escrito */}
      <PremiumModal
        visible={showPremiumModal}
        onDismiss={() => setShowPremiumModal(false)}
        onPurchase={() => setShowPremiumModal(false)}
      />
    </BottomSheet>
  );
};

export default AddMovementModal;
