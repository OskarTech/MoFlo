import React, { useState, useEffect } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Share, Clipboard, Switch, Modal, FlatList,
} from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { useSharedAccountStore } from '../../store/sharedAccountStore';
import { useMovementStore } from '../../store/movementStore';
import { useSavingsStore } from '../../store/savingsStore';
import { useTheme } from '../../hooks/useTheme';
import { colors, COLOR_PALETTES, ColorPaletteId } from '../../theme';
import { CURRENCIES } from '../../store/settingsStore';
import AppHeader from '../../components/common/AppHeader';
import ColorPaletteModal from '../../components/common/ColorPaletteModal';
import { exportMovementsToCSV } from '../../services/export.service';

const SelectModal = ({
  visible, title, options, selectedValue, onSelect, onDismiss,
}: {
  visible: boolean; title: string;
  options: { code: string; label: string }[];
  selectedValue: string;
  onSelect: (code: string) => void;
  onDismiss: () => void;
}) => {
  const { colors: dc } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onDismiss} />
        <View style={[styles.modalSheet, {
          backgroundColor: dc.surface,
        }]}>
          <View style={[styles.modalHandle, { backgroundColor: dc.border }]} />
          <Text style={[styles.modalTitle, { color: dc.textPrimary }]}>{title}</Text>
          <FlatList
            data={options}
            keyExtractor={item => item.code}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.modalOption, { borderBottomColor: dc.border }]}
                onPress={() => { onSelect(item.code); onDismiss(); }}
              >
                <Text style={[
                  styles.modalOptionText, { color: dc.textPrimary },
                  item.code === selectedValue && {
                    color: dc.primary,
                    fontFamily: 'Poppins_600SemiBold',
                  },
                ]}>
                  {item.label}
                </Text>
                {item.code === selectedValue && (
                  <Ionicons name="checkmark" size={20} color={dc.primary} />
                )}
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );
};

