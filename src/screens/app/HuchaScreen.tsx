import React, { useState } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput,
  Modal,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSavingsStore } from '../../store/savingsStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useSharedAccountStore } from '../../store/sharedAccountStore';
import { useTheme } from '../../hooks/useTheme';
import { colors } from '../../theme';
import { SavingMovement } from '../../types';
import AppHeader from '../../components/common/AppHeader';
import { formatDate } from '../../utils/dateFormat';

const SavingRow = ({
  item,
  onDelete,
}: {
  item: SavingMovement;
  onDelete: (id: string) => void;
}) => {
  const { t } = useTranslation();
  const { colors: dc } = useTheme();
  const { getCurrencySymbol } = useSettingsStore();
  const { isSharedMode, getSharedCurrencySymbol } = useSharedAccountStore();
  const currencySymbol = isSharedMode ? getSharedCurrencySymbol() : getCurrencySymbol();
  const isDeposit = item.type === 'deposit';
  const color = isDeposit ? colors.income : colors.expense;
  const icon: keyof typeof Ionicons.glyphMap = isDeposit ? 'arrow-down-circle' : 'arrow-up-circle';

  const handleDelete = () => {
    Alert.alert(
      t('hucha.deleteConfirm'),
      item.description,
      [
        { text: t('hucha.cancel'), style: 'cancel' },
        { text: 'OK', style: 'destructive', onPress: () => onDelete(item.id) },
      ]
    );
  };

  return (
    <View style={[styles.row, { backgroundColor: dc.surface, borderColor: dc.border }]}>
      <View style={[styles.rowIcon, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <View style={styles.rowInfo}>
        <Text style={[styles.rowDescription, { color: dc.textPrimary }]}>
          {item.description}
        </Text>
        <Text style={[styles.rowDate, { color: dc.textSecondary }]}>
          {formatDate(item.date)}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={[styles.rowAmount, { color }]}>
          {isDeposit ? '+' : '-'}{item.amount.toFixed(2)} {currencySymbol}
        </Text>
        <TouchableOpacity onPress={handleDelete} style={styles.deleteButton}>
          <Ionicons name="trash-outline" size={18} color={colors.expense} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const AmountModal = ({
  visible,
  title,
  onConfirm,
  onDismiss,
}: {
  visible: boolean;
  title: string;
  onConfirm: (amount: number, description: string) => void;
  onDismiss: () => void;
}) => {
  const { t } = useTranslation();
  const { colors: dc } = useTheme();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  const handleConfirm = () => {
    const parsed = parseFloat(amount.replace(',', '.'));
    if (!parsed || parsed <= 0 || !description.trim()) return;
    onConfirm(parsed, description.trim());
    setAmount('');
    setDescription('');
  };

  const handleDismiss = () => {
    setAmount('');
    setDescription('');
    onDismiss();
  };

  const isValid = !!amount && parseFloat(amount.replace(',', '.')) > 0 && !!description.trim();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleDismiss}
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={handleDismiss}
        />
        <View style={[styles.sheet, { backgroundColor: dc.surface }]}>
          <View style={[styles.sheetHandle, { backgroundColor: dc.border }]} />
          <Text style={[styles.sheetTitle, { color: dc.textPrimary }]}>{title}</Text>

          <TextInput
            style={[styles.input, { backgroundColor: dc.background, borderColor: dc.border, color: dc.textPrimary }]}
            placeholder={t('hucha.amount')}
            placeholderTextColor={dc.textSecondary}
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
          />
          <TextInput
            style={[styles.input, { backgroundColor: dc.background, borderColor: dc.border, color: dc.textPrimary }]}
            placeholder={t('hucha.descriptionPlaceholder')}
            placeholderTextColor={dc.textSecondary}
            value={description}
            onChangeText={setDescription}
          />

          <View style={styles.sheetButtons}>
            <TouchableOpacity
              style={[styles.sheetBtn, { backgroundColor: dc.border }]}
              onPress={handleDismiss}
            >
              <Text style={[styles.sheetBtnText, { color: dc.textSecondary }]}>
                {t('hucha.cancel')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sheetBtn, { backgroundColor: isValid ? dc.primary : dc.border }]}
              onPress={handleConfirm}
              disabled={!isValid}
            >
              <Text style={[styles.sheetBtnText, { color: isValid ? '#FFFFFF' : dc.textSecondary }]}>
                {t('hucha.save')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const HuchaScreen = () => {
  const { t } = useTranslation();
  const { colors: dc } = useTheme();
  const { savingMovements, getSaldo, deposit, withdraw, deleteSavingMovement } = useSavingsStore();
  const { getCurrencySymbol } = useSettingsStore();
  const { isSharedMode, getSharedCurrencySymbol } = useSharedAccountStore();
  const currencySymbol = isSharedMode ? getSharedCurrencySymbol() : getCurrencySymbol();

  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);

  const saldo = getSaldo();

  const handleDeposit = async (amount: number, description: string) => {
    setShowDeposit(false);
    try {
      await deposit(amount, description);
    } catch {
      Alert.alert('Error', 'No se pudo guardar el depósito');
    }
  };

  const handleWithdraw = async (amount: number, description: string) => {
    setShowWithdraw(false);
    const ok = await withdraw(amount, description);
    if (!ok) {
      Alert.alert(t('hucha.withdrawError'), t('hucha.withdrawErrorMsg'));
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: dc.background }]}>
      <AppHeader title={t('hucha.title')} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Balance card */}
        <View style={[styles.balanceCard, { backgroundColor: dc.balanceCard }]}>
          <Text style={styles.balanceLabel}>{t('hucha.balance')}</Text>
          <Text style={styles.balanceAmount}>
            {saldo.toFixed(2)} {currencySymbol}
          </Text>
          <Text style={styles.balanceEmoji}>🐷</Text>
        </View>

        {/* Botones */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: dc.primary }]}
            onPress={() => setShowDeposit(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-down-circle-outline" size={20} color="#FFFFFF" />
            <Text style={styles.actionBtnText}>{t('hucha.deposit')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: dc.primary }]}
            onPress={() => setShowWithdraw(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-up-circle-outline" size={20} color="#FFFFFF" />
            <Text style={styles.actionBtnText}>{t('hucha.withdraw')}</Text>
          </TouchableOpacity>
        </View>

        {/* Lista */}
        {savingMovements.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🐷</Text>
            <Text style={[styles.emptyText, { color: dc.textPrimary }]}>
              {t('hucha.empty')}
            </Text>
            <Text style={[styles.emptySubtext, { color: dc.textSecondary }]}>
              {t('hucha.emptySubtitle')}
            </Text>
          </View>
        ) : (
          savingMovements.map(item => (
            <SavingRow key={item.id} item={item} onDelete={deleteSavingMovement} />
          ))
        )}
      </ScrollView>

      <AmountModal
        visible={showDeposit}
        title={t('hucha.depositTitle')}
        onConfirm={handleDeposit}
        onDismiss={() => setShowDeposit(false)}
      />
      <AmountModal
        visible={showWithdraw}
        title={t('hucha.withdrawTitle')}
        onConfirm={handleWithdraw}
        onDismiss={() => setShowWithdraw(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 100 },
  balanceCard: {
    borderRadius: 20, padding: 24, marginBottom: 16,
    alignItems: 'center', position: 'relative',
  },
  balanceLabel: {
    fontSize: 13, fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.8)', marginBottom: 4,
  },
  balanceAmount: {
    fontSize: 36, fontFamily: 'Poppins_700Bold', color: '#FFFFFF',
  },
  balanceEmoji: {
    fontSize: 32, position: 'absolute', top: 16, right: 20,
  },
  actionRow: {
    flexDirection: 'row', gap: 12, marginBottom: 20,
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8,
    borderRadius: 14, paddingVertical: 14,
  },
  actionBtnText: {
    fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: '#FFFFFF',
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 16, padding: 14, marginBottom: 10,
    borderWidth: 0.5, gap: 10,
  },
  rowIcon: {
    width: 42, height: 42, borderRadius: 21,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  rowInfo: { flex: 1 },
  rowDescription: { fontSize: 14, fontFamily: 'Poppins_500Medium' },
  rowDate: { fontSize: 11, fontFamily: 'Poppins_400Regular', marginTop: 2 },
  rowRight: { alignItems: 'flex-end', gap: 6 },
  rowAmount: { fontSize: 14, fontFamily: 'Poppins_600SemiBold' },
  deleteButton: { padding: 4 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyText: { fontSize: 18, fontFamily: 'Poppins_600SemiBold', marginBottom: 8 },
  emptySubtext: {
    fontSize: 13, fontFamily: 'Poppins_400Regular',
    textAlign: 'center', paddingHorizontal: 32,
  },
  modalOverlay: {
    flex: 1, justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    alignSelf: 'center', marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 18, fontFamily: 'Poppins_600SemiBold', marginBottom: 20,
  },
  input: {
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 12, fontSize: 15, fontFamily: 'Poppins_400Regular',
    marginBottom: 12,
  },
  sheetButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  sheetBtn: {
    flex: 1, borderRadius: 12, paddingVertical: 14,
    alignItems: 'center',
  },
  sheetBtnText: { fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
});

export default HuchaScreen;
