import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import Icon, { IconName } from './Icon';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { usePremiumStore } from '../../store/premiumStore';
import { useSharedAccountStore } from '../../store/sharedAccountStore';
import { useSharedCategoryStore } from '../../store/sharedCategoryStore';
import { useMovementStore } from '../../store/movementStore';
import { useSavingsStore } from '../../store/savingsStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useWalkthroughTarget } from '../walkthrough/useWalkthroughTarget';
import BottomSheet from './BottomSheet';
import PremiumModal from './PremiumModal';
import Avatar from './Avatar';
import { getMemberPhoto } from '../../utils/memberLabel';

const initialOf = (name?: string) => (name?.trim()?.charAt(0) || '?').toUpperCase();

/**
 * Pastilla de la cabecera de Inicio con la cuenta activa (individual o
 * compartida). Al tocarla se elige la cuenta en una ventana desde abajo.
 */
const AccountSwitcher = () => {
  const { t } = useTranslation();
  const { colors: dc, ui } = useTheme();
  const navigation = useNavigation<any>();
  const targetRef = useWalkthroughTarget('header_account');
  const { isPremium } = usePremiumStore();
  const displayName = useSettingsStore((s) => s.displayName);
  const photoURL = useSettingsStore((s) => s.photoURL);
  const {
    sharedAccount, isSharedMode,
    setSharedMode, subscribeToSharedMovements, loadSharedSettings,
  } = useSharedAccountStore();
  const { loadSharedCategories } = useSharedCategoryStore();
  const { loadData, loadSharedData, setSharedAccountId, applyRecurringMovements } = useMovementStore();

  const [showSheet, setShowSheet] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);

  const handleSelectIndividual = async () => {
    setShowSheet(false);
    if (isSharedMode) {
      setSharedAccountId(null);
      useSavingsStore.getState().setSharedAccountId(null);
      await setSharedMode(false);
      await loadData();
      await useSavingsStore.getState().loadHuchas();
      navigation.navigate('HomeTab');
    }
  };

  const handleSelectShared = async () => {
    setShowSheet(false);
    if (!isPremium) {
      setTimeout(() => setShowPremiumModal(true), 300);
      return;
    }
    if (sharedAccount) {
      setSharedAccountId(sharedAccount.id);
      useSavingsStore.getState().setSharedAccountId(sharedAccount.id);
      await setSharedMode(true);
      subscribeToSharedMovements(sharedAccount.id);
      await loadSharedData(sharedAccount.id);
      await useSavingsStore.getState().loadSharedHuchas(sharedAccount.id);
      await applyRecurringMovements();
      await loadSharedCategories(sharedAccount.id);
      useSharedCategoryStore.getState().subscribeToSharedCategories(sharedAccount.id);
      await loadSharedSettings(sharedAccount.id);
      navigation.navigate('HomeTab');
    } else {
      setTimeout(() => navigation.navigate('Settings', { screen: 'SharedAccount' }), 300);
    }
  };

  // En la compartida, su foto; sin ella, hasta dos miembros (foto o inicial).
  // En la individual, la propia
  const avatars: { uri?: string | null; initial: string }[] = isSharedMode && sharedAccount
    ? sharedAccount.photoURL
      ? [{ uri: sharedAccount.photoURL, initial: initialOf(sharedAccount.name) }]
      : sharedAccount.members.slice(0, 2).map((uid) => ({
        uri: getMemberPhoto(sharedAccount, uid),
        initial: initialOf(sharedAccount.memberNames?.[uid]),
      }))
    : [{ uri: photoURL, initial: initialOf(displayName || t('common.user')) }];

  const label = isSharedMode
    ? (sharedAccount?.name ?? t('sharedAccount.switchToShared'))
    : t('header.individualAccount');

  const option = (
    selected: boolean, onPress: () => void, icon: IconName,
    title: string, subtitle: string, badge?: boolean, photo?: string | null,
  ) => (
    <TouchableOpacity
      style={[styles.option, selected && { backgroundColor: ui.accentSoft }]}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <Avatar uri={photo} style={[styles.optionIcon, { backgroundColor: selected ? ui.sheet : ui.field }]}>
        <Icon name={icon} size={20} color={ui.accent} />
      </Avatar>
      <View style={styles.optionInfo}>
        <View style={styles.optionTitleRow}>
          <Text style={[styles.optionTitle, { color: dc.textPrimary }]} numberOfLines={1}>{title}</Text>
          {badge && (
            <View style={[styles.premiumBadge, { backgroundColor: dc.savings + '22' }]}>
              <Text style={[styles.premiumBadgeText, { color: ui.savingsText }]}>{t('premium.badge')}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.optionSubtitle, { color: dc.textSecondary }]} numberOfLines={1}>{subtitle}</Text>
      </View>
      <View style={[styles.check, selected ? { backgroundColor: ui.accent } : { borderColor: ui.hair2, borderWidth: 1.5 }]}>
        {selected && <Icon name="checkmark" size={15} color={ui.onAccent} />}
      </View>
    </TouchableOpacity>
  );

  return (
    <>
      <View ref={targetRef} collapsable={false}>
        <TouchableOpacity
          style={[styles.pill, { backgroundColor: ui.heroFill }]}
          onPress={() => setShowSheet(true)}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={t('header.selectAccount')}
        >
          <View style={styles.avatars}>
            {avatars.map((avatar, i) => (
              <Avatar
                key={i}
                uri={avatar.uri}
                style={[
                  styles.avatar,
                  { backgroundColor: i === 0 ? '#FFFFFF' : 'rgba(255,255,255,0.78)', borderColor: ui.hero },
                  i > 0 && styles.avatarOverlap,
                ]}
              >
                <Text style={[styles.avatarText, { color: ui.hero }]}>{avatar.initial}</Text>
              </Avatar>
            ))}
          </View>
          <Text style={[styles.pillText, { color: ui.onHero }]} numberOfLines={1}>{label}</Text>
          <Icon name="chevron-down" size={15} color={ui.onHero} />
        </TouchableOpacity>
      </View>

      <BottomSheet
        visible={showSheet}
        onClose={() => setShowSheet(false)}
        title={t('header.selectAccount')}
        scrollable={false}
      >
        {option(
          !isSharedMode, handleSelectIndividual, 'person',
          t('header.individualAccount'), t('header.individualAccountSubtitle'),
          false, photoURL,
        )}
        {option(
          isSharedMode, handleSelectShared, 'people',
          sharedAccount?.name ?? t('sharedAccount.switchToShared'),
          sharedAccount
            ? `${sharedAccount.members.length} ${t('sharedAccount.members').toLowerCase()}`
            : t('header.sharedAccountSubtitle'),
          !isPremium, sharedAccount?.photoURL,
        )}
      </BottomSheet>

      <PremiumModal
        visible={showPremiumModal}
        onDismiss={() => setShowPremiumModal(false)}
        onPurchase={() => setShowPremiumModal(false)}
      />
    </>
  );
};

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 999, paddingLeft: 5, paddingRight: 12, paddingVertical: 5, maxWidth: 230,
  },
  avatars: { flexDirection: 'row' },
  avatar: {
    width: 28, height: 28, borderRadius: 14, borderWidth: 2,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarOverlap: { marginLeft: -9 },
  avatarText: { fontSize: 12, fontFamily: 'Poppins_700Bold' },
  pillText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', flexShrink: 1 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, borderRadius: 16, marginHorizontal: -4, marginBottom: 4,
  },
  optionIcon: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  optionInfo: { flex: 1, minWidth: 0 },
  optionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  optionTitle: { fontSize: 15, fontFamily: 'Poppins_600SemiBold', flexShrink: 1 },
  optionSubtitle: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 1 },
  premiumBadge: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  premiumBadgeText: { fontSize: 10, fontFamily: 'Poppins_600SemiBold' },
  check: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
});

export default AccountSwitcher;
