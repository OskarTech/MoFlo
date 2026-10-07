import React from 'react';
import { View, StyleSheet, Alert, Share } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { HeroScrollScreen } from '../../components/layout/HeroScreen';
import { HeroTitleBar } from '../../components/layout/HeroBar';
import { SectionHeader } from '../../components/layout/SheetSection';
import { useTheme } from '../../hooks/useTheme';
import { reportError } from '../../services/crashReporting';
import { successHaptic, warningHaptic } from '../../utils/haptics';
import { businessIsCreator, currentUid, useBusinessStore } from '../store/businessStore';
import { MAX_BUSINESS_MEMBERS } from '../types';
import { EmptyNote, ListRow, Note, PillButton } from '../ui/kit';

/**
 * Socios: hasta 5. Todos apuntan, ven y cambian lo mismo; quien creó la
 * empresa aprueba a quien pide entrar con el código, puede sacar a alguien y
 * es el único que puede borrarla
 */
const BizMembersScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { colors: dc, ui } = useTheme();
  const business = useBusinessStore((s) => s.business);
  const requests = useBusinessStore((s) => s.incomingRequests);
  if (!business) return null;
  const creator = businessIsCreator(business);
  const me = currentUid();
  const full = business.members.length >= MAX_BUSINESS_MEMBERS;
  const pending = requests.filter((r) => r.status === 'pending');

  const share = () => {
    Share.share({ message: t('business.members.shareMessage', { name: business.name, code: business.inviteCode }) })
      .catch(() => {});
  };

  const approve = async (uid: string) => {
    try {
      await useBusinessStore.getState().approveRequest(uid);
      successHaptic();
    } catch (e) {
      if ((e as Error)?.message === 'full') {
        Alert.alert(t('business.members.fullTitle'), t('business.members.fullBody', { max: MAX_BUSINESS_MEMBERS }));
        return;
      }
      reportError(e, 'empresa: aprobar');
      Alert.alert(t('common.error'), t('accountSwitch.error'));
    }
  };

  const remove = (uid: string, name: string) => {
    Alert.alert(t('business.members.removeTitle'), t('business.members.removeBody', { name }), [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('business.members.remove'),
        style: 'destructive',
        onPress: () => {
          warningHaptic();
          useBusinessStore.getState().removeMember(uid).catch((e) => reportError(e, 'empresa: sacar socio'));
        },
      },
    ]);
  };

  return (
    <HeroScrollScreen hero={<HeroTitleBar title={t('business.members.title')} onBack={() => navigation.goBack()} />}>
      <View style={styles.pad}>
        <Note text={t('business.members.hint', { max: MAX_BUSINESS_MEMBERS })} />

        <View style={[styles.codeCard, { backgroundColor: ui.field }]}>
          <Text style={[styles.codeLabel, { color: dc.textSecondary }]}>{t('business.members.code')}</Text>
          <Text style={[styles.code, { color: dc.textPrimary }]} selectable>{business.inviteCode}</Text>
          <Text style={[styles.codeHint, { color: dc.textSecondary }]}>{t('business.members.codeHint')}</Text>
          <PillButton label={t('business.members.share')} icon="share-social-outline" onPress={share} disabled={full} style={styles.share} />
          {full && <Text style={[styles.codeHint, { color: ui.expenseText }]}>{t('business.members.fullBody', { max: MAX_BUSINESS_MEMBERS })}</Text>}
        </View>
      </View>

      {creator && pending.length > 0 && (
        <>
          <SectionHeader title={t('business.members.requests')} style={styles.section} />
          <View style={styles.pad}>
            {pending.map((r) => (
              <View key={r.uid} style={[styles.request, { borderBottomColor: ui.hair }]}>
                <ListRow initial={(r.displayName || '?').charAt(0).toUpperCase()} title={r.displayName || t('common.user')} subtitle={t('business.members.wantsToJoin')} style={styles.flex} />
                <View style={styles.requestActions}>
                  <PillButton label={t('business.members.reject')} tone="danger" onPress={() => useBusinessStore.getState().rejectRequest(r.uid).catch((e) => reportError(e, 'empresa: rechazar'))} />
                  <PillButton label={t('business.members.approve')} onPress={() => approve(r.uid)} />
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      <SectionHeader
        title={t('business.members.countOf', { count: business.members.length, max: MAX_BUSINESS_MEMBERS })}
        style={styles.section}
      />
      <View style={styles.pad}>
        {business.members.length === 0 ? <EmptyNote text={t('business.members.none')} /> : business.members.map((uid) => {
          const name = business.memberNames?.[uid] || t('common.user');
          const tags = [uid === me ? t('sharedAccount.you') : null, uid === business.createdBy ? t('sharedAccount.creator') : null].filter(Boolean);
          const canRemove = creator && uid !== business.createdBy;
          return (
            <ListRow
              key={uid}
              initial={name.charAt(0).toUpperCase()}
              title={name}
              subtitle={tags.join(' · ') || null}
              right={canRemove ? t('business.members.remove') : null}
              rightColor={ui.expenseText}
              onPress={canRemove ? () => remove(uid, name) : undefined}
            />
          );
        })}
      </View>
    </HeroScrollScreen>
  );
};

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 20 },
  section: { marginTop: 24 },
  flex: { flex: 1 },
  codeCard: { borderRadius: 20, padding: 18, marginTop: 14, alignItems: 'center' },
  codeLabel: { fontSize: 12.5, fontFamily: 'Poppins_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.6 },
  code: { fontSize: 34, fontFamily: 'Poppins_700Bold', letterSpacing: 6, marginTop: 4 },
  codeHint: { fontSize: 12.5, fontFamily: 'Poppins_400Regular', textAlign: 'center', marginTop: 4 },
  share: { marginTop: 12 },
  request: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 10 },
  requestActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});

export default BizMembersScreen;