const SharedAccountSettingsScreen = () => {
  const { t } = useTranslation();
  const { colors: dc, isDark } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const uid = auth().currentUser?.uid;

  const {
    sharedAccount, notificationsEnabled,
    setNotificationsEnabled, leaveSharedAccount,
    deleteSharedAccount, setSharedMode, getInviteLink,
    sharedCurrencyCode, sharedColorPalette, saveSharedSettings,
  } = useSharedAccountStore();
  const { loadData, movements } = useMovementStore();
  const { huchas } = useSavingsStore();

  const [linkCopied, setLinkCopied] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState(sharedAccount?.name ?? '');
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const [showColorPaletteModal, setShowColorPaletteModal] = useState(false);

  const selectedPaletteId = (sharedColorPalette ?? 'blue') as ColorPaletteId;
  const selectedPaletteColor = COLOR_PALETTES[selectedPaletteId].primary;

  useEffect(() => {
    if (!sharedAccount) {
      navigation.goBack();
    }
  }, [sharedAccount]);

  if (!sharedAccount) return null;

  const isCreator = sharedAccount.createdBy === uid;
  const selectedCurrencyLabel =
    CURRENCIES.find(c => c.code === sharedCurrencyCode)?.label ?? 'Euro (€)';

  const handleRenameAccount = async () => {
    if (!newName.trim()) return;
    try {
      await firestore()
        .collection('sharedAccounts')
        .doc(sharedAccount.id)
        .update({ name: newName.trim() });
      useSharedAccountStore.setState({
        sharedAccount: { ...sharedAccount, name: newName.trim() },
      });
      setEditingName(false);
      Alert.alert('✅', t('sharedAccount.renameSuccess'));
    } catch (e) {
      Alert.alert('Error', t('sharedAccount.renameError'));
    }
  };

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

  const handleExportCSV = async () => {
    try {
      await exportMovementsToCSV(movements, huchas, t);
    } catch (e) {
      Alert.alert('Error', t('export.error'));
    }
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
            try { await exportMovementsToCSV(movements, huchas, t); } catch (e) {}
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
        keyboardShouldPersistTaps="handled"
      >
        {/* NOMBRE */}
        <View style={[styles.accountCard, { backgroundColor: dc.primary }]}>
          <Text style={styles.accountEmoji}>👥</Text>
          {editingName && isCreator ? (
            <View style={styles.renameRow}>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                mode="flat"
                style={[styles.renameInput, { backgroundColor: 'transparent' }]}
                textColor="#FFFFFF"
                underlineColor="rgba(255,255,255,0.5)"
                activeUnderlineColor="#FFFFFF"
                autoFocus
                onSubmitEditing={handleRenameAccount}
              />
              <TouchableOpacity onPress={handleRenameAccount} style={styles.renameConfirm}>
                <Ionicons name="checkmark-circle" size={28} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => {
                setEditingName(false);
                setNewName(sharedAccount.name);
              }}>
                <Ionicons name="close-circle" size={28} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.nameRow}
              onPress={() => isCreator && setEditingName(true)}
              activeOpacity={isCreator ? 0.7 : 1}
            >
              <Text style={styles.accountName}>{sharedAccount.name}</Text>
              {isCreator && (
                <Ionicons name="pencil-outline" size={16} color="rgba(255,255,255,0.7)" />
              )}
            </TouchableOpacity>
          )}
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
              style={[styles.linkBtn, {
                backgroundColor: linkCopied ? colors.income + '20' : dc.background,
              }]}
              onPress={handleCopyLink}
            >
              <Ionicons
                name={linkCopied ? 'checkmark-circle' : 'copy-outline'}
                size={16}
                color={linkCopied ? colors.income : dc.primary}
              />
              <Text style={[styles.linkBtnText, {
                color: linkCopied ? colors.income : dc.primary,
              }]}>
                {linkCopied ? t('sharedAccount.linkCopied') : t('sharedAccount.copyLink')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.linkBtn, { backgroundColor: dc.background }]}
              onPress={handleShareLink}
            >
              <Ionicons name="share-social-outline" size={16} color={dc.primary} />
              <Text style={[styles.linkBtnText, { color: dc.primary }]}>
                {t('sharedAccount.shareLink')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* MIEMBROS */}
        <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
          {t('sharedAccount.members')} ({sharedAccount.members.length})
        </Text>
        <View style={[styles.membersCard, { backgroundColor: dc.surface, borderColor: dc.border }]}>
          {sharedAccount.members.map((memberId, index) => {
            const name = sharedAccount.memberNames[memberId] ?? 'Usuario';
            const isMe = memberId === uid;
            const isMemberCreator = memberId === sharedAccount.createdBy;
            return (
              <View key={memberId}>
                <View style={styles.memberRow}>
                  <View style={[styles.memberAvatar, { backgroundColor: dc.primary + '20' }]}>
                    <Text style={[styles.memberInitial, { color: dc.primary }]}>
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

        {/* APARIENCIA */}
        <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
          {t('settings.colorPalette')}
        </Text>
        <View style={[styles.membersCard, { backgroundColor: dc.surface, borderColor: dc.border }]}>
          <TouchableOpacity
            style={styles.optionRow}
            onPress={() => setShowColorPaletteModal(true)}
          >
            <View style={[styles.optionIcon, { backgroundColor: dc.primary + '20' }]}>
              <Ionicons name="color-palette-outline" size={20} color={dc.primary} />
            </View>
            <View style={styles.optionContent}>
              <Text style={[styles.optionLabel, { color: dc.textPrimary }]}>
                {t('settings.colorPalette')}
              </Text>
            </View>
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: selectedPaletteColor, marginRight: 8 }} />
            <Ionicons name="chevron-forward" size={18} color={dc.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* MONEDA COMPARTIDA */}
        <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
          {t('sharedAccount.currency')}
        </Text>
        <View style={[styles.membersCard, { backgroundColor: dc.surface, borderColor: dc.border }]}>
          <TouchableOpacity
            style={styles.optionRow}
            onPress={() => setShowCurrencyModal(true)}
          >
            <View style={[styles.optionIcon, { backgroundColor: colors.income + '20' }]}>
              <Ionicons name="cash-outline" size={20} color={colors.income} />
            </View>
            <View style={styles.optionContent}>
              <Text style={[styles.optionLabel, { color: dc.textPrimary }]}>
                {t('settings.currency')}
              </Text>
            </View>
            <Text style={[styles.optionValue, { color: dc.textSecondary }]}>
              {selectedCurrencyLabel}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={dc.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* CATEGORÍAS Y EXPORTAR */}
        <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
          {t('categories.title')}
        </Text>
        <View style={[styles.membersCard, { backgroundColor: dc.surface, borderColor: dc.border }]}>
          <TouchableOpacity
            style={styles.optionRow}
            onPress={() => navigation.navigate('SharedCategories', { accountId: sharedAccount.id })}
          >
            <View style={[styles.optionIcon, { backgroundColor: colors.savings + '20' }]}>
              <Ionicons name="pricetag-outline" size={20} color={colors.savings} />
            </View>
            <View style={styles.optionContent}>
              <Text style={[styles.optionLabel, { color: dc.textPrimary }]}>
                {t('categories.title')}
              </Text>
              <Text style={[styles.optionSubtitle, { color: dc.textSecondary }]}>
                {t('sharedAccount.sharedCategoriesSubtitle')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={dc.textSecondary} />
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: dc.border }]} />

          <TouchableOpacity
            style={styles.optionRow}
            onPress={handleExportCSV}
          >
            <View style={[styles.optionIcon, { backgroundColor: colors.savings + '20' }]}>
              <Ionicons name="download-outline" size={20} color={colors.savings} />
            </View>
            <View style={styles.optionContent}>
              <Text style={[styles.optionLabel, { color: dc.textPrimary }]}>
                {t('export.title')}
              </Text>
              <Text style={[styles.optionSubtitle, { color: dc.textSecondary }]}>
                {t('sharedAccount.exportSubtitle')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={dc.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* NOTIFICACIONES */}
        <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
          {t('settings.notifications')}
        </Text>
        <View style={[styles.membersCard, { backgroundColor: dc.surface, borderColor: dc.border }]}>
        <View style={styles.optionRow}>
          <View style={[styles.optionIcon, { backgroundColor: dc.primary + '20' }]}>
            <Ionicons name="notifications-outline" size={20} color={dc.primary} />
          </View>
          <View style={styles.optionContent}>
            <View style={styles.notifTitleRow}>
              <Text style={[styles.optionLabel, { color: dc.textPrimary, flex: 1 }]}>
                {t('sharedAccount.notifTitle')}
              </Text>
              <Switch
                value={notificationsEnabled}
                onValueChange={setNotificationsEnabled}
                trackColor={{ false: dc.border, true: dc.primary + '80' }}
                thumbColor={notificationsEnabled ? dc.primary : dc.textSecondary}
              />
            </View>
            <Text style={[styles.optionSubtitle, { color: dc.textSecondary }]}>
              {t('sharedAccount.notifSubtitle')}
            </Text>
          </View>
        </View>
      </View>

        {/* GESTIÓN */}
        <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
          {t('settings.accountSection') ?? 'Cuenta'}
        </Text>
        <View style={[styles.membersCard, { backgroundColor: dc.surface, borderColor: dc.border }]}>
          {isCreator && (
            <>
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => setEditingName(true)}
              >
                <View style={[styles.optionIcon, { backgroundColor: dc.primary + '20' }]}>
                  <Ionicons name="pencil-outline" size={20} color={dc.primary} />
                </View>
                <View style={styles.optionContent}>
                  <Text style={[styles.optionLabel, { color: dc.textPrimary }]}>
                    {t('sharedAccount.renameAccount')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={dc.textSecondary} />
              </TouchableOpacity>
              <View style={[styles.divider, { backgroundColor: dc.border }]} />
            </>
          )}

          {!isCreator && (
            <TouchableOpacity style={styles.optionRow} onPress={handleLeave}>
              <View style={[styles.optionIcon, { backgroundColor: colors.expense + '20' }]}>
                <Ionicons name="exit-outline" size={20} color={colors.expense} />
              </View>
              <View style={styles.optionContent}>
                <Text style={[styles.optionLabel, { color: colors.expense }]}>
                  {t('sharedAccount.leaveAccount')}
                </Text>
              </View>
            </TouchableOpacity>
          )}

          {isCreator && (
            <TouchableOpacity style={styles.optionRow} onPress={handleDelete}>
              <View style={[styles.optionIcon, { backgroundColor: colors.expense + '20' }]}>
                <Ionicons name="trash-outline" size={20} color={colors.expense} />
              </View>
              <View style={styles.optionContent}>
                <Text style={[styles.optionLabel, { color: colors.expense }]}>
                  {t('sharedAccount.deleteAccount')}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <SelectModal
        visible={showCurrencyModal}
        title={t('settings.selectCurrency')}
        options={CURRENCIES.map(c => ({ code: c.code, label: c.label }))}
        selectedValue={sharedCurrencyCode}
        onSelect={(code) => saveSharedSettings(sharedAccount.id, { currencyCode: code })}
        onDismiss={() => setShowCurrencyModal(false)}
      />

      <ColorPaletteModal
        visible={showColorPaletteModal}
        selectedPalette={selectedPaletteId}
        onSelect={(id) => saveSharedSettings(sharedAccount.id, { colorPalette: id })}
        onDismiss={() => setShowColorPaletteModal(false)}
      />
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
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  accountName: {
    fontSize: 20, fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF', textAlign: 'center',
  },
  accountCode: {
    fontSize: 12, fontFamily: 'Poppins_500Medium',
    color: 'rgba(255,255,255,0.7)',
  },
  renameRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 8, width: '100%', marginBottom: 4,
  },
  renameInput: { flex: 1, fontSize: 18 },
  renameConfirm: { padding: 4 },
  sectionLabel: {
    fontSize: 12, fontFamily: 'Poppins_600SemiBold',
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: 8, marginLeft: 4,
  },
  card: {
    borderRadius: 16, marginBottom: 20,
    borderWidth: 0.5, padding: 16,
  },
  membersCard: {
    borderRadius: 16, marginBottom: 20,
    overflow: 'hidden', borderWidth: 0.5,
  },
  inviteInfo: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginBottom: 8 },
  linkText: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginBottom: 12, lineHeight: 18 },
  linkButtons: { flexDirection: 'row', gap: 8 },
  linkBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6, padding: 10, borderRadius: 10,
  },
  linkBtnText: { fontSize: 12, fontFamily: 'Poppins_600SemiBold' },
  memberRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  memberAvatar: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
  },
  memberInitial: { fontSize: 18, fontFamily: 'Poppins_700Bold' },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 15, fontFamily: 'Poppins_500Medium' },
  memberRole: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 2 },
  divider: { height: 0.5, marginLeft: 66 },
  optionRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, gap: 12,
  },
  optionIcon: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  optionContent: { flex: 1 },
  optionLabel: { fontSize: 15, fontFamily: 'Poppins_500Medium' },
  optionSubtitle: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 2 },
  optionValue: { fontSize: 13, fontFamily: 'Poppins_400Regular', marginRight: 4 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 40, maxHeight: '60%',
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
    alignSelf: 'center', marginBottom: 20,
  },
  modalTitle: { fontSize: 20, fontFamily: 'Poppins_700Bold', marginBottom: 16 },
  modalOption: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16, borderBottomWidth: 0.5,
  },
  modalOptionText: { fontSize: 15, fontFamily: 'Poppins_400Regular' },
  notifTitleRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  },
});

export default SharedAccountSettingsScreen;