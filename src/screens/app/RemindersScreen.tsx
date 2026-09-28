import React, { useState, useEffect, useCallback, memo } from 'react';
import {
  View, StyleSheet, TouchableOpacity, Alert, Platform, Keyboard, Switch,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '../../hooks/useTheme';
import { Reminder } from '../../types';
import i18n from '../../i18n';
import auth from '@react-native-firebase/auth';
import { useSharedAccountStore } from '../../store/sharedAccountStore';
import { useReminderStore } from '../../store/reminderStore';
import SwipeableRow, { closeOpenSwipeable } from '../../components/common/SwipeableRow';
import MemberName from '../../components/common/MemberName';
import BottomSheet, { SheetButton, FilledInput } from '../../components/common/BottomSheet';
import { HeroScrollScreen } from '../../components/layout/HeroScreen';
import { HeroTitleBar } from '../../components/layout/HeroBar';
import { GroupHeader } from '../../components/layout/SheetSection';
import { getMemberLabel } from '../../utils/memberLabel';
import { withAlpha } from '../../utils/color';
import { lightHaptic, warningHaptic } from '../../utils/haptics';
import { formatDate as formatAppDate } from '../../utils/dateFormat';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// El mismo formato que el resto de la app: respeta el ajuste DD/MM o MM/DD
// (y el de la cuenta compartida). Antes solo distinguía inglés y español.
const formatDate = (date: Date): string => formatAppDate(date.toISOString());

const formatTime = (date: Date): string => {
  if (i18n.language === 'en') {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
};

const ReminderCardBase = ({
  reminder, onDelete, onEdit, creatorName, creatorIsFormer = false,
}: {
  reminder: Reminder;
  onDelete: (id: string) => void;
  onEdit: (reminder: Reminder) => void;
  creatorName?: string;
  // Por separado y no como objeto, para que memo siga evitando renders
  creatorIsFormer?: boolean;
}) => {
  const { t } = useTranslation();
  const { colors: dc, ui } = useTheme();
  const handleDelete = () => {
    warningHaptic();
    Alert.alert(
      t('reminders.deleteConfirm'),
      reminder.title,
      [
        { text: t('reminders.cancel'), style: 'cancel' },
        { text: 'OK', style: 'destructive', onPress: () => onDelete(reminder.id) },
      ]
    );
  };

  // Sin fecha = nota: nunca se marca como pasada
  const isNote = !reminder.date;
  const date = reminder.date ? new Date(reminder.date) : null;
  const isPast = !!date && date < new Date();
  const isUpcoming = !!date && !isPast;

  return (
    <SwipeableRow
      borderRadius={14}
      actions={[
        { icon: 'pencil', background: dc.primary, onPress: () => onEdit(reminder) },
        { icon: 'trash', background: ui.expenseText, onPress: handleDelete },
      ]}
    >
      {/* Con fondo propio: si no, los botones de detrás se verían sin deslizar */}
      <View style={[styles.row, { backgroundColor: ui.sheet }]}>
        <View style={[styles.rowIcon, { backgroundColor: isUpcoming ? ui.accentSoft : ui.fill }]}>
          <Ionicons
            name={isNote ? 'document-text-outline' : isPast ? 'notifications-off-outline' : 'notifications-outline'}
            size={20}
            color={isUpcoming ? ui.accent : dc.textSecondary}
          />
        </View>
        <View style={styles.rowInfo}>
          <Text
            style={[styles.rowTitle, { color: isPast ? dc.textSecondary : dc.textPrimary }]}
            numberOfLines={3}
          >
            {reminder.title}
          </Text>
          {!!creatorName && (
            <View style={styles.rowCreator}>
              <Ionicons name="person-outline" size={12} color={dc.textSecondary} />
              <Text style={[styles.rowSub, { color: dc.textSecondary }]} numberOfLines={1}>
                <MemberName member={{ name: creatorName, isFormer: creatorIsFormer }} />
              </Text>
            </View>
          )}
        </View>
        {/* Las notas no llevan fecha: ahí la columna derecha no se dibuja */}
        {!!date && (
          <View style={styles.rowWhen}>
            <Text style={[styles.rowDate, { color: isUpcoming ? ui.accent : dc.textSecondary }]}>
              {formatDate(date)}
            </Text>
            <Text style={[styles.rowSub, { color: dc.textSecondary }]}>{formatTime(date)}</Text>
          </View>
        )}
      </View>
    </SwipeableRow>
  );
};

// Memoizada: cada fila monta un Swipeable con dos gestos nativos
const ReminderCard = memo(ReminderCardBase);

const AddReminderModal = ({
  visible, onDismiss, onSave, editingReminder,
}: {
  visible: boolean;
  onDismiss: () => void;
  onSave: (data: Omit<Reminder, 'id' | 'createdAt' | 'notificationId'>) => Promise<void>;
  editingReminder?: Reminder | null;
}) => {
  const { t } = useTranslation();
  const { isDark, colors: dc, ui } = useTheme();

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
  // Por defecto es una nota sin fecha; con el interruptor se añade fecha, hora y notificación
  const [withDate, setWithDate] = useState(false);

  const toggleWithDate = (value: boolean) => {
    Keyboard.dismiss();
    setWithDate(value);
    setShowDatePicker(false);
    setShowTimePicker(false);
    if (!value) return;
    setSelectedDate(getDefaultDate());
    // Con fecha hay notificación: comprobar permiso y avisar si está denegado
    Notifications.getPermissionsAsync()
      .then(({ status }) => (status === 'granted'
        ? status
        : Notifications.requestPermissionsAsync().then(r => r.status)))
      .then((status) => {
        if (status !== 'granted') {
          Alert.alert(t('reminders.permissionDenied'), t('reminders.permissionDeniedMessage'));
        } else {
          useReminderStore.getState().resyncSharedNotifications();
        }
      })
      .catch(() => {});
  };

  // Al abrir el teclado se cierran los selectores de fecha y hora. La ventana
  // ya sube sola con el teclado.
  useEffect(() => {
    if (!visible) return;
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const sub = Keyboard.addListener(showEvent, () => {
      setShowDatePicker(false);
      setShowTimePicker(false);
    });
    return () => sub.remove();
  }, [visible]);

  // Al abrir en modo edición se precargan los valores; una nota sin fecha
  // abre con el interruptor desactivado.
  useEffect(() => {
    if (!visible || !editingReminder) return;
    const hasDate = !!editingReminder.date;
    setDescription(editingReminder.title);
    setWithDate(hasDate);
    setSelectedDate(hasDate ? new Date(editingReminder.date!) : getDefaultDate());
    setShowDatePicker(false);
    setShowTimePicker(false);
  }, [visible, editingReminder]);

  const handleDismiss = () => {
    setDescription('');
    setSelectedDate(getDefaultDate());
    setWithDate(false);
    setShowDatePicker(false);
    setShowTimePicker(false);
    onDismiss();
  };

  const handleSave = async () => {
    if (!description.trim()) return;
    // El selector permite una hora ya pasada de hoy: se guardaría sin notificación
    if (withDate && selectedDate.getTime() <= Date.now()) {
      Alert.alert(t('reminders.pastDateError'));
      return;
    }
    setSaving(true);
    lightHaptic();
    try {
      await onSave({
        title: description.trim(),
        description: '',
        date: withDate ? selectedDate.toISOString() : undefined,
      });
      handleDismiss();
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={handleDismiss}
      title={editingReminder ? t('reminders.edit') : t('reminders.add')}
      footer={(
        <SheetButton
          label={t('reminders.save')}
          onPress={handleSave}
          loading={saving}
          disabled={!description.trim()}
        />
      )}
    >
      <FilledInput
        value={description}
        onChangeText={setDescription}
        placeholder={t('reminders.reminderDescription')}
        multiline
        style={styles.descriptionInput}
      />

      <View style={[styles.group, { backgroundColor: ui.field }]}>
        <TouchableOpacity
          style={styles.groupRow}
          onPress={() => toggleWithDate(!withDate)}
          activeOpacity={0.8}
        >
          <View style={[styles.groupIcon, { backgroundColor: withDate ? ui.accentSoft : ui.fill }]}>
            <Ionicons name="notifications-outline" size={18} color={withDate ? ui.accent : dc.textSecondary} />
          </View>
          <View style={styles.groupInfo}>
            <Text style={[styles.groupLabel, { color: dc.textPrimary }]}>{t('reminders.addDateTime')}</Text>
            <Text style={[styles.groupHint, { color: dc.textSecondary }]}>{t('reminders.addDateTimeHint')}</Text>
          </View>
          <Switch
            value={withDate}
            onValueChange={toggleWithDate}
            trackColor={{ false: dc.border, true: dc.primary }}
            thumbColor="#FFFFFF"
            ios_backgroundColor={dc.border}
          />
        </TouchableOpacity>

        {withDate && (
          <>
            <View style={[styles.groupDivider, { backgroundColor: ui.hair }]} />
            <TouchableOpacity
              style={styles.groupRow}
              onPress={() => { setShowDatePicker(prev => !prev); setShowTimePicker(false); }}
              activeOpacity={0.8}
            >
              <View style={[styles.groupIcon, { backgroundColor: ui.fill }]}>
                <Ionicons name="calendar-outline" size={18} color={dc.textSecondary} />
              </View>
              <Text style={[styles.groupLabel, styles.groupInfo, { color: dc.textPrimary }]}>
                {t('reminders.reminderDate')}
              </Text>
              <Text style={[styles.groupValue, { color: ui.accent }]}>{formatDate(selectedDate)}</Text>
            </TouchableOpacity>
            <View style={[styles.groupDivider, { backgroundColor: ui.hair }]} />
            <TouchableOpacity
              style={styles.groupRow}
              onPress={() => { setShowTimePicker(prev => !prev); setShowDatePicker(false); }}
              activeOpacity={0.8}
            >
              <View style={[styles.groupIcon, { backgroundColor: ui.fill }]}>
                <Ionicons name="time-outline" size={18} color={dc.textSecondary} />
              </View>
              <Text style={[styles.groupLabel, styles.groupInfo, { color: dc.textPrimary }]}>
                {t('reminders.reminderTime')}
              </Text>
              <Text style={[styles.groupValue, { color: ui.accent }]}>{formatTime(selectedDate)}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {withDate && showDatePicker && (
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

      {withDate && showTimePicker && (
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
    </BottomSheet>
  );
};

interface RemindersScreenProps {
  modalVisible?: boolean;
  onModalDismiss?: () => void;
}

const RemindersScreen = ({ modalVisible = false, onModalDismiss }: RemindersScreenProps) => {
  const { t } = useTranslation();
  const { colors: dc, ui } = useTheme();
  const navigation = useNavigation<any>();
  const {
    reminders: individualReminders, sharedReminders,
    loadIndividualReminders, addReminder, updateReminder, deleteReminder, subscribeToSharedReminders,
  } = useReminderStore();

  const {
    sharedAccount, incomingRequests, isSharedMode,
    approveJoinRequest, rejectJoinRequest,
  } = useSharedAccountStore();
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const currentUid = auth().currentUser?.uid;
  // En cuenta compartida se muestran los recordatorios de todos los miembros
  const inSharedAccount = isSharedMode && !!sharedAccount;
  const reminders = inSharedAccount ? sharedReminders : individualReminders;
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
    warningHaptic();
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
    loadIndividualReminders();
    requestPermissions();
  }, [currentUid, loadIndividualReminders]);

  useEffect(() => {
    if (sharedAccount?.id) subscribeToSharedReminders(sharedAccount.id);
  }, [sharedAccount?.id, subscribeToSharedReminders]);

  // Solo se pregunta la primera vez: las notas no necesitan permiso y no se insiste
  // en cada apertura (el aviso de permiso denegado sale al activar "Añadir fecha y hora")
  const requestPermissions = async () => {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      if (status === 'undetermined') await Notifications.requestPermissionsAsync();
    } catch {}
    // Si el permiso se concedió después (aquí o en los ajustes del móvil),
    // programar los recordatorios compartidos que ya habían llegado
    useReminderStore.getState().resyncSharedNotifications();
  };

  const handleAddReminder = async (data: Omit<Reminder, 'id' | 'createdAt' | 'notificationId'>) => {
    await addReminder(data);
    // Las notas no programan notificación: no hace falta avisar
    if (!data.date) return;
    // Sin permiso no se programa nada (el aviso de permiso ya salió al activar la fecha)
    try {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') return;
    } catch {
      return;
    }
    const date = new Date(data.date);
    // Esperar a que el modal termine de cerrarse: en iOS un Alert presentado sobre
    // un Modal que se está cerrando puede no llegar a mostrarse
    setTimeout(() => {
      Alert.alert(
        t('reminders.scheduled'),
        t('reminders.scheduledMessage', {
          date: formatDate(date),
          time: formatTime(date),
        })
      );
    }, 450);
  };

  const handleEditReminder = useCallback((reminder: Reminder) => {
    setEditingReminder(reminder);
  }, []);

  // El modal es el mismo para crear y editar: se decide aquí según el estado
  const handleSaveReminder = async (data: Omit<Reminder, 'id' | 'createdAt' | 'notificationId'>) => {
    if (editingReminder) {
      await updateReminder(editingReminder.id, data);
      return;
    }
    await handleAddReminder(data);
  };

  const handleDeleteReminder = useCallback((id: string) => {
    deleteReminder(id).catch((e) => console.error('Error deleting reminder:', e));
  }, [deleteReminder]);

  // Grupos: recordatorios próximos (el más cercano primero) → notas (más
  // recientes primero) → recordatorios pasados
  const nowTs = Date.now();
  const byDate = (a: Reminder, b: Reminder) => new Date(a.date!).getTime() - new Date(b.date!).getTime();
  const upcoming = reminders.filter(r => !!r.date && new Date(r.date).getTime() > nowTs).sort(byDate);
  const notes = reminders.filter(r => !r.date)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const past = reminders.filter(r => !!r.date && new Date(r.date).getTime() <= nowTs).sort(byDate);
  const groups = [
    { key: 'upcoming', label: t('reminders.upcoming'), items: upcoming },
    { key: 'notes', label: t('reminders.notes'), items: notes },
    { key: 'past', label: t('reminders.past'), items: past },
  ].filter(g => g.items.length > 0);

  const next = upcoming[0];
  const nextDate = next?.date ? new Date(next.date) : null;

  const hero = (
    <>
      <HeroTitleBar title={t('header.reminders')} onBack={() => navigation.navigate('HomeTab')} settings />
      {next && nextDate && (
        <View style={styles.heroBody}>
          <Text style={[styles.heroLabel, { color: ui.onHeroSoft }]}>{t('reminders.nextLabel')}</Text>
          <Text style={[styles.heroTitle, { color: ui.onHero }]} numberOfLines={2}>{next.title}</Text>
          <View style={styles.heroPill}>
            <Ionicons name="notifications-outline" size={14} color={ui.onHero} />
            <Text style={[styles.heroPillText, { color: ui.onHero }]}>
              {formatDate(nextDate)} · {formatTime(nextDate)}
            </Text>
          </View>
        </View>
      )}
    </>
  );

  return (
    <View
      style={styles.container}
      // Cualquier toque de la pantalla cierra la fila deslizada. Devuelve false,
      // así que no se queda con el gesto y el toque llega igual a su destino.
      onStartShouldSetResponderCapture={closeOpenSwipeable}
    >
      <HeroScrollScreen hero={hero} onScrollBeginDrag={closeOpenSwipeable}>
        {visibleRequests.length > 0 && (
          <View style={styles.requestsWrap}>
            <GroupHeader label={`${t('sharedAccount.pendingRequests')} (${visibleRequests.length})`} first />
            <View style={[styles.requestsCard, { backgroundColor: ui.field }]}>
              {visibleRequests.map((req, idx) => (
                <View key={req.uid}>
                  <View style={styles.requestRow}>
                    <View style={[styles.requestAvatar, { backgroundColor: withAlpha(ui.savingsText, 0.15) }]}>
                      <Text style={[styles.requestInitial, { color: ui.savingsText }]}>
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
                      style={[styles.requestBtn, { backgroundColor: ui.expenseSoft }]}
                      onPress={() => handleRejectRequest(req.uid, req.displayName)}
                    >
                      <Ionicons name="close" size={16} color={ui.expenseText} />
                      <Text style={[styles.requestBtnText, { color: ui.expenseText }]}>
                        {t('sharedAccount.reject')}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.requestBtn, { backgroundColor: withAlpha(ui.incomeText, 0.14) }]}
                      onPress={() => handleApproveRequest(req.uid, req.displayName)}
                    >
                      <Ionicons name="checkmark" size={16} color={ui.incomeText} />
                      <Text style={[styles.requestBtnText, { color: ui.incomeText }]}>
                        {t('sharedAccount.approve')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {idx < visibleRequests.length - 1 && (
                    <View style={[styles.requestDivider, { backgroundColor: ui.hair }]} />
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        {groups.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: ui.accentSoft }]}>
              <Ionicons name="notifications-outline" size={30} color={ui.accent} />
            </View>
            <Text style={[styles.emptyText, { color: dc.textPrimary }]}>
              {t('reminders.noReminders')}
            </Text>
            <Text style={[styles.emptySubtext, { color: dc.textSecondary }]}>
              {t('reminders.noRemindersSubtitle')}
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {groups.map((group, gi) => (
              <View key={group.key}>
                <GroupHeader label={group.label} first={gi === 0 && visibleRequests.length === 0} />
                {group.items.map((reminder) => {
                  // Tachado si quien lo creó ya no está en la cuenta
                  const creator = inSharedAccount
                    ? getMemberLabel(sharedAccount, reminder.createdBy, t('sharedAccount.formerMember'))
                    : undefined;
                  return (
                    <ReminderCard
                      key={reminder.id}
                      reminder={reminder}
                      onDelete={handleDeleteReminder}
                      onEdit={handleEditReminder}
                      creatorName={creator?.name}
                      creatorIsFormer={creator?.isFormer}
                    />
                  );
                })}
              </View>
            ))}
          </View>
        )}
      </HeroScrollScreen>

      <AddReminderModal
        visible={modalVisible || !!editingReminder}
        onDismiss={() => {
          setEditingReminder(null);
          onModalDismiss?.();
        }}
        onSave={handleSaveReminder}
        editingReminder={editingReminder}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },

  heroBody: { paddingHorizontal: 20, paddingTop: 12 },
  heroLabel: { fontSize: 13, fontFamily: 'Poppins_400Regular' },
  heroTitle: { fontSize: 24, fontFamily: 'Poppins_700Bold', letterSpacing: -0.5, marginTop: 2 },
  heroPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5,
  },
  heroPillText: { fontSize: 12.5, fontFamily: 'Poppins_500Medium' },

  list: { paddingHorizontal: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderRadius: 14 },
  rowIcon: { width: 42, height: 42, borderRadius: 14, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  rowInfo: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, fontFamily: 'Poppins_500Medium' },
  rowCreator: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  rowSub: { fontSize: 12.5, fontFamily: 'Poppins_400Regular' },
  rowWhen: { alignItems: 'flex-end', flexShrink: 0 },
  rowDate: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },

  emptyState: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  emptyText: { fontSize: 17, fontFamily: 'Poppins_600SemiBold', marginBottom: 6, textAlign: 'center' },
  emptySubtext: { fontSize: 13, fontFamily: 'Poppins_400Regular', textAlign: 'center' },

  descriptionInput: { fontSize: 17, minHeight: 56, textAlignVertical: 'top' },
  group: { borderRadius: 16, marginTop: 14, overflow: 'hidden' },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  groupIcon: { width: 34, height: 34, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  groupInfo: { flex: 1, minWidth: 0 },
  groupLabel: { fontSize: 15, fontFamily: 'Poppins_500Medium' },
  groupHint: { fontSize: 11.5, fontFamily: 'Poppins_400Regular', marginTop: 1 },
  groupValue: { fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  groupDivider: { height: StyleSheet.hairlineWidth, marginLeft: 60 },

  // Solicitudes pendientes para unirse a la cuenta compartida
  requestsWrap: { paddingHorizontal: 20, marginBottom: 6 },
  requestsCard: { borderRadius: 18, overflow: 'hidden', marginTop: 6 },
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
  requestDivider: { height: StyleSheet.hairlineWidth },
});

export default RemindersScreen;
