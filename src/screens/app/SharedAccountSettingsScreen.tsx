import React, { useState } from 'react';
import {
  View, StyleSheet, ScrollView,
  TouchableOpacity, Alert, Share, Clipboard, Switch,
} from 'react-native';
import { Text, Button } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import auth from '@react-native-firebase/auth';
import { useSharedAccountStore } from '../../store/sharedAccountStore';
import { useMovementStore } from '../../store/movementStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useTheme } from '../../hooks/useTheme';
import { colors } from '../../theme';
import AppHeader from '../../components/common/AppHeader';
import { exportMovementsToCSV } from '../../services/export.service';

const SharedAccountSettingsScreen = () => {
  const { t } = useTranslation();
  const { colors: dc } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const uid = auth().currentUser?.uid;

  const {
    sharedAccount, notificationsEnabled,
    setNotificationsEnabled, leaveSharedAccount,
    deleteSharedAccount, setSharedMode, getInviteLink,
  } = useSharedAccountStore();
  const { loadData, movements } = useMovementStore();

  const [linkCopied, setLinkCopied] = useState(false);

  if (!sharedAccount) {
    navigation.goBack();
    return null;
  }

  const isCreator = sharedAccount.createdBy === uid;

  const handleCopyLink = () => {
    Clipboard.setString(getInviteLink());
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const handleShareLink = async () => {
    await Share.share({
      message: `${t('sharedAccount.inviteInfo')}\n\n${getInviteLink()}`,
      title: `MoFlo — ${sharedAccount.name}`,
    });
  };

  const handleLeave = () => {
    Alert.alert(
      t('sharedAccount.leaveAccount'),
      t('sharedAccount.leaveConfirm'),
      [
        { text: t('movements.cancel'), style: 'cancel' },
        {
          text: t('sharedAccount.leaveAccount'),
          style: 'destructive',
          onPress: async () => {
            await leaveSharedAccount();
            await loadData();
            await setSharedMode(false);
            navigation.navigate('HomeTab');
          },
        },
      ]
    );
  };

  const handleDelete = () => {
    Alert.alert(
      t('sharedAccount.deleteAccount'),
      t('sharedAccount.deleteWarning'),
      [
        { text: t('movements.cancel'), style: 'cancel' },
        {
          text: t('sharedAccount.exportFirst'),
          onPress: async () => {
            try {
              await exportMovementsToCSV(movements, t);
            } catch (e) {}
            confirmDelete();
          },
        },
        {
          text: t('sharedAccount.deleteAnyway'),
          style: 'destructive',
          onPress: confirmDelete,
        },
      ]
    );
  };

  const confirmDelete = () => {
    Alert.alert(
      t('sharedAccount.deleteAccount'),
      t('sharedAccount.deleteConfirm'),
      [
        { text: t('movements.cancel'), style: 'cancel' },
        {
          text: t('sharedAccount.deleteAccount'),
          style: 'destructive',
          onPress: async () => {
            await deleteSharedAccount();
            await loadData();
            await setSharedMode(false);
            navigation.navigate('HomeTab');
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: dc.background }]}>
      <AppHeader title={t('sharedAccount.settings')} showBell={false} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* NOMBRE */}
        <View style={[styles.accountCard, { backgroundColor: colors.primary }]}>
          <Text style={styles.accountEmoji}>👥</Text>
          <Text style={styles.accountName}>{sharedAccount.name}</Text>
          <Text style={styles.accountCode}>
            {t('sharedAccount.code')}: {sharedAccount.inviteCode}
          </Text>
        </View>

        {/* ENLACE INVITACIÓN */}
        <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
          {t('sharedAccount.inviteLink')}
        </Text>
        <View style={[styles.card, { backgroundColor: dc.surface, borderColor: dc.border }]}>
          <Text style={[styles.inviteInfo, { color: dc.textSecondary }]}>
            {t('sharedAccount.inviteInfo')}
          </Text>
          <Text style={[styles.linkText, { color: dc.textPrimary }]} numberOfLines={2}>
            {getInviteLink()}
          </Text>
          <View style={styles.linkButtons}>
            <TouchableOpacity
              style={[styles.linkBtn, { backgroundColor: linkCopied ? colors.income + '20' : dc.background }]}
              onPress={handleCopyLink}
            >
              <Ionicons
                name={linkCopied ? 'checkmark-circle' : 'copy-outline'}
                size={16}
                color={linkCopied ? colors.income : colors.primary}
              />
              <Text style={[styles.linkBtnText, { color: linkCopied ? colors.income : colors.primary }]}>
                {linkCopied ? t('sharedAccount.linkCopied') : t('sharedAccount.copyLink')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.linkBtn, { backgroundColor: dc.background }]}
              onPress={handleShareLink}
            >
              <Ionicons name="share-social-outline" size={16} color={colors.primary} />
              <Text style={[styles.linkBtnText, { color: colors.primary }]}>
                {t('sharedAccount.shareLink')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* MIEMBROS */}
        <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
          {t('sharedAccount.members')} ({sharedAccount.members.length})
        </Text>
        <View style={[styles.card, { backgroundColor: dc.surface, borderColor: dc.border }]}>
          {sharedAccount.members.map((memberId, index) => {
            const name = sharedAccount.memberNames[memberId] ?? 'Usuario';
            const isMe = memberId === uid;
            const isMemberCreator = memberId === sharedAccount.createdBy;
            return (
              <View key={memberId}>
                <View style={styles.memberRow}>
                  <View style={[styles.memberAvatar, { backgroundColor: colors.primary + '20' }]}>
                    <Text style={[styles.memberInitial, { color: colors.primary }]}>
                      {name[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.memberInfo}>
                    <Text style={[styles.memberName, { color: dc.textPrimary }]}>
                      {name}{isMe ? ` ${t('sharedAccount.you')}` : ''}
                    </Text>
                    {isMemberCreator && (
                      <Text style={[styles.memberRole, { color: dc.textSecondary }]}>
                        {t('sharedAccount.creator')}
                      </Text>
                    )}
                  </View>
                </View>
                {index < sharedAccount.members.length - 1 && (
                  <View style={[styles.divider, { backgroundColor: dc.border }]} />
                )}
              </View>
            );
          })}
        </View>

        {/* NOTIFICACIONES */}
        <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
          {t('settings.notifications')}
        </Text>
        <View style={[styles.card, { backgroundColor: dc.surface, borderColor: dc.border }]}>
          <View style={styles.notifRow}>
            <View style={[styles.notifIcon, { backgroundColor: colors.primary + '20' }]}>
              <Ionicons name="notifications-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.notifInfo}>
              <Text style={[styles.notifTitle, { color: dc.textPrimary }]}>
                {t('sharedAccount.notifTitle')}
              </Text>
              <Text style={[styles.notifSubtitle, { color: dc.textSecondary }]}>
                {t('sharedAccount.notifSubtitle')}
              </Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: dc.border, true: colors.primary + '80' }}
              thumbColor={notificationsEnabled ? colors.primary : dc.textSecondary}
            />
          </View>
        </View>

        {/* PELIGRO */}
        <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
          {t('settings.accountSection') ?? 'Cuenta'}
        </Text>
        <View style={[styles.card, { backgroundColor: dc.surface, borderColor: dc.border }]}>
          {!isCreator && (
            <TouchableOpacity style={styles.dangerRow} onPress={handleLeave}>
              <View style={[styles.dangerIcon, { backgroundColor: colors.expense + '20' }]}>
                <Ionicons name="exit-outline" size={20} color={colors.expense} />
              </View>
              <Text style={[styles.dangerText, { color: colors.expense }]}>
                {t('sharedAccount.leaveAccount')}
              </Text>
            </TouchableOpacity>
          )}
          {isCreator && (
            <TouchableOpacity style={styles.dangerRow} onPress={handleDelete}>
              <View style={[styles.dangerIcon, { backgroundColor: colors.expense + '20' }]}>
                <Ionicons name="trash-outline" size={20} color={colors.expense} />
              </View>
              <Text style={[styles.dangerText, { color: colors.expense }]}>
                {t('sharedAccount.deleteAccount')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  accountCard: {
    borderRadius: 20, padding: 24,
    alignItems: 'center', marginBottom: 24, elevation: 4,
  },
  accountEmoji: { fontSize: 36, marginBottom: 8 },
  accountName: { fontSize: 20, fontFamily: 'Poppins_700Bold', color: '#FFFFFF', marginBottom: 4 },
  accountCode: { fontSize: 12, fontFamily: 'Poppins_500Medium', color: 'rgba(255,255,255,0.7)' },
  sectionLabel: {
    fontSize: 12, fontFamily: 'Poppins_600SemiBold',
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: 8, marginLeft: 4,
  },
  card: { borderRadius: 16, marginBottom: 20, overflow: 'hidden', borderWidth: 0.5, padding: 16 },
  inviteInfo: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginBottom: 8 },
  linkText: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginBottom: 12, lineHeight: 18 },
  linkButtons: { flexDirection: 'row', gap: 8 },
  linkBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6, padding: 10, borderRadius: 10,
  },
  linkBtnText: { fontSize: 12, fontFamily: 'Poppins_600SemiBold' },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 12 },
  memberAvatar: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
  },
  memberInitial: { fontSize: 18, fontFamily: 'Poppins_700Bold' },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 15, fontFamily: 'Poppins_500Medium' },
  memberRole: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 2 },
  divider: { height: 0.5, marginLeft: 52 },
  notifRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  notifIcon: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  notifInfo: { flex: 1 },
  notifTitle: { fontSize: 15, fontFamily: 'Poppins_500Medium' },
  notifSubtitle: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 2 },
  dangerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  dangerIcon: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
  },
  dangerText: { fontSize: 15, fontFamily: 'Poppins_500Medium' },
});

export default SharedAccountSettingsScreen;