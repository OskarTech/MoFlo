import React, { useState, useEffect } from 'react';
import {
  View, StyleSheet, ScrollView,
  TouchableOpacity, Alert, Modal,
  Platform,
} from 'react-native';
import { Text, TextInput, Button } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '../../hooks/useTheme';
import { colors } from '../../theme';
import AppHeader from '../../components/common/AppHeader';
import { Reminder } from '../../types';
import i18n from '../../i18n';

const STORAGE_KEY = '@moflo_reminders';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Formatea fecha según idioma
const formatDate = (date: Date): string => {
  const lang = i18n.language;
  if (lang === 'en') {
    return date.toLocaleDateString('en-US');
  }
  return date.toLocaleDateString('es-ES'); // DD/MM/YYYY para es y pl
};

// Formatea hora según idioma
const formatTime = (date: Date): string => {
  const lang = i18n.language;
  if (lang === 'en') {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
};

// ── COMPONENTE: Tarjeta de Recordatorio ────────────────────────
const ReminderCard = ({
  reminder, onDelete,
}: {
  reminder: Reminder; onDelete: (id: string) => void;
}) => {
  const { t } = useTranslation();
  const { colors: dc } = useTheme();

  const date = new Date(reminder.date);
  const isPast = date < new Date();

  const handleDelete = () => {
    Alert.alert(
      t('reminders.deleteConfirm'),
      reminder.title,
      [
        { text: t('reminders.cancel'), style: 'cancel' },
        { text: 'OK', style: 'destructive', onPress: () => onDelete(reminder.id) },
      ]
    );
  };

  return (
    <View style={[
      styles.card,
      {
        backgroundColor: dc.surface,
        borderColor: isPast ? dc.border : colors.primary + '40',
        borderLeftColor: isPast ? dc.border : colors.primary,
      }
    ]}>
      <View style={styles.cardContent}>
        <View style={[styles.cardIcon, {
          backgroundColor: isPast ? dc.border + '40' : colors.primary + '20',
        }]}>
          <Ionicons
            name={isPast ? 'notifications-off-outline' : 'notifications-outline'}
            size={22}
            color={isPast ? dc.textSecondary : colors.primary}
          />
        </View>
        <View style={styles.cardInfo}>
          <Text style={[
            styles.cardTitle,
            { color: isPast ? dc.textSecondary : dc.textPrimary },
          ]}>
            {reminder.title}
          </Text>
          <Text style={[styles.cardDate, {
            color: isPast ? dc.textSecondary : colors.primary,
          }]}>
            📅 {formatDate(date)} · ⏰ {formatTime(date)}
          </Text>
        </View>
        <TouchableOpacity onPress={handleDelete} style={styles.deleteButton}>
          <Ionicons name="trash-outline" size={18} color={colors.expense} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ── MODAL: Añadir Recordatorio ─────────────────────────────────
const AddReminderModal = ({
  visible, onDismiss, onSave,
}: {
  visible: boolean;
  onDismiss: () => void;
  onSave: (reminder: Omit<Reminder, 'id' | 'createdAt' | 'notificationId'>) => Promise<void>;
}) => {
  const { t } = useTranslation();
  const { isDark, colors: dc } = useTheme();

  // Inicializa con +1 hora para evitar el problema de fecha pasada
  const getDefaultDate = () => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return d;
  };

  const [description, setDescription] = useState('');
  const [selectedDate, setSelectedDate] = useState(getDefaultDate());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const isValid = !!description.trim();

  const handleDismiss = () => {
    setDescription('');
    setSelectedDate(getDefaultDate());
    setShowDatePicker(false);
    setShowTimePicker(false);
    onDismiss();
  };

  const handleDateChange = (_: any, date?: Date) => {
    setShowDatePicker(false);
    if (date) {
      const updated = new Date(selectedDate);
      updated.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
      setSelectedDate(updated);
    }
  };

  const handleTimeChange = (_: any, time?: Date) => {
    setShowTimePicker(false);
    if (time) {
      const updated = new Date(selectedDate);
      updated.setHours(time.getHours(), time.getMinutes());
      setSelectedDate(updated);
    }
  };

  const handleSave = async () => {
    if (!isValid) return;

    setSaving(true);
    try {
      await onSave({
        title: description.trim(),
        description: '',
        date: selectedDate.toISOString(),
      });
      handleDismiss();
    } catch (e) {
      console.error('Error saving reminder:', e);
      Alert.alert('Error', 'No se pudo crear el recordatorio.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleDismiss}
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={handleDismiss}
        />
        <View style={[styles.modalSheet, {
          backgroundColor: isDark ? colors.surfaceDark : '#FFFFFF',
        }]}>
          <View style={[styles.handleBar, { backgroundColor: dc.border }]} />

          <Text style={[styles.modalTitle, { color: dc.textPrimary }]}>
            {t('reminders.add')}
          </Text>

          {/* DESCRIPCIÓN */}
          <TextInput
            label={t('reminders.reminderDescription')}
            value={description}
            onChangeText={setDescription}
            mode="outlined"
            style={[styles.input, {
              backgroundColor: isDark ? colors.surfaceDark : '#FFFFFF',
            }]}
            outlineColor={dc.border}
            activeOutlineColor={colors.primary}
          />

          {/* SELECTOR DE FECHA */}
          <Text style={[styles.pickerLabel, { color: dc.textSecondary }]}>
            {t('reminders.reminderDate')}
          </Text>
          <TouchableOpacity
            style={[styles.pickerButton, {
              backgroundColor: dc.surface,
              borderColor: dc.border,
            }]}
            onPress={() => setShowDatePicker(true)}
          >
            <Ionicons name="calendar-outline" size={20} color={colors.primary} />
            <Text style={[styles.pickerText, { color: dc.textPrimary }]}>
              {formatDate(selectedDate)}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={dc.textSecondary} />
          </TouchableOpacity>

          {/* SELECTOR DE HORA */}
          <Text style={[styles.pickerLabel, { color: dc.textSecondary }]}>
            {t('reminders.reminderTime')}
          </Text>
          <TouchableOpacity
            style={[styles.pickerButton, {
              backgroundColor: dc.surface,
              borderColor: dc.border,
            }]}
            onPress={() => setShowTimePicker(true)}
          >
            <Ionicons name="time-outline" size={20} color={colors.primary} />
            <Text style={[styles.pickerText, { color: dc.textPrimary }]}>
              {formatTime(selectedDate)}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={dc.textSecondary} />
          </TouchableOpacity>

          {/* DATE PICKER NATIVO */}
          {showDatePicker && (
            <DateTimePicker
              value={selectedDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              minimumDate={new Date()}
              onChange={handleDateChange}
            />
          )}

          {/* TIME PICKER NATIVO */}
          {showTimePicker && (
            <DateTimePicker
              value={selectedDate}
              mode="time"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              is24Hour={i18n.language !== 'en'}
              onChange={handleTimeChange}
            />
          )}

          {/* BOTONES */}
          <View style={styles.modalButtons}>
            <Button
              mode="outlined"
              onPress={handleDismiss}
              style={styles.cancelButton}
              textColor={dc.textSecondary}
            >
              {t('reminders.cancel')}
            </Button>
            <Button
              mode="contained"
              onPress={handleSave}
              loading={saving}
              disabled={!isValid || saving}
              style={styles.saveButton}
              buttonColor={colors.primary}
              textColor="#FFFFFF"
            >
              {t('reminders.save')}
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ── PANTALLA PRINCIPAL ──────────────────────────────────────────
interface RemindersScreenProps {
  modalVisible?: boolean;
  onModalDismiss?: () => void;
}

const RemindersScreen = ({
  modalVisible = false,
  onModalDismiss,
}: RemindersScreenProps) => {
  const { t } = useTranslation();
  const { colors: dc } = useTheme();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [internalModalVisible, setInternalModalVisible] = useState(false);

  useEffect(() => {
    loadReminders();
    requestPermissions();
  }, []);

  const requestPermissions = async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        t('reminders.permissionDenied'),
        t('reminders.permissionDeniedMessage')
      );
    }
  };

  const loadReminders = async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) setReminders(JSON.parse(raw));
    } catch (e) {
      console.error('Error loading reminders:', e);
    }
  };

  const saveReminders = async (newReminders: Reminder[]) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newReminders));
    setReminders(newReminders);
  };

  const handleAddReminder = async (
    data: Omit<Reminder, 'id' | 'createdAt' | 'notificationId'>
  ) => {
    try {
      const date = new Date(data.date);

      let notificationId = '';
      try {
        notificationId = await Notifications.scheduleNotificationAsync({
          content: {
            title: `🔔 MoFlo`,
            body: data.title,
            sound: true,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date,
          },
        });
      } catch (notifError) {
        console.error('Notification error:', notifError);
        // Continuamos aunque falle la notificación
      }

      const newReminder: Reminder = {
        id: Date.now().toString(),
        ...data,
        notificationId,
        createdAt: new Date().toISOString(),
      };

      const updated = [newReminder, ...reminders];
      await saveReminders(updated);

      Alert.alert(
        t('reminders.scheduled'),
        t('reminders.scheduledMessage', {
          date: formatDate(date),
          time: formatTime(date),
        })
      );
    } catch (e) {
      console.error('Error adding reminder:', e);
      Alert.alert('Error', 'No se pudo guardar el recordatorio.');
    }
  };

  const handleDeleteReminder = async (id: string) => {
    const reminder = reminders.find((r) => r.id === id);
    if (reminder?.notificationId) {
      await Notifications.cancelScheduledNotificationAsync(reminder.notificationId);
    }
    const updated = reminders.filter((r) => r.id !== id);
    await saveReminders(updated);
  };

  const sortedReminders = [...reminders].sort((a, b) => {
    const aDate = new Date(a.date);
    const bDate = new Date(b.date);
    const now = new Date();
    const aFuture = aDate > now;
    const bFuture = bDate > now;
    if (aFuture && !bFuture) return -1;
    if (!aFuture && bFuture) return 1;
    return aDate.getTime() - bDate.getTime();
  });

  return (
    <View style={[styles.container, { backgroundColor: dc.background }]}>
      <AppHeader title={t('header.reminders')} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {sortedReminders.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🔔</Text>
            <Text style={[styles.emptyText, { color: dc.textPrimary }]}>
              {t('reminders.noReminders')}
            </Text>
            <Text style={[styles.emptySubtext, { color: dc.textSecondary }]}>
              {t('reminders.noRemindersSubtitle')}
            </Text>
          </View>
        ) : (
          sortedReminders.map((reminder) => (
            <ReminderCard
              key={reminder.id}
              reminder={reminder}
              onDelete={handleDeleteReminder}
            />
          ))
        )}
      </ScrollView>

      <AddReminderModal
        visible={modalVisible || internalModalVisible}
        onDismiss={() => {
          setInternalModalVisible(false);
          onModalDismiss?.();
        }}
        onSave={handleAddReminder}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 100 },
  card: {
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 0.5,
    borderLeftWidth: 4,
    overflow: 'hidden',
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  cardInfo: { flex: 1 },
  cardTitle: {
    fontSize: 15,
    fontFamily: 'Poppins_600SemiBold',
    marginBottom: 4,
  },
  cardDate: {
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
  },
  deleteButton: { padding: 4 },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
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
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalSheet: {
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
  modalTitle: {
    fontSize: 22,
    fontFamily: 'Poppins_700Bold',
    marginBottom: 20,
  },
  input: { marginBottom: 16 },
  pickerLabel: {
    fontSize: 13,
    fontFamily: 'Poppins_500Medium',
    marginBottom: 8,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    borderWidth: 0.5,
    padding: 14,
    marginBottom: 16,
  },
  pickerText: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Poppins_500Medium',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: { flex: 1 },
  saveButton: { flex: 2 },
});

export default RemindersScreen;