import React, { useState } from 'react';
import {
  View, StyleSheet, TouchableOpacity,
  StatusBar, Platform, Modal,
} from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { usePremiumStore } from '../../store/premiumStore';
import { useSharedAccountStore } from '../../store/sharedAccountStore';
import { useMovementStore } from '../../store/movementStore';
import { colors } from '../../theme';
import PremiumModal from './PremiumModal';

interface Props {
  title: string;
  onBellPress?: () => void;
  showBell?: boolean;
  showAccountSelector?: boolean;
}

const AppHeader = ({
  title,
  onBellPress,
  showBell = true,
  showAccountSelector = false,
}: Props) => {
  const { colors: dc, isDark } = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { isPremium } = usePremiumStore();
  const {
    sharedAccount, isSharedMode,
    setSharedMode,
  } = useSharedAccountStore();
  const { loadData, loadSharedData } = useMovementStore();

  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);

  const isInSettings = route.name === 'Settings';
  const isInReminders = route.name === 'Reminders';

  const headerBg = isDark ? dc.surface : colors.secondary;
  const iconColor = isDark ? dc.textPrimary : '#FFFFFF';
  const titleColor = isDark ? dc.textPrimary : '#FFFFFF';
  const iconBg = isDark ? dc.border + '80' : 'rgba(255,255,255,0.15)';
  const bellIconColor = isInReminders ? colors.primaryLight : iconColor;
  const bellIconBg = isInReminders ? colors.primaryLight + '30' : iconBg;
  const settingsIconColor = isInSettings ? colors.primaryLight : iconColor;
  const settingsIconBg = isInSettings ? colors.primaryLight + '30' : iconBg;

  const paddingTop = Platform.OS === 'android'
    ? (StatusBar.currentHeight ?? 0) + 12
    : insets.top + 12;

  const modalPaddingTop = Platform.OS === 'android'
    ? (StatusBar.currentHeight ?? 0) + 60
    : insets.top + 60;

  const handleBellPress = () => {
    if (!isInReminders) navigation.navigate('Reminders');
    if (onBellPress) onBellPress();
  };

  const handleSelectIndividual = async () => {
    setShowAccountModal(false);
    if (isSharedMode) {
      await setSharedMode(false);
      await loadData();
      navigation.navigate('HomeTab');
    }
  };

  const handleSelectShared = async () => {
    setShowAccountModal(false);
    if (!isPremium) {
      setTimeout(() => setShowPremiumModal(true), 300);
      return;
    }
    if (sharedAccount) {
      await loadSharedData(sharedAccount.id);
      await setSharedMode(true);
      navigation.navigate('HomeTab');
    } else {
      setTimeout(() => navigation.navigate('SharedAccount'), 300);
    }
  };

  return (
    <>
      <View style={[styles.container, { backgroundColor: headerBg, paddingTop }]}>
        {/* CAMPANA */}
        {showBell ? (
          <TouchableOpacity
            style={[styles.iconButton, { backgroundColor: bellIconBg }]}
            onPress={handleBellPress}
            activeOpacity={0.7}
          >
            <Ionicons name="notifications-outline" size={20} color={bellIconColor} />
          </TouchableOpacity>
        ) : (
          <View style={styles.iconPlaceholder} />
        )}

        {/* CENTRO */}
        {showAccountSelector ? (
          <TouchableOpacity
            style={styles.accountSelector}
            onPress={() => setShowAccountModal(true)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isSharedMode ? 'people' : 'person-circle-outline'}
              size={18}
              color={titleColor}
            />
            <Text style={[styles.accountText, { color: titleColor }]}>
              {isSharedMode
                ? (sharedAccount?.name ?? t('sharedAccount.switchToShared'))
                : t('header.individualAccount')}
            </Text>
            <Ionicons name="chevron-down" size={16} color={titleColor} />
          </TouchableOpacity>
        ) : (
          <Text style={[styles.title, { color: titleColor }]}>{title}</Text>
        )}

        {/* TUERCA */}
        <TouchableOpacity
          style={[styles.iconButton, { backgroundColor: settingsIconBg }]}
          onPress={() => { if (!isInSettings) navigation.navigate('Settings'); }}
          activeOpacity={0.7}
        >
          <Ionicons name="settings-outline" size={20} color={settingsIconColor} />
        </TouchableOpacity>
      </View>

      {/* MODAL SELECTOR DE CUENTA */}
      <Modal
        visible={showAccountModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAccountModal(false)}
      >
        <View style={[styles.modalOverlay, { paddingTop: modalPaddingTop }]}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowAccountModal(false)}
          />
          <View style={[styles.accountModal, {
            backgroundColor: isDark ? colors.surfaceDark : '#FFFFFF',
          }]}>
            <Text style={[styles.accountModalTitle, { color: dc.textSecondary }]}>
              {t('header.selectAccount')}
            </Text>

            {/* INDIVIDUAL */}
            <TouchableOpacity
              style={[styles.accountOption, { borderBottomColor: dc.border }]}
              onPress={handleSelectIndividual}
            >
              <View style={[styles.accountOptionIcon, { backgroundColor: colors.primary + '20' }]}>
                <Ionicons name="person" size={20} color={colors.primary} />
              </View>
              <View style={styles.accountOptionInfo}>
                <Text style={[styles.accountOptionTitle, { color: dc.textPrimary }]}>
                  {t('header.individualAccount')}
                </Text>
                <Text style={[styles.accountOptionSubtitle, { color: dc.textSecondary }]}>
                  {t('header.individualAccountSubtitle')}
                </Text>
              </View>
              {!isSharedMode && (
                <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
              )}
            </TouchableOpacity>

            {/* COMPARTIDA */}
            <TouchableOpacity
              style={styles.accountOption}
              onPress={handleSelectShared}
            >
              <View style={[styles.accountOptionIcon, { backgroundColor: colors.savings + '20' }]}>
                <Ionicons name="people" size={20} color={colors.savings} />
              </View>
              <View style={styles.accountOptionInfo}>
                <View style={styles.accountOptionTitleRow}>
                  <Text style={[styles.accountOptionTitle, { color: dc.textPrimary }]}>
                    {sharedAccount?.name ?? t('sharedAccount.switchToShared')}
                  </Text>
                  {!isPremium && (
                    <View style={styles.premiumBadge}>
                      <Text style={styles.premiumBadgeText}>⭐ PREMIUM</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.accountOptionSubtitle, { color: dc.textSecondary }]}>
                  {sharedAccount
                    ? `${sharedAccount.members.length} ${t('sharedAccount.members').toLowerCase()}`
                    : t('header.sharedAccountSubtitle')}
                </Text>
              </View>
              {isSharedMode && (
                <Ionicons name="checkmark-circle" size={22} color={colors.savings} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL PREMIUM */}
      <PremiumModal
        visible={showPremiumModal}
        onDismiss={() => setShowPremiumModal(false)}
        onPurchase={() => setShowPremiumModal(false)}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  iconButton: {
    width: 38, height: 38, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  iconPlaceholder: { width: 38, height: 38 },
  title: {
    fontSize: 16, fontFamily: 'Poppins_600SemiBold',
    flex: 1, textAlign: 'center',
  },
  accountSelector: {
    flexDirection: 'row', alignItems: 'center',
    gap: 6, flex: 1, justifyContent: 'center',
  },
  accountText: { fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  modalOverlay: {
    flex: 1, justifyContent: 'flex-start',
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalBackdrop: { ...StyleSheet.absoluteFillObject },
  accountModal: { borderRadius: 20, overflow: 'hidden', elevation: 8 },
  accountModalTitle: {
    fontSize: 12, fontFamily: 'Poppins_600SemiBold',
    textTransform: 'uppercase', letterSpacing: 0.8,
    padding: 16, paddingBottom: 8,
  },
  accountOption: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, gap: 12, borderBottomWidth: 0.5,
  },
  accountOptionIcon: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  accountOptionInfo: { flex: 1 },
  accountOptionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accountOptionTitle: { fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  accountOptionSubtitle: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 2 },
  premiumBadge: {
    backgroundColor: colors.savings + '20',
    borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2,
  },
  premiumBadgeText: {
    fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: colors.savings,
  },
});

export default AppHeader;