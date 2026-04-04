import React, { useState } from 'react';
import {
  View, StyleSheet, Modal, ScrollView,
  TouchableOpacity, Platform,
} from 'react-native';
import { Text, TextInput, Button } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMovementStore } from '../../store/movementStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useTheme } from '../../hooks/useTheme';
import { colors } from '../../theme';
import { MovementType, MovementCategory, Movement } from '../../types';

const CATEGORIES: Record<MovementType, MovementCategory[]> = {
  income: ['salary', 'freelance', 'investment', 'gift', 'other'],
  expense: [
    'housing', 'food', 'transport', 'health',
    'entertainment', 'shopping', 'education', 'bills', 'other',
  ],
  saving: ['emergency', 'retirement', 'travel', 'other'],
};

const CATEGORY_ICONS: Record<MovementCategory, keyof typeof Ionicons.glyphMap> = {
  salary: 'briefcase', freelance: 'laptop', investment: 'trending-up',
  gift: 'gift', housing: 'home', food: 'restaurant', transport: 'car',
  health: 'medical', entertainment: 'game-controller', shopping: 'bag',
  education: 'school', bills: 'receipt', emergency: 'shield',
  retirement: 'umbrella', travel: 'airplane', other: 'ellipsis-horizontal',
};

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

const AddMovementModal = ({ visible, onDismiss }: Props) => {
  const { t } = useTranslation();
  const { isDark, colors: dc } = useTheme();
  const { addMovement } = useMovementStore();
  const { getCurrencySymbol } = useSettingsStore();
  const insets = useSafeAreaInsets();

  const [type, setType] = useState<MovementType>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<MovementCategory>('housing');
  const [description, setDescription] = useState('');

  const currencySymbol = getCurrencySymbol();
  const typeColor = type === 'income' ? colors.income
    : type === 'saving' ? colors.savings : colors.expense;
  const sheetBg = isDark ? colors.surfaceDark : '#FFFFFF';
  const inputBg = isDark ? colors.backgroundDark : '#FFFFFF';
  const chipBg = isDark ? colors.borderDark : '#F8F8F8';
  const chipBorder = isDark ? colors.borderDark : '#E0E0E0';

  const handleDismiss = () => {
    setType('expense');
    setAmount('');
    setCategory('housing');
    setDescription('');
    onDismiss();
  };

  const handleTypeChange = (newType: MovementType) => {
    setType(newType);
    setCategory(CATEGORIES[newType][0]);
  };

  const handleSave = async () => {
    const parsedAmount = parseFloat(amount.replace(',', '.'));
    if (!parsedAmount || parsedAmount <= 0 || !description.trim()) return;

    const movement: Movement = {
      id: Date.now().toString(),
      type,
      amount: parsedAmount,
      category,
      description: description.trim(),
      date: new Date().toISOString(),
      isRecurring: false,
      currency: getCurrencySymbol(),
      createdAt: new Date().toISOString(),
    };

    await addMovement(movement);
    handleDismiss();
  };

  const isValid = !!amount &&
    parseFloat(amount.replace(',', '.')) > 0 &&
    !!description.trim();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleDismiss}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleDismiss} />
        <View style={[styles.sheet, {
          backgroundColor: sheetBg,
          paddingBottom: insets.bottom + 24,
        }]}>
          <View style={[styles.handleBar, { backgroundColor: dc.border }]} />
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={[styles.title, { color: dc.textPrimary }]}>
              {t('movements.addMovement')}
            </Text>

            {/* TIPO */}
            <View style={styles.typeSelector}>
              {(['expense', 'income', 'saving'] as MovementType[]).map((t_) => (
                <TouchableOpacity
                  key={t_}
                  style={[
                    styles.typeButton,
                    { backgroundColor: isDark ? colors.borderDark : '#F0F0F0' },
                    type === t_ && {
                      backgroundColor: t_ === 'income' ? colors.income
                        : t_ === 'saving' ? colors.savings : colors.expense,
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

            {/* DESCRIPCIÓN */}
            <TextInput
              label={t('movements.description')}
              value={description}
              onChangeText={setDescription}
              mode="outlined"
              style={[styles.input, { backgroundColor: inputBg }]}
              outlineColor={typeColor}
              activeOutlineColor={typeColor}
              placeholder={t('movements.descriptionPlaceholder')}
            />

            {/* CATEGORÍAS */}
            <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
              {t('movements.category')}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
              {CATEGORIES[type].map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.categoryChip,
                    { backgroundColor: chipBg, borderColor: chipBorder },
                    category === cat && { backgroundColor: typeColor, borderColor: typeColor },
                  ]}
                  onPress={() => setCategory(cat)}
                >
                  <Ionicons
                    name={CATEGORY_ICONS[cat]}
                    size={16}
                    color={category === cat ? '#FFF' : dc.textSecondary}
                  />
                  <Text style={[
                    styles.categoryChipText,
                    { color: dc.textSecondary },
                    category === cat && { color: '#FFFFFF', fontFamily: 'Poppins_600SemiBold' },
                  ]}>
                    {t(`movements.categories.${cat}`)}
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
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    maxHeight: '90%',
  },
  handleBar: {
    width: 40, height: 4, borderRadius: 2,
    alignSelf: 'center', marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontFamily: 'Poppins_700Bold',
    marginBottom: 20,
  },
  typeSelector: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  typeButton: {
    flex: 1, paddingVertical: 10,
    borderRadius: 12, alignItems: 'center',
  },
  typeButtonText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
  input: { marginBottom: 16 },
  sectionLabel: {
    fontSize: 13, fontFamily: 'Poppins_500Medium', marginBottom: 10,
  },
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