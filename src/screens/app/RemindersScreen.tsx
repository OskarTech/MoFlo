import React, { useState, useEffect, useRef } from 'react';
import {
  View, StyleSheet, ScrollView,
  TouchableOpacity, Alert, Modal, Platform,
  Keyboard, Animated, KeyboardAvoidingView,
} from 'react-native';
import { Text, TextInput, Button } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { colors } from '../../theme';
import AppHeader from '../../components/common/AppHeader';
import { Reminder } from '../../types';
import i18n from '../../i18n';
import auth from '@react-native-firebase/auth';
import { useSharedAccountStore } from '../../store/sharedAccountStore';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const formatDate = (date: Date): string => {
  if (i18n.language === 'en') return date.toLocaleDateString('en-US');
  return date.toLocaleDateString('es-ES');
};

const formatTime = (date: Date): string => {
  if (i18n.language === 'en') {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
};

const ReminderCard = ({
  reminder, onDelete,
}: {
  reminder: Reminder; onDelete: (id: string) => void;
}) => {
  const { t } = useTranslation();
  const { colors: dc } = useTheme();
  const date = new Date(reminder.date);
  const isPast = date < new Date();

  return (
    <View style={[styles.card, {
      backgroundColor: dc.surface,
      borderColor: isPast ? dc.border : dc.primary + '40',
      borderLeftColor: isPast ? dc.border : dc.primary,
    }]}>
      <View style={styles.cardContent}>
        <View style={[styles.cardIcon, {
          backgroundColor: isPast ? dc.border + '40' : dc.primary + '20',
        }]}>
          <Ionicons
            name={isPast ? 'notifications-off-outline' : 'notifications-outline'}
            size={22}
            color={isPast ? dc.textSecondary : dc.primary}
          />
        </View>
        <View style={styles.cardInfo}>
          <Text style={[styles.cardTitle, { color: isPast ? dc.textSecondary : dc.textPrimary }]}>
            {reminder.title}
          </Text>
          <Text style={[styles.cardDate, { color: isPast ? dc.textSecondary : dc.primary }]}>
            📅 {formatDate(date)} · ⏰ {formatTime(date)}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => Alert.alert(
            t('reminders.deleteConfirm'),
            reminder.title,
            [
              { text: t('reminders.cancel'), style: 'cancel' },
              { text: 'OK', style: 'destructive', onPress: () => onDelete(reminder.id) },
            ]
          )}
          style={styles.deleteButton}
        >
          <Ionicons name="trash-outline" size={18} color={colors.expense} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const AddReminderModal = ({
  visible, onDismiss, onSave,
}: {
  visible: boolean;
  onDismiss: () => void;
  onSave: (data: Omit<Reminder, 'id' | 'createdAt' | 'notificationId'>) => Promise<void>;
}) => {
  const { t } = useTranslation();
  const { isDark, colors: dc } = useTheme();
  const insets = useSafeAreaInsets();

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

  const sheetOffset = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // ANDROID — no tocar
    if (Platform.OS === 'android') {
      const show = Keyboard.addListener('keyboardDidShow', (e) => {
        setShowDatePicker(false);
        setShowTimePicker(false);
        Animated.timing(sheetOffset, {
          toValue: -e.endCoordinates.height,
          duration: 200,
          useNativeDriver: true,
        }).start();
      });
      const hide = Keyboard.addListener('keyboardDidHide', () => {
        Animated.timing(sheetOffset, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start();
      });
      return () => { show.remove(); hide.remove(); };
    }

    // iOS — fix margen con insets
    const show = Keyboard.addListener('keyboardWillShow', (e) => {
      setShowDatePicker(false);
      setShowTimePicker(false);
      Animated.timing(sheetOffset, {
        toValue: -(e.endCoordinates.height - insets.bottom),
        duration: e.duration ?? 250,
        useNativeDriver: true,
      }).start();
    });
    const hide = Keyboard.addListener('keyboardWillHide', () => {
      Animated.timing(sheetOffset, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    });
    return () => { show.remove(); hide.remove(); };
  }, [sheetOffset, insets.bottom]);

  const handleDismiss = () => {
    setDescription('');
    setSelectedDate(getDefaultDate());
    onDismiss();
  };

  const handleSave = async () => {
    if (!description.trim()) return;
    setSaving(true);
    try {
      await onSave({
        title: description.trim(),
        description: '',
        date: selectedDate.toISOString(),
      });
      handleDismiss();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleDismiss}>
      <Animated.View style={[styles.overlay, { transform: [{ translateY: sheetOffset }] }]}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleDismiss} />
        <View style={[styles.modalSheet, {
          backgroundColor: dc.surface,
          paddingBottom: insets.bottom + 24,
        }]}>
          <View style={[styles.handleBar, { backgroundColor: dc.border }]} />

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={[styles.modalTitle, { color: dc.textPrimary }]}>
              {t('reminders.add')}
            </Text>

            <TextInput
              label={t('reminders.reminderDescription')}
              value={description}
              onChangeText={setDescription}
              mode="outlined"
              style={[styles.input, { backgroundColor: isDark ? dc.surface : '#FFFFFF' }]}
              outlineColor={dc.border}
              activeOutlineColor={dc.primary}
            />

            <Text style={[styles.pickerLabel, { color: dc.textSecondary }]}>
              {t('reminders.reminderDate')}
            </Text>
            <TouchableOpacity
              style={[styles.pickerButton, { backgroundColor: dc.surface, borderColor: dc.border }]}
              onPress={() => { setShowDatePicker(prev => !prev); setShowTimePicker(false); }}
            >
              <Ionicons name="calendar-outline" size={20} color={dc.primary} />
              <Text style={[styles.pickerText, { color: dc.textPrimary }]}>
                {formatDate(selectedDate)}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={dc.textSecondary} />
            </TouchableOpacity>

            <Text style={[styles.pickerLabel, { color: dc.textSecondary }]}>
              {t('reminders.reminderTime')}
            </Text>
            <TouchableOpacity
              style={[styles.pickerButton, { backgroundColor: dc.surface, borderColor: dc.border }]}
              onPress={() => { setShowTimePicker(prev => !prev); setShowDatePicker(false); }}
            >
              <Ionicons name="time-outline" size={20} color={dc.primary} />
              <Text style={[styles.pickerText, { color: dc.textPrimary }]}>
                {formatTime(selectedDate)}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={dc.textSecondary} />
            </TouchableOpacity>

            {showDatePicker && (
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                minimumDate={new Date()}
                textColor={dc.textPrimary}
                themeVariant={isDark ? 'dark' : 'light'}
                onChange={(_, date) => {
                  if (Platform.OS === 'android') setShowDatePicker(false);
                  if (date) {
                    const updated = new Date(selectedDate);
                    updated.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
                    setSelectedDate(updated);
                  }
                }}
              />
            )}

            {showTimePicker && (
              <DateTimePicker
                value={selectedDate}
                mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                is24Hour={i18n.language !== 'en'}
                textColor={dc.textPrimary}
                themeVariant={isDark ? 'dark' : 'light'}
                onChange={(_, time) => {
                  if (Platform.OS === 'android') setShowTimePicker(false);
                  if (time) {
                    const updated = new Date(selectedDate);
                    updated.setHours(time.getHours(), time.getMinutes());
                    setSelectedDate(updated);
                  }
                }}
              />
            )}

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
                disabled={!description.trim() || saving}
                style={styles.saveButton}
                buttonColor={dc.primary}
                textColor="#FFFFFF"
              >
                {t('reminders.save')}
              </Button>
            </View>
          </ScrollView>
        </View>
      </Animated.View>
    </Modal>
  );
};

interface RemindersScreenProps {
  modalVisible?: boolean;
  onModalDismiss?: () => void;
}

const RemindersScreen = ({ modalVisible = false, onModalDismiss }: RemindersScreenProps) => {
  const { t } = useTranslation();
  const { colors: dc } = useTheme();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const uid = auth().currentUser?.uid ?? 'guest';
  const STORAGE_KEY = `@moflo_reminders_${uid}`;

  const {
    sharedAccount, incomingRequests,
    approveJoinRequest, rejectJoinRequest,
  } = useSharedAccountStore();
  const currentUid = auth().currentUser?.uid;
  const isCreator = !!sharedAccount && sharedAccount.createdBy === currentUid;
  const visibleRequests = isCreator
    ? incomingRequests.filter(r => r.status === 'pending')
    : [];

  const handleApproveRequest = (rUid: string, name: string) => {
    Alert.alert(
      t('sharedAccount.approveConfirmTitle'),
      t('sharedAccount.approveConfirmBody', { name }),
      [
        { text: t('reminders.cancel'), style: 'cancel' },
        {
          text: t('sharedAccount.approve'),
          onPress: () => { approveJoinRequest(rUid).catch(() => {}); },
        },
      ]
    );
  };

  const handleRejectRequest = (rUid: string, name: string) => {
    Alert.alert(
      t('sharedAccount.rejectConfirmTitle'),
      t('sharedAccount.rejectConfirmBody', { name }),
      [
        { text: t('reminders.cancel'), style: 'cancel' },
        {
          text: t('sharedAccount.reject'),
          style: 'destructive',
          onPress: () => { rejectJoinRequest(rUid).catch(() => {}); },
        },
      ]
    );
  };

  useEffect(() => {
    loadReminders();
    requestPermissions();
  }, []);

  const requestPermissions = async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('reminders.permissionDenied'), t('reminders.permissionDeniedMessage'));
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

  const handleAddReminder = async (data: Omit<Reminder, 'id' | 'createdAt' | 'notificationId'>) => {
    const date = new Date(data.date);
    let notificationId = '';
    try {
      notificationId = await Notifications.scheduleNotificationAsync({
        content: { title: `🔔 MoFlo`, body: data.title, sound: true },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date,
        },
      });
    } catch (e) {
      console.error('Notification error:', e);
    }

    const newReminder: Reminder = {
      id: Date.now().toString(),
      ...data, notificationId,
      createdAt: new Date().toISOString(),
    };

    await saveReminders([newReminder, ...reminders]);
    Alert.alert(
      t('reminders.scheduled'),
      t('reminders.scheduledMessage', {
        date: formatDate(date),
        time: formatTime(date),
      })
    );
  };

  const handleDeleteReminder = async (id: string) => {
    const reminder = reminders.find((r) => r.id === id);
    if (reminder?.notificationId) {
      await Notifications.cancelScheduledNotificationAsync(reminder.notificationId);
    }
    await saveReminders(reminders.filter((r) => r.id !== id));
  };

  const sortedReminders = [...reminders].sort((a, b) => {
    const aFuture = new Date(a.date) > new Date();
    const bFuture = new Date(b.date) > new Date();
    if (aFuture && !bFuture) return -1;
    if (!aFuture && bFuture) return 1;
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });

  return (
    <View style={[styles.container, { backgroundColor: dc.background }]}>
      <AppHeader title={t('header.reminders')} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {visibleRequests.length > 0 && (
          <>
            <Text style={[styles.requestsLabel, { color: dc.textSecondary }]}>
              {t('sharedAccount.pendingRequests')} ({visibleRequests.length})
            </Text>
            <View style={[styles.requestsCard, { backgroundColor: dc.surface, borderColor: dc.border }]}>
              {visibleRequests.map((req, idx) => (
                <View key={req.uid}>
                  <View style={styles.requestRow}>
                    <View style={[styles.requestAvatar, { backgroundColor: dc.savings + '20' }]}>
                      <Text style={[styles.requestInitial, { color: dc.savings }]}>
                        {req.displayName[0]?.toUpperCase() ?? '?'}
                      </Text>
                    </View>
                    <View style={styles.requestInfo}>
                      <Text style={[styles.requestName, { color: dc.textPrimary }]}>
                        {req.displayName}
                      </Text>
                      <Text style={[styles.requestRole, { color: dc.textSecondary }]}>
                        {t('sharedAccount.wantsToJoin')}
                        {sharedAccount ? ` · ${sharedAccount.name}` : ''}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.requestActions}>
                    <TouchableOpacity
                      style={[styles.requestBtn, { backgroundColor: colors.expense + '15' }]}
                      onPress={() => handleRejectRequest(req.uid, req.displayName)}
                    >
                      <Ionicons name="close" size={16} color={colors.expense} />
                      <Text style={[styles.requestBtnText, { color: colors.expense }]}>
                        {t('sharedAccount.reject')}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.requestBtn, { backgroundColor: colors.income + '15' }]}
                      onPress={() => handleApproveRequest(req.uid, req.displayName)}
                    >
                      <Ionicons name="checkmark" size={16} color={colors.income} />
                      <Text style={[styles.requestBtnText, { color: colors.income }]}>
                        {t('sharedAccount.approve')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {idx < visibleRequests.length - 1 && (
                    <View style={[styles.requestDivider, { backgroundColor: dc.border }]} />
                  )}
                </View>
              ))}
            </View>
          </>
        )}

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
            <ReminderCard key={reminder.id} reminder={reminder} onDelete={handleDeleteReminder} />
          ))
        )}
      </ScrollView>

      <AddReminderModal
        visible={modalVisible}
        onDismiss={() => onModalDismiss?.()}
        onSave={handleAddReminder}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 100 },
  card: {
    borderRadius: 16, marginBottom: 10,
    borderWidth: 0.5, borderLeftWidth: 4, overflow: 'hidden',
  },
  cardContent: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  cardIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 15, fontFamily: 'Poppins_600SemiBold', marginBottom: 4 },
  cardDate: { fontSize: 12, fontFamily: 'Poppins_500Medium' },
  deleteButton: { padding: 4 },
  emptyState: { alignItems: 'center', paddingVertical: 80 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyText: { fontSize: 18, fontFamily: 'Poppins_600SemiBold', marginBottom: 8 },
  emptySubtext: { fontSize: 13, fontFamily: 'Poppins_400Regular', textAlign: 'center', paddingHorizontal: 32 },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '90%' },
  handleBar: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 22, fontFamily: 'Poppins_700Bold', marginBottom: 20 },
  input: { marginBottom: 16 },
  pickerLabel: { fontSize: 13, fontFamily: 'Poppins_500Medium', marginBottom: 8 },
  pickerButton: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 12, borderWidth: 0.5, padding: 14, marginBottom: 16,
  },
  pickerText: { flex: 1, fontSize: 15, fontFamily: 'Poppins_500Medium' },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelButton: { flex: 1 },
  saveButton: { flex: 2 },

  // Pending join requests
  requestsLabel: {
    fontSize: 12, fontFamily: 'Poppins_600SemiBold',
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: 8, marginLeft: 4,
  },
  requestsCard: {
    borderRadius: 16, marginBottom: 20,
    overflow: 'hidden', borderWidth: 0.5,
  },
  requestRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  requestAvatar: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  requestInitial: { fontSize: 18, fontFamily: 'Poppins_700Bold' },
  requestInfo: { flex: 1 },
  requestName: { fontSize: 15, fontFamily: 'Poppins_500Medium' },
  requestRole: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 2 },
  requestActions: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 14 },
  requestBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6, padding: 10, borderRadius: 10,
  },
  requestBtnText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
  requestDivider: { height: 0.5 },
});

export default RemindersScreen;