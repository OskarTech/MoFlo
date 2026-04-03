import React, { useState } from 'react';
import {
  View, StyleSheet, ScrollView,
  TouchableOpacity, Alert,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useMovementStore } from '../../store/movementStore';
import { useTheme } from '../../hooks/useTheme';
import { colors } from '../../theme';
import { RecurringMovement } from '../../types';
import AddRecurringModal from '../../components/movements/AddRecurringModal';
import AppHeader from '../../components/common/AppHeader';

const RecurringCard = ({
  item, onDelete,
}: {
  item: RecurringMovement; onDelete: (id: string) => void;
}) => {
  const { t } = useTranslation();
  const { colors: dc } = useTheme();
  const color = item.type === 'income'
    ? colors.income : item.type === 'saving'
    ? colors.savings : colors.expense;
  const icon: keyof typeof Ionicons.glyphMap = item.type === 'income'
    ? 'arrow-down-circle' : item.type === 'saving' ? 'save' : 'arrow-up-circle';

  const handleDelete = () => {
    Alert.alert(
      t('recurring.deleteConfirm'),
      item.description,
      [
        { text: t('movements.cancel'), style: 'cancel' },
        { text: 'OK', style: 'destructive', onPress: () => onDelete(item.id) },
      ]
    );
  };

  return (
    <View style={[styles.card, { backgroundColor: dc.surface, borderColor: dc.border }]}>
      <View style={[styles.cardIcon, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <View style={styles.cardInfo}>
        <Text style={[styles.cardDescription, { color: dc.textPrimary }]}>
          {item.description}
        </Text>
        <Text style={[styles.cardDay, { color: dc.textSecondary }]}>
          {t('recurring.dayOfMonth', { day: item.recurringDay })}
        </Text>
      </View>
      <View style={styles.cardRight}>
        <Text style={[styles.cardAmount, { color }]}>
          {item.type === 'income' ? '+' : '-'}{item.amount.toFixed(2)} €
        </Text>
        <TouchableOpacity onPress={handleDelete} style={styles.deleteButton}>
          <Ionicons name="trash-outline" size={18} color={colors.expense} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

interface RecurringScreenProps {
  modalVisible?: boolean;
  onModalDismiss?: () => void;
}

const RecurringScreen = ({
  modalVisible = false,
  onModalDismiss,
}: RecurringScreenProps) => {
  const { t } = useTranslation();
  const { recurringMovements, deleteRecurringMovement } = useMovementStore();
  const { colors: dc } = useTheme();
  const [internalModalVisible, setInternalModalVisible] = useState(false);

  return (
    <View style={[styles.container, { backgroundColor: dc.background }]}>
      <AppHeader title={t('recurring.title')} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {recurringMovements.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🔄</Text>
            <Text style={[styles.emptyText, { color: dc.textPrimary }]}>
              {t('recurring.noRecurring')}
            </Text>
            <Text style={[styles.emptySubtext, { color: dc.textSecondary }]}>
              {t('recurring.noRecurringSubtitle')}
            </Text>
          </View>
        ) : (
          recurringMovements.map((item) => (
            <RecurringCard
              key={item.id}
              item={item}
              onDelete={deleteRecurringMovement}
            />
          ))
        )}
      </ScrollView>

      <AddRecurringModal
        visible={modalVisible || internalModalVisible}
        onDismiss={() => {
          setInternalModalVisible(false);
          onModalDismiss?.();
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 100 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 0.5,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardInfo: { flex: 1 },
  cardDescription: {
    fontSize: 15,
    fontFamily: 'Poppins_500Medium',
  },
  cardDay: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    marginTop: 2,
  },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  cardAmount: {
    fontSize: 15,
    fontFamily: 'Poppins_600SemiBold',
  },
  deleteButton: { padding: 4 },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyText: {
    fontSize: 18,
    fontFamily: 'Poppins_600SemiBold',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});

export default RecurringScreen;