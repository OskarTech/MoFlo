import React, { useState, useEffect } from 'react';
import {
  View, StyleSheet, ScrollView,
  TouchableOpacity, Alert, Share,
  KeyboardAvoidingView, Platform, Clipboard,
  StatusBar,
} from 'react-native';
import { Text, TextInput, Button, ActivityIndicator } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSharedAccountStore } from '../../store/sharedAccountStore';
import { useMovementStore } from '../../store/movementStore';
import { usePremium } from '../../hooks/usePremium';
import { useTheme } from '../../hooks/useTheme';
import AppHeader from '../../components/common/AppHeader';
import PremiumModal from '../../components/common/PremiumModal';

type RouteParams = {
  SharedAccount: { code?: string; name?: string; fromDeepLink?: boolean };
};

const SharedAccountScreen = () => {
  const { t } = useTranslation();
  const { colors: dc } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const route = useRoute<RouteProp<RouteParams, 'SharedAccount'>>();
  const { isPremium, showModal, setShowModal } = usePremium();
  const insets = useSafeAreaInsets();
  const headerHeight = (Platform.OS === 'ios' ? insets.top : (StatusBar.currentHeight ?? 0)) + 62;

  const {
    sharedAccount, isLoading,
    createSharedAccount, joinSharedAccount,
    setSharedMode, getInviteLink,
    pendingJoinRequest, incomingRequests,
    cancelJoinRequest, clearRejectedRequest,
    approveJoinRequest, rejectJoinRequest,
  } = useSharedAccountStore();
  const { loadSharedData } = useMovementStore();
  const currentUid = require('@react-native-firebase/auth').default().currentUser?.uid;
  const isCreator = !!sharedAccount && sharedAccount.createdBy === currentUid;
  const visibleRequests = incomingRequests.filter(r => r.status === 'pending');

  const [accountName, setAccountName] = useState('');
  const [inviteCode, setInviteCode] = useState(route.params?.code ?? '');
  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu');
  const [loading, setLoading] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    if (route.params?.code && !sharedAccount && !pendingJoinRequest) {
      const code = route.params.code;
      setInviteCode(code);
      if (route.params?.fromDeepLink) {
        setLoading(true);
        joinSharedAccount(code.trim()).then((result) => {
          if (result === 'pending') {
            Alert.alert('⏳', t('sharedAccount.requestSent'));
          } else if (result === 'invalid') {
            Alert.alert('Error', t('sharedAccount.joinError'));
          } else if (result === 'has_pending') {
            Alert.alert('', t('sharedAccount.alreadyHasPending'));
          } else if (result === 'error') {
            Alert.alert('Error', t('sharedAccount.joinError'));
          }
        }).catch(() => {
          Alert.alert('Error', t('sharedAccount.joinError'));
        }).finally(() => setLoading(false));
      } else {
        setMode('join');
      }
    }
  }, [route.params]);

  const handleCreate = async () => {
    if (!accountName.trim()) return;
    setLoading(true);
    try {
      await createSharedAccount(accountName.trim());
    } catch (e) {
      Alert.alert('Error', 'No se pudo crear la cuenta.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!inviteCode.trim()) return;
    setLoading(true);
    try {
      const result = await joinSharedAccount(inviteCode.trim());
      if (result === 'pending') {
        Alert.alert('⏳', t('sharedAccount.requestSent'));
        setInviteCode('');
        setMode('menu');
      } else if (result === 'already_member') {
        Alert.alert('', t('sharedAccount.alreadyMember'));
      } else if (result === 'has_pending') {
        Alert.alert('', t('sharedAccount.alreadyHasPending'));
      } else {
        Alert.alert('Error', t('sharedAccount.joinError'));
      }
    } catch (e) {
      Alert.alert('Error', t('sharedAccount.joinError'));
    } finally {
      setLoading(false);
    }
  };

  const handleCancelRequest = () => {
    Alert.alert(
      t('sharedAccount.cancelRequestConfirmTitle'),
      t('sharedAccount.cancelRequestConfirmBody'),
      [
        { text: t('movements.cancel'), style: 'cancel' },
        {
          text: t('sharedAccount.cancelRequestConfirm'),
          style: 'destructive',
          onPress: () => { cancelJoinRequest().catch(() => {}); },
        },
      ]
    );
  };

  const handleApprove = (uid: string, name: string) => {
    Alert.alert(
      t('sharedAccount.approveConfirmTitle'),
      t('sharedAccount.approveConfirmBody', { name }),
      [
        { text: t('movements.cancel'), style: 'cancel' },
        {
          text: t('sharedAccount.approve'),
          onPress: () => { approveJoinRequest(uid).catch(() => {}); },
        },
      ]
    );
  };

  const handleReject = (uid: string, name: string) => {
    Alert.alert(
      t('sharedAccount.rejectConfirmTitle'),
      t('sharedAccount.rejectConfirmBody', { name }),
      [
        { text: t('movements.cancel'), style: 'cancel' },
        {
          text: t('sharedAccount.reject'),
          style: 'destructive',
          onPress: () => { rejectJoinRequest(uid).catch(() => {}); },
        },
      ]
    );
  };

  const handleOpenShared = async () => {
    if (!sharedAccount) return;
    await loadSharedData(sharedAccount.id);
    await setSharedMode(true);
    navigation.navigate('HomeTab');
  };

  const handleCopyLink = () => {
    const link = getInviteLink();
    Clipboard.setString(link);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const handleShareLink = async () => {
    const link = getInviteLink();
    await Share.share({
      message: `${t('sharedAccount.intro')}\n\n${link}`,
      title: `MoFlo — ${sharedAccount?.name}`,
    });
  };

  if (!isPremium) {
    return (
      <View style={[styles.container, { backgroundColor: dc.background }]}>
        <AppHeader title={t('sharedAccount.title')} showBack showBell={false} />
        <View style={styles.premiumGate}>
          <Text style={styles.premiumEmoji}>⭐</Text>
          <Text style={[styles.premiumTitle, { color: dc.textPrimary }]}>
            {t('premium.title')}
          </Text>
          <Text style={[styles.premiumSubtitle, { color: dc.textSecondary }]}>
            {t('sharedAccount.intro')}
          </Text>
          <Button
            mode="contained"
            onPress={() => setShowModal(true)}
            style={styles.premiumButton}
            buttonColor={dc.primary}
            textColor="#FFFFFF"
          >
            {t('premium.purchase')}
          </Button>
        </View>
        <PremiumModal
          visible={showModal}
          onDismiss={() => setShowModal(false)}
          onPurchase={() => setShowModal(false)}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: dc.background }]}>
      <AppHeader title={t('sharedAccount.title')} showBack showBell={false} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets
        >
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={dc.primary} size="large" />
            </View>
          ) : sharedAccount ? (
            <>
              <View style={[styles.accountCard, { backgroundColor: dc.primary }]}>
                <Text style={styles.accountEmoji}>👥</Text>
                <Text style={styles.accountCardName}>{sharedAccount.name}</Text>
                <Text style={styles.accountCardCode}>
                  {t('sharedAccount.code')}: {sharedAccount.inviteCode}
                </Text>
              </View>

              <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
                {t('sharedAccount.inviteLink')}
              </Text>
              <View style={[styles.linkCard, { backgroundColor: dc.surface, borderColor: dc.border }]}>
                <Text style={[styles.linkText, { color: dc.textSecondary }]} numberOfLines={2}>
                  {getInviteLink()}
                </Text>
                <View style={styles.linkButtons}>
                  <TouchableOpacity
                    style={[styles.linkButton, { backgroundColor: linkCopied ? dc.income + '20' : dc.background }]}
                    onPress={handleCopyLink}
                  >
                    <Ionicons
                      name={linkCopied ? 'checkmark-circle' : 'copy-outline'}
                      size={18}
                      color={linkCopied ? dc.income : dc.primary}
                    />
                    <Text style={[styles.linkButtonText, {
                      color: linkCopied ? dc.income : dc.primary,
                    }]}>
                      {linkCopied ? t('sharedAccount.linkCopied') : t('sharedAccount.copyLink')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.linkButton, { backgroundColor: dc.background }]}
                    onPress={handleShareLink}
                  >
                    <Ionicons name="share-social-outline" size={18} color={dc.primary} />
                    <Text style={[styles.linkButtonText, { color: dc.primary }]}>
                      {t('sharedAccount.shareLink')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {isCreator && visibleRequests.length > 0 && (
                <>
                  <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
                    {t('sharedAccount.pendingRequests')}
                  </Text>
                  <View style={[styles.membersCard, { backgroundColor: dc.surface, borderColor: dc.border }]}>
                    {visibleRequests.map((req, idx) => (
                      <View key={req.uid}>
                        <View style={styles.requestRow}>
                          <View style={[styles.memberAvatar, { backgroundColor: dc.savings + '20' }]}>
                            <Text style={[styles.memberInitial, { color: dc.savings }]}>
                              {req.displayName[0]?.toUpperCase() ?? '?'}
                            </Text>
                          </View>
                          <View style={styles.memberInfo}>
                            <Text style={[styles.memberName, { color: dc.textPrimary }]}>
                              {req.displayName}
                            </Text>
                            <Text style={[styles.memberRole, { color: dc.textSecondary }]}>
                              {t('sharedAccount.wantsToJoin')}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.requestActions}>
                          <TouchableOpacity
                            style={[styles.requestBtn, { backgroundColor: dc.expense + '15' }]}
                            onPress={() => handleReject(req.uid, req.displayName)}
                          >
                            <Ionicons name="close" size={16} color={dc.expense} />
                            <Text style={[styles.requestBtnText, { color: dc.expense }]}>
                              {t('sharedAccount.reject')}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.requestBtn, { backgroundColor: dc.income + '15' }]}
                            onPress={() => handleApprove(req.uid, req.displayName)}
                          >
                            <Ionicons name="checkmark" size={16} color={dc.income} />
                            <Text style={[styles.requestBtnText, { color: dc.income }]}>
                              {t('sharedAccount.approve')}
                            </Text>
                          </TouchableOpacity>
                        </View>
                        {idx < visibleRequests.length - 1 && (
                          <View style={[styles.divider, { backgroundColor: dc.border, marginLeft: 0 }]} />
                        )}
                      </View>
                    ))}
                  </View>
                </>
              )}

              <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
                {t('sharedAccount.members')}
              </Text>
              <View style={[styles.membersCard, { backgroundColor: dc.surface, borderColor: dc.border }]}>
                {sharedAccount.members.map((uid, index) => {
                  const name = sharedAccount.memberNames[uid] ?? 'Usuario';
                  const isCreator = uid === sharedAccount.createdBy;
                  const isCurrentUser = uid === require('@react-native-firebase/auth').default().currentUser?.uid;
                  return (
                    <View key={uid}>
                      <View style={styles.memberRow}>
                        <View style={[styles.memberAvatar, { backgroundColor: dc.primary + '20' }]}>
                          <Text style={[styles.memberInitial, { color: dc.primary }]}>
                            {name[0].toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.memberInfo}>
                          <Text style={[styles.memberName, { color: dc.textPrimary }]}>
                            {name}{isCurrentUser ? ` ${t('sharedAccount.you')}` : ''}
                          </Text>
                          {isCreator && (
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

              <Button
                mode="contained"
                onPress={handleOpenShared}
                style={styles.openButton}
                contentStyle={styles.openButtonContent}
                buttonColor={dc.primary}
                textColor="#FFFFFF"
              >
                {t('sharedAccount.openShared')}
              </Button>

              <Button
                mode="outlined"
                onPress={() => navigation.navigate('SharedAccountSettings')}
                style={styles.settingsButton}
                textColor={dc.textSecondary}
              >
                {t('sharedAccount.settings')}
              </Button>
            </>
          ) : pendingJoinRequest ? (
            <>
              <View style={styles.introSection}>
                <Text style={styles.introEmoji}>
                  {pendingJoinRequest.status === 'rejected' ? '❌' : '⏳'}
                </Text>
                <Text style={[styles.introTitle, { color: dc.textPrimary }]}>
                  {pendingJoinRequest.status === 'rejected'
                    ? t('sharedAccount.rejectedTitle')
                    : t('sharedAccount.waitingApprovalTitle')}
                </Text>
                <Text style={[styles.introText, { color: dc.textSecondary }]}>
                  {pendingJoinRequest.status === 'rejected'
                    ? t('sharedAccount.rejectedBody', { name: pendingJoinRequest.accountName })
                    : t('sharedAccount.waitingApprovalBody', { name: pendingJoinRequest.accountName })}
                </Text>
              </View>

              {pendingJoinRequest.status === 'rejected' ? (
                <Button
                  mode="contained"
                  onPress={() => { clearRejectedRequest().catch(() => {}); }}
                  style={styles.actionButton}
                  contentStyle={styles.actionButtonContent}
                  buttonColor={dc.primary}
                  textColor="#FFFFFF"
                >
                  {t('sharedAccount.acceptRejection')}
                </Button>
              ) : (
                <Button
                  mode="outlined"
                  onPress={handleCancelRequest}
                  style={styles.actionButton}
                  contentStyle={styles.actionButtonContent}
                  textColor={dc.expense}
                >
                  {t('sharedAccount.cancelRequest')}
                </Button>
              )}
            </>
          ) : (
            <>
              <View style={styles.introSection}>
                <Text style={styles.introEmoji}>👥</Text>
                <Text style={[styles.introTitle, { color: dc.textPrimary }]}>
                  {t('sharedAccount.title')}
                </Text>
                <Text style={[styles.introText, { color: dc.textSecondary }]}>
                  {t('sharedAccount.intro')}
                </Text>
              </View>

              {mode === 'menu' && (
                <>
                  <Button
                    mode="contained"
                    onPress={() => setMode('create')}
                    style={styles.actionButton}
                    contentStyle={styles.actionButtonContent}
                    buttonColor={dc.primary}
                    textColor="#FFFFFF"
                    icon="plus-circle-outline"
                  >
                    {t('sharedAccount.createTitle')}
                  </Button>
                  <TouchableOpacity
                    onPress={() => setMode('join')}
                    style={styles.secondaryLink}
                  >
                    <Text style={[styles.secondaryLinkText, { color: dc.primary }]}>
                      {t('sharedAccount.orJoin')}
                    </Text>
                  </TouchableOpacity>
                </>
              )}

              {mode === 'create' && (
                <View style={[styles.formCard, { backgroundColor: dc.surface, borderColor: dc.border }]}>
                  <Text style={[styles.formTitle, { color: dc.textPrimary }]}>
                    {t('sharedAccount.createTitle')}
                  </Text>
                  <TextInput
                    label={t('sharedAccount.accountName')}
                    value={accountName}
                    onChangeText={setAccountName}
                    mode="outlined"
                    placeholder={t('sharedAccount.accountNamePlaceholder')}
                    style={[styles.input, { backgroundColor: dc.surface }]}
                    outlineColor={dc.primary}
                    activeOutlineColor={dc.primary}
                  />
                  <View style={styles.formButtons}>
                    <Button
                      mode="outlined"
                      onPress={() => setMode('menu')}
                      style={styles.cancelBtn}
                      textColor={dc.textSecondary}
                    >
                      {t('movements.cancel')}
                    </Button>
                    <Button
                      mode="contained"
                      onPress={handleCreate}
                      loading={loading}
                      disabled={!accountName.trim() || loading}
                      style={styles.confirmBtn}
                      buttonColor={dc.primary}
                      textColor="#FFFFFF"
                    >
                      {t('sharedAccount.createButton')}
                    </Button>
                  </View>
                </View>
              )}

              {mode === 'join' && (
                <View style={[styles.formCard, { backgroundColor: dc.surface, borderColor: dc.border }]}>
                  <Text style={[styles.formTitle, { color: dc.textPrimary }]}>
                    {t('sharedAccount.joinTitle')}
                  </Text>
                  <TextInput
                    label={t('sharedAccount.enterCode')}
                    value={inviteCode}
                    onChangeText={(v) => setInviteCode(v.toUpperCase())}
                    mode="outlined"
                    placeholder={t('sharedAccount.enterCodePlaceholder')}
                    autoCapitalize="characters"
                    maxLength={6}
                    style={[styles.input, { backgroundColor: dc.surface }]}
                    outlineColor={dc.primary}
                    activeOutlineColor={dc.primary}
                  />
                  <View style={styles.formButtons}>
                    <Button
                      mode="outlined"
                      onPress={() => setMode('menu')}
                      style={styles.cancelBtn}
                      textColor={dc.textSecondary}
                    >
                      {t('movements.cancel')}
                    </Button>
                    <Button
                      mode="contained"
                      onPress={handleJoin}
                      loading={loading}
                      disabled={inviteCode.length < 6 || loading}
                      style={styles.confirmBtn}
                      buttonColor={dc.primary}
                      textColor="#FFFFFF"
                    >
                      {t('sharedAccount.joinButton')}
                    </Button>
                  </View>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  premiumGate: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, paddingTop: 60 },
  premiumEmoji: { fontSize: 56, marginBottom: 16 },
  premiumTitle: { fontSize: 22, fontFamily: 'Poppins_700Bold', marginBottom: 8, textAlign: 'center' },
  premiumSubtitle: { fontSize: 14, fontFamily: 'Poppins_400Regular', textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  premiumButton: { borderRadius: 12, width: '100%' },
  accountCard: { borderRadius: 20, padding: 24, alignItems: 'center', marginBottom: 24, elevation: 4 },
  accountEmoji: { fontSize: 40, marginBottom: 8 },
  accountCardName: { fontSize: 22, fontFamily: 'Poppins_700Bold', color: '#FFFFFF', marginBottom: 4 },
  accountCardCode: { fontSize: 13, fontFamily: 'Poppins_500Medium', color: 'rgba(255,255,255,0.7)' },
  sectionLabel: {
    fontSize: 12, fontFamily: 'Poppins_600SemiBold',
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: 8, marginLeft: 4,
  },
  linkCard: { borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 0.5 },
  linkText: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginBottom: 12, lineHeight: 18 },
  linkButtons: { flexDirection: 'row', gap: 8 },
  linkButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6, padding: 10, borderRadius: 10,
  },
  linkButtonText: { fontSize: 12, fontFamily: 'Poppins_600SemiBold' },
  membersCard: { borderRadius: 16, marginBottom: 20, overflow: 'hidden', borderWidth: 0.5 },
  memberRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  memberAvatar: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  memberInitial: { fontSize: 18, fontFamily: 'Poppins_700Bold' },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 15, fontFamily: 'Poppins_500Medium' },
  memberRole: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 2 },
  divider: { height: 0.5, marginLeft: 66 },
  openButton: { borderRadius: 12, marginBottom: 12 },
  openButtonContent: { height: 52 },
  settingsButton: { borderRadius: 12 },
  introSection: { alignItems: 'center', paddingVertical: 32 },
  introEmoji: { fontSize: 56, marginBottom: 16 },
  introTitle: { fontSize: 22, fontFamily: 'Poppins_700Bold', marginBottom: 8 },
  introText: { fontSize: 14, fontFamily: 'Poppins_400Regular', textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  actionButton: { borderRadius: 12, marginBottom: 16 },
  actionButtonContent: { height: 52 },
  secondaryLink: { alignItems: 'center', padding: 12 },
  secondaryLinkText: { fontSize: 14, fontFamily: 'Poppins_500Medium' },
  formCard: { borderRadius: 20, padding: 20, borderWidth: 0.5 },
  formTitle: { fontSize: 18, fontFamily: 'Poppins_700Bold', marginBottom: 16 },
  input: { marginBottom: 16 },
  formButtons: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1 },
  confirmBtn: { flex: 2 },
  requestRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  requestActions: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 14 },
  requestBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6, padding: 10, borderRadius: 10,
  },
  requestBtnText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
});

export default SharedAccountScreen;