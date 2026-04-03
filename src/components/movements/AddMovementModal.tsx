import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Text, TextInput, Button } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useMovementStore } from '../../store/movementStore';
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
  salary: 'briefcase',
  freelance: 'laptop',
  investment: 'trending-up',
  gift: 'gift',
  housing: 'home',
  food: 'restaurant',
  transport: 'car',
  health: 'medical',
  entertainment: 'game-controller',
  shopping: 'bag',
  education: 'school',
  bills: 'receipt',
  emergency: 'shield',
  retirement: 'umbrella',
  travel: 'airplane',
  other: 'ellipsis-horizontal',
};

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

const AddMovementModal = ({ visible, onDismiss }: Props) => {
  const { t } = useTranslation();
  const { addMovement } = useMovementStore();
  const { isDark, colors: dc } = useTheme();

  const [type, setType] = useState<MovementType>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<MovementCategory>('food');
  const [description, setDescription] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringDay, setRecurringDay] = useState('1');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const typeColor =
    type === 'income'
      ? colors.income
      : type === 'saving'
      ? colors.savings
      : colors.expense;

  const sheetBg = isDark ? colors.surfaceDark : '#FFFFFF';
  const inputBg = isDark ? colors.backgroundDark : '#FFFFFF';
  const chipBg = isDark ? colors.borderDark : '#F8F8F8';
  const chipBorder = isDark ? colors.borderDark : '#E0E0E0';
  const recurringBg = isDark ? colors.borderDark : '#F8F8F8';

  const handleDismiss = () => {
    if (isSubmitting) return;
    setType('expense');
    setAmount('');
    setCategory('food');
    setDescription('');
    setIsRecurring(false);
    setRecurringDay('1');
    setIsSubmitting(false);
    onDismiss();
  };

  const handleTypeChange = (newType: MovementType) => {
    setType(newType);
    setCategory(CATEGORIES[newType][0]);
  };

  const handleSave = async () => {
    if (isSubmitting) return;
    const parsedAmount = parseFloat(amount.replace(',', '.'));
    if (!parsedAmount || parsedAmount <= 0 || !description.trim()) return;

    setIsSubmitting(true);
    try {
      const newMovement: Movement = {
        id: Date.now().toString(),
        type,
        amount: parsedAmount,
        category,
        description: description.trim(),
        date: new Date().toISOString(),
        isRecurring,
        recurringDay: isRecurring ? parseInt(recurringDay) : undefined,
        currency: 'EUR',
        createdAt: new Date().toISOString(),
      };
      await addMovement(newMovement);
      handleDismiss();
    } catch (e) {
      console.error('Error saving movement:', e);
      setIsSubmitting(false);
    }
  };

  const isValid =
    !!amount &&
    parseFloat(amount.replace(',', '.')) > 0 &&
    !!description.trim();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleDismiss}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={handleDismiss}
        />

        <View style={[styles.sheet, { backgroundColor: sheetBg }]}>
          <View style={[styles.handleBar, { backgroundColor: dc.border }]} />

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={[styles.title, { color: dc.textPrimary }]}>
              {t('movements.addMovement')}
            </Text>

            {/* SELECTOR DE TIPO */}
            <View style={styles.typeSelector}>
              {(['expense', 'income', 'saving'] as MovementType[]).map((t_) => (
                <TouchableOpacity
                  key={t_}
                  style={[
                    styles.typeButton,
                    { backgroundColor: isDark ? colors.borderDark : '#F0F0F0' },
                    type === t_ && {
                      backgroundColor:
                        t_ === 'income'
                          ? colors.income
                          : t_ === 'saving'
                          ? colors.savings
                          : colors.expense,
                    },
                  ]}
                  onPress={() => handleTypeChange(t_)}
                >
                  <Text
                    style={[
                      styles.typeButtonText,
                      { color: dc.textSecondary },
                      type === t_ && styles.typeButtonTextActive,
                    ]}
                  >
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
              left={<TextInput.Affix text="€" />}
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
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.categoryScroll}
            >
              {CATEGORIES[type].map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.categoryChip,
                    { backgroundColor: chipBg, borderColor: chipBorder },
                    category === cat && {
                      backgroundColor: typeColor,
                      borderColor: typeColor,
                    },
                  ]}
                  onPress={() => setCategory(cat)}
                >
                  <Ionicons
                    name={CATEGORY_ICONS[cat]}
                    size={16}
                    color={category === cat ? '#FFF' : dc.textSecondary}
                  />
                  <Text
                    style={[
                      styles.categoryChipText,
                      { color: dc.textSecondary },
                      category === cat && styles.categoryChipTextActive,
                    ]}
                  >
                    {t(`movements.categories.${cat}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* RECURRENTE */}
            <TouchableOpacity
              style={[styles.recurringRow, { backgroundColor: recurringBg }]}
              onPress={() => setIsRecurring(!isRecurring)}
            >
              <View style={styles.recurringLeft}>
                <Ionicons
                  name="repeat"
                  size={20}
                  color={isRecurring ? typeColor : dc.textSecondary}
                />
                <Text style={[styles.recurringLabel, { color: dc.textPrimary }]}>
                  {t('movements.recurringQuestion')}
                </Text>
              </View>
              <View style={[styles.toggle, isRecurring && { backgroundColor: typeColor }]}>
                <View style={[styles.toggleKnob, isRecurring && styles.toggleKnobActive]} />
              </View>
            </TouchableOpacity>

            {isRecurring && (
              <TextInput
                label={t('movements.recurringDay')}
                value={recurringDay}
                onChangeText={setRecurringDay}
                keyboardType="number-pad"
                mode="outlined"
                style={[styles.input, { backgroundColor: inputBg }]}
                outlineColor={typeColor}
                activeOutlineColor={typeColor}
              />
            )}

            {/* BOTONES */}
            <View style={styles.buttons}>
              <Button
                mode="outlined"
                onPress={handleDismiss}
                disabled={isSubmitting}
                style={[styles.cancelButton, { borderColor: dc.border }]}
                textColor={dc.textSecondary}
              >
                {t('movements.cancel')}
              </Button>
              <Button
  mode="contained"
  onPress={handleSave}
  loading={isSubmitting}
  style={[styles.saveButton, { backgroundColor: typeColor }]}
  textColor="#FFFFFF"
>
  {t('movements.save')}
</Button>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '90%',
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontFamily: 'Poppins_700Bold',
    marginBottom: 20,
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  typeButtonText: {
    fontSize: 13,
    fontFamily: 'Poppins_600SemiBold',
  },
  typeButtonTextActive: {
    color: '#FFFFFF',
  },
  input: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 13,
    fontFamily: 'Poppins_500Medium',
    marginBottom: 10,
  },
  categoryScroll: { marginBottom: 20 },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  categoryChipText: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
    fontFamily: 'Poppins_600SemiBold',
  },
  recurringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  recurringLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  recurringLabel: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    flex: 1,
  },
  toggle: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    padding: 2,
  },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    elevation: 2,
  },
  toggleKnobActive: { alignSelf: 'flex-end' },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: { flex: 1 },
  saveButton: { flex: 2 },
});

export default AddMovementModal;