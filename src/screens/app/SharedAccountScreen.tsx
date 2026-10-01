import React, { useState, useEffect } from 'react';
import {
  View, StyleSheet,
  TouchableOpacity, Alert, Share,
  Clipboard, Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import auth from '@react-native-firebase/auth';
import Icon from '../../components/common/Icon';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSharedAccountStore } from '../../store/sharedAccountStore';
import { switchToShared } from '../../store/accountSwitch';
import { reportError } from '../../services/crashReporting';
import { usePremium } from '../../hooks/usePremium';
import { usePremiumPrice } from '../../hooks/usePremiumPrice';
import { useTheme } from '../../hooks/useTheme';
import { HeroScrollScreen } from '../../components/layout/HeroScreen';
import { HeroTitleBar } from '../../components/layout/HeroBar';
import { SheetButton, FilledInput, SheetLabel } from '../../components/common/BottomSheet';
import { withAlpha } from '../../utils/color';
import PremiumModal from '../../components/common/PremiumModal';
import Avatar from '../../components/common/Avatar';
import { warningHaptic } from '../../utils/haptics';
import { getMemberPhoto } from '../../utils/memberLabel';

type RouteParams = {
  SharedAccount: { code?: string; name?: string; fromDeepLink?: boolean };
};

const SharedAccountScreen = () => {
  const { t } = useTranslation();
  const { colors: dc, ui } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const route = useRoute<RouteProp<RouteParams, 'SharedAccount'>>();
  const { isPremium, showModal, setShowModal } = usePremium();
  const premiumPrice = usePremiumPrice(!isPremium);

  const {
    sharedAccount, isLoading,
    createSharedAccount, joinSharedAccount,
    getInviteLink,
    pendingJoinRequest, incomingRequests,
    cancelJoinRequest, clearRejectedRequest,
    approveJoinRequest, rejectJoinRequest,
    subscribeToIncomingRequests,
  } = useSharedAccountStore();
  const currentUid = auth().currentUser?.uid;
  const isCreator = !!sharedAccount && sharedAccount.createdBy === currentUid;
  const visibleRequests = incomingRequests.filter(r => r.status === 'pending');

  const [accountName, setAccountName] = useState('');
  const [inviteCode, setInviteCode] = useState(route.params?.code ?? '');
  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu');
  const [loading, setLoading] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    if (sharedAccount && sharedAccount.createdBy === currentUid) {
      subscribeToIncomingRequests(sharedAccount.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- la cuenta cambia de objeto con cada actualización: solo se vuelve a suscribir al cambiar de cuenta, de creador o de usuario
  }, [sharedAccount?.id, sharedAccount?.createdBy, currentUid]);

  useEffect(() => {
    if (route.params?.code && !sharedAccount && !pendingJoinRequest) {
      // También desde un enlace: el formulario con el código puesto, y se
      // confirma con el botón de unirse. Antes se enviaba la solicitud sin
      // enseñar nada, así que un toque sin querer, o abrir el enlace con la
      // cuenta todavía cargando, mandaba una solicitud y un aviso al dueño.
      setInviteCode(route.params.code);
      setMode('join');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando llega un código por enlace: repetirlo al cambiar la solicitud volvería a abrir el formulario
  }, [route.params]);

  const handleCreate = async () => {
    if (!accountName.trim()) return;
    setLoading(true);
    try {
      await createSharedAccount(accountName.trim());
      if (useSharedAccountStore.getState().sharedAccount) {
        // Con la pantalla de carga, y a Inicio cuando ya está todo
        await switchToShared({ brandNew: true, onArrive: () => navigation.navigate('HomeTab') });
      }
    } catch {
      Alert.alert(t('common.error'), t('sharedAccount.createError'));
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
        Alert.alert(t('common.error'), t('sharedAccount.joinError'));
      }
    } catch {
      Alert.alert(t('common.error'), t('sharedAccount.joinError'));
    } finally {
      setLoading(false);
    }
  };

  const handleCancelRequest = () => {
    warningHaptic();
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
    warningHaptic();
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

  // La pantalla de carga sale al momento y, cuando ya está todo, se llega a
  // Inicio con la cuenta entera. Antes, sin nada que lo indicase, el botón
  // parecía no hacer nada y luego saltaba a Inicio
  const handleOpenShared = () => {
    if (!sharedAccount) return;
    switchToShared({ onArrive: () => navigation.navigate('HomeTab') })
      .catch((e) => reportError(e, 'abrir cuenta compartida'));
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

  const heroIntro = (
    <View style={styles.heroBody}>
      <View style={styles.heroAvatar}>
        <Icon name="people" size={28} color={ui.hero} />
      </View>
      <Text style={[styles.heroText, { color: ui.onHeroSoft }]}>{t('sharedAccount.intro')}</Text>
    </View>
  );

  if (!isPremium) {
    return (
      <>
        <HeroScrollScreen
          hero={(
            <>
              <HeroTitleBar title={t('sharedAccount.title')} onBack={() => navigation.goBack()} />
              {heroIntro}
            </>
          )}
          sheetStyle={styles.sheet}
        >
          <View style={styles.status}>
            <View style={[styles.statusIcon, { backgroundColor: withAlpha(dc.savings, 0.14) }]}>
              <Icon name="star" size={28} color={ui.savingsText} />
            </View>
            <Text style={[styles.statusTitle, { color: dc.textPrimary }]}>{t('premium.title')}</Text>
            <Text style={[styles.statusText, { color: dc.textSecondary }]}>{t('sharedAccount.intro')}</Text>
          </View>
          <SheetButton label={t('premium.purchase', { price: premiumPrice })} onPress={() => setShowModal(true)} icon="star-outline" />
        </HeroScrollScreen>
        <PremiumModal
          visible={showModal}
          onDismiss={() => setShowModal(false)}
          onPurchase={() => setShowModal(false)}
        />
      </>
    );
  }

  const hero = (
    <>
      <HeroTitleBar title={t('sharedAccount.title')} onBack={() => navigation.goBack()} />
      {sharedAccount && !isLoading ? (
        <View style={styles.heroBody}>
          <View style={styles.heroAvatar}>
            <Icon name="people" size={28} color={ui.hero} />
          </View>
          <View style={styles.heroInfo}>
            <Text style={[styles.heroName, { color: ui.onHero }]} numberOfLines={1}>{sharedAccount.name}</Text>
            <Text style={[styles.heroText, { color: ui.onHeroSoft }]}>
              {t('sharedAccount.code')}: {sharedAccount.inviteCode}
            </Text>
          </View>
        </View>
      ) : heroIntro}
    </>
  );

  return (
    // Con el teclado, como en las pantallas de acceso: en Android la vista se
    // encoge y en iOS el desplazamiento le deja sitio. En iOS se hacían las dos
    // cosas a la vez y además se desplazaba hasta el final: la pantalla subía
    // sin necesidad y la cabecera desaparecía
    <KeyboardAvoidingView
      style={styles.flex}
      behavior="height"
      enabled={Platform.OS === 'android'}
      keyboardVerticalOffset={-120}
    >
      <HeroScrollScreen
        hero={hero}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        sheetStyle={styles.sheet}
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={ui.accent} size="large" />
          </View>
        ) : sharedAccount ? (
          <>
            <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
              {t('sharedAccount.inviteLink')}
            </Text>
            <View style={[styles.linkCard, { backgroundColor: ui.field }]}>
              <Text style={[styles.linkText, { color: dc.textSecondary }]} numberOfLines={2}>
                {getInviteLink()}
              </Text>
              <View style={styles.linkButtons}>
                <TouchableOpacity
                  style={[styles.linkButton, { backgroundColor: linkCopied ? withAlpha(ui.incomeText, 0.14) : ui.sheet }]}
                  onPress={handleCopyLink}
                >
                  <Icon
                    name={linkCopied ? 'checkmark-circle' : 'copy-outline'}
                    size={18}
                    color={linkCopied ? ui.incomeText : ui.accent}
                  />
                  <Text style={[styles.linkButtonText, { color: linkCopied ? ui.incomeText : ui.accent }]}>
                    {linkCopied ? t('sharedAccount.linkCopied') : t('sharedAccount.copyLink')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.linkButton, { backgroundColor: ui.sheet }]}
                  onPress={handleShareLink}
                >
                  <Icon name="share-social-outline" size={18} color={ui.accent} />
                  <Text style={[styles.linkButtonText, { color: ui.accent }]}>
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
                {visibleRequests.map((req, idx) => (
                  <View key={req.uid}>
                    {idx > 0 && <View style={[styles.divider, { backgroundColor: ui.hair }]} />}
                    <View style={styles.memberRow}>
                      <View style={[styles.memberAvatar, { backgroundColor: withAlpha(ui.savingsText, 0.15) }]}>
                        <Text style={[styles.memberInitial, { color: ui.savingsText }]}>
                          {req.displayName[0]?.toUpperCase() ?? '?'}
                        </Text>
                      </View>
                      <View style={styles.memberInfo}>
                        <Text style={[styles.memberName, { color: dc.textPrimary }]}>{req.displayName}</Text>
                        <Text style={[styles.memberRole, { color: dc.textSecondary }]}>
                          {t('sharedAccount.wantsToJoin')}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.requestActions}>
                      <TouchableOpacity
                        style={[styles.requestBtn, { backgroundColor: ui.expenseSoft }]}
                        onPress={() => handleReject(req.uid, req.displayName)}
                      >
                        <Icon name="close" size={16} color={ui.expenseText} />
                        <Text style={[styles.requestBtnText, { color: ui.expenseText }]}>
                          {t('sharedAccount.reject')}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.requestBtn, { backgroundColor: withAlpha(ui.incomeText, 0.14) }]}
                        onPress={() => handleApprove(req.uid, req.displayName)}
                      >
                        <Icon name="checkmark" size={16} color={ui.incomeText} />
                        <Text style={[styles.requestBtnText, { color: ui.incomeText }]}>
                          {t('sharedAccount.approve')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </>
            )}

            <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
              {t('sharedAccount.members')}
            </Text>
            {sharedAccount.members.map((uid, index) => {
              const name = sharedAccount.memberNames[uid] ?? t('common.user');
              const isMemberCreator = uid === sharedAccount.createdBy;
              const isCurrentUser = uid === auth().currentUser?.uid;
              return (
                <View key={uid}>
                  {index > 0 && <View style={[styles.divider, { backgroundColor: ui.hair }]} />}
                  <View style={styles.memberRow}>
                    <Avatar
                      uri={getMemberPhoto(sharedAccount, uid)}
                      style={[styles.memberAvatar, { backgroundColor: ui.accentSoft }]}
                      zoomTitle={name}
                    >
                      <Text style={[styles.memberInitial, { color: ui.accent }]}>
                        {name[0].toUpperCase()}
                      </Text>
                    </Avatar>
                    <View style={styles.memberInfo}>
                      <Text style={[styles.memberName, { color: dc.textPrimary }]}>
                        {name}{isCurrentUser ? ` ${t('sharedAccount.you')}` : ''}
                      </Text>
                      {isMemberCreator && (
                        <Text style={[styles.memberRole, { color: dc.textSecondary }]}>
                          {t('sharedAccount.creator')}
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              );
            })}

            <SheetButton
              label={t('sharedAccount.openShared')}
              onPress={handleOpenShared}
              icon="arrow-forward"
              style={styles.bigButton}
            />
          </>
        ) : pendingJoinRequest ? (
          <>
            <View style={styles.status}>
              <View
                style={[
                  styles.statusIcon,
                  { backgroundColor: pendingJoinRequest.status === 'rejected' ? ui.expenseSoft : ui.accentSoft },
                ]}
              >
                <Icon
                  name={pendingJoinRequest.status === 'rejected' ? 'close' : 'hourglass-outline'}
                  size={28}
                  color={pendingJoinRequest.status === 'rejected' ? ui.expenseText : ui.accent}
                />
              </View>
              <Text style={[styles.statusTitle, { color: dc.textPrimary }]}>
                {pendingJoinRequest.status === 'rejected'
                  ? t('sharedAccount.rejectedTitle')
                  : t('sharedAccount.waitingApprovalTitle')}
              </Text>
              <Text style={[styles.statusText, { color: dc.textSecondary }]}>
                {pendingJoinRequest.status === 'rejected'
                  ? t('sharedAccount.rejectedBody', { name: pendingJoinRequest.accountName })
                  : t('sharedAccount.waitingApprovalBody', { name: pendingJoinRequest.accountName })}
              </Text>
            </View>

            {pendingJoinRequest.status === 'rejected' ? (
              <SheetButton
                label={t('sharedAccount.acceptRejection')}
                onPress={() => { clearRejectedRequest().catch(() => {}); }}
              />
            ) : (
              <SheetButton
                label={t('sharedAccount.cancelRequest')}
                onPress={handleCancelRequest}
                variant="danger"
              />
            )}
          </>
        ) : (
          <>
            {mode === 'menu' && (
              <>
                <TouchableOpacity
                  style={[styles.option, { backgroundColor: ui.field }]}
                  onPress={() => setMode('create')}
                  activeOpacity={0.8}
                >
                  <View style={[styles.optionIcon, { backgroundColor: ui.accentSoft }]}>
                    <Icon name="add" size={22} color={ui.accent} />
                  </View>
                  <Text style={[styles.optionTitle, { color: dc.textPrimary }]}>{t('sharedAccount.createTitle')}</Text>
                  <Icon name="chevron-forward" size={18} color={dc.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.option, { backgroundColor: ui.field }]}
                  onPress={() => setMode('join')}
                  activeOpacity={0.8}
                >
                  <View style={[styles.optionIcon, { backgroundColor: ui.accentSoft }]}>
                    <Icon name="key-outline" size={20} color={ui.accent} />
                  </View>
                  <Text style={[styles.optionTitle, { color: dc.textPrimary }]}>{t('sharedAccount.joinTitle')}</Text>
                  <Icon name="chevron-forward" size={18} color={dc.textSecondary} />
                </TouchableOpacity>
              </>
            )}

            {mode === 'create' && (
              <>
                <Text style={[styles.formTitle, { color: dc.textPrimary }]}>{t('sharedAccount.createTitle')}</Text>
                <SheetLabel>{t('sharedAccount.accountName')}</SheetLabel>
                <FilledInput
                  icon="people-outline"
                  value={accountName}
                  onChangeText={setAccountName}
                  placeholder={t('sharedAccount.accountNamePlaceholder')}
                  maxLength={40}
                />
                <SheetButton
                  label={t('sharedAccount.createButton')}
                  onPress={handleCreate}
                  loading={loading}
                  disabled={!accountName.trim()}
                  style={styles.bigButton}
                />
                <TouchableOpacity onPress={() => setMode('menu')} style={styles.secondaryLink}>
                  <Text style={[styles.secondaryLinkText, { color: dc.textSecondary }]}>{t('movements.cancel')}</Text>
                </TouchableOpacity>
              </>
            )}

            {mode === 'join' && (
              <>
                <Text style={[styles.formTitle, { color: dc.textPrimary }]}>{t('sharedAccount.joinTitle')}</Text>
                <SheetLabel>{t('sharedAccount.enterCode')}</SheetLabel>
                <FilledInput
                  icon="key-outline"
                  value={inviteCode}
                  onChangeText={(v) => setInviteCode(v.toUpperCase())}
                  placeholder={t('sharedAccount.enterCodePlaceholder')}
                  autoCapitalize="characters"
                  maxLength={6}
                  style={styles.codeInput}
                />
                <SheetButton
                  label={t('sharedAccount.joinButton')}
                  onPress={handleJoin}
                  loading={loading}
                  disabled={inviteCode.length < 6}
                  style={styles.bigButton}
                />
                <TouchableOpacity onPress={() => setMode('menu')} style={styles.secondaryLink}>
                  <Text style={[styles.secondaryLinkText, { color: dc.textSecondary }]}>{t('movements.cancel')}</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}
      </HeroScrollScreen>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  sheet: { paddingHorizontal: 20 },
  heroBody: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 14 },
  heroAvatar: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFFFFF',
    justifyContent: 'center', alignItems: 'center',
  },
  heroInfo: { flex: 1, minWidth: 0 },
  heroName: { fontSize: 21, fontFamily: 'Poppins_700Bold', letterSpacing: -0.3 },
  heroText: { flex: 1, fontSize: 13.5, fontFamily: 'Poppins_400Regular', lineHeight: 20 },
  loadingContainer: { justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  sectionLabel: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', marginTop: 6, marginBottom: 6 },
  linkCard: { borderRadius: 18, padding: 14, marginBottom: 16 },
  linkText: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginBottom: 12, lineHeight: 18 },
  linkButtons: { flexDirection: 'row', gap: 8 },
  linkButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6, padding: 10, borderRadius: 12,
  },
  linkButtonText: { fontSize: 12.5, fontFamily: 'Poppins_600SemiBold' },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  memberAvatar: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  memberInitial: { fontSize: 15, fontFamily: 'Poppins_700Bold' },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 15, fontFamily: 'Poppins_500Medium' },
  memberRole: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 1 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 46 },
  requestActions: { flexDirection: 'row', gap: 8, paddingBottom: 10, paddingLeft: 46 },
  requestBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6, padding: 10, borderRadius: 12,
  },
  requestBtnText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
  bigButton: { marginTop: 20 },
  status: { alignItems: 'center', paddingVertical: 20 },
  statusIcon: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  statusTitle: { fontSize: 19, fontFamily: 'Poppins_700Bold', marginBottom: 6, textAlign: 'center' },
  statusText: { fontSize: 14, fontFamily: 'Poppins_400Regular', textAlign: 'center', lineHeight: 21, marginBottom: 20 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 14, marginBottom: 10 },
  optionIcon: { width: 40, height: 40, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  optionTitle: { flex: 1, fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  formTitle: { fontSize: 18, fontFamily: 'Poppins_700Bold' },
  codeInput: { letterSpacing: 4, fontFamily: 'Poppins_600SemiBold' },
  secondaryLink: { alignItems: 'center', padding: 12 },
  secondaryLinkText: { fontSize: 14, fontFamily: 'Poppins_500Medium' },
});

export default SharedAccountScreen;
