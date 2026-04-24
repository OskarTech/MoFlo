import React, { useState, useEffect } from 'react';
import {
  View, StyleSheet, ScrollView,
  TouchableOpacity, Modal, FlatList,
} from 'react-native';
import { Text, TextInput, ActivityIndicator } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import auth from '@react-native-firebase/auth';
import { useSettingsStore, CURRENCIES, LANGUAGES, ThemeMode } from '../../store/settingsStore';
import { useTheme } from '../../hooks/useTheme';
import { colors } from '../../theme';
import AppHeader from '../../components/common/AppHeader';

const OptionRow = ({
  icon, iconColor, label, value, onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string; label: string;
  value?: string; onPress: () => void;
}) => {
  const { colors: dc } = useTheme();
  return (
    <TouchableOpacity style={styles.optionRow} onPress={onPress}>
      <View style={styles.optionLeft}>
        <View style={[styles.optionIcon, { backgroundColor: iconColor + '20' }]}>
          <Ionicons name={icon} size={20} color={iconColor} />
        </View>
        <Text style={[styles.optionLabel, { color: dc.textPrimary }]}>{label}</Text>
      </View>
      <View style={styles.optionRight}>
        {value && (
          <Text style={[styles.optionValue, { color: dc.textSecondary }]}>{value}</Text>
        )}
        <Ionicons name="chevron-forward" size={18} color={dc.textSecondary} />
      </View>
    </TouchableOpacity>
  );
};

const SelectModal = ({
  visible, title, options, selectedValue, onSelect, onDismiss,
}: {
  visible: boolean; title: string;
  options: { code: string; label: string }[];
  selectedValue: string;
  onSelect: (code: string) => void;
  onDismiss: () => void;
}) => {
  const { isDark, colors: dc } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onDismiss} />
        <View style={[styles.modalSheet, {
          backgroundColor: isDark ? colors.surfaceDark : '#FFFFFF',
        }]}>
          <View style={[styles.modalHandle, { backgroundColor: dc.border }]} />
          <Text style={[styles.modalTitle, { color: dc.textPrimary }]}>{title}</Text>
          <FlatList
            data={options}
            keyExtractor={(item) => item.code}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.modalOption, { borderBottomColor: dc.border }]}
                onPress={() => { onSelect(item.code); onDismiss(); }}
              >
                <Text style={[
                  styles.modalOptionText,
                  { color: dc.textPrimary },
                  item.code === selectedValue && {
                    color: colors.primary,
                    fontFamily: 'Poppins_600SemiBold',
                  },
                ]}>
                  {item.label}
                </Text>
                {item.code === selectedValue && (
                  <Ionicons name="checkmark" size={20} color={colors.primary} />
                )}
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );
};

const ProfileScreen = () => {
  const { t } = useTranslation();
  const { colors: dc } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const {
    displayName, currencyCode, language, themeMode, saveSettings,
  } = useSettingsStore();

  const user = auth().currentUser;
  const [nameInput, setNameInput] = useState(displayName ?? '');
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);

  useEffect(() => {
    setNameInput(displayName ?? '');
  }, [displayName]);

  const initials = displayName
    ? displayName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0].toUpperCase() ?? '?';

  const memberSince = user?.metadata?.creationTime
    ? new Date(user.metadata.creationTime).toLocaleDateString()
    : '—';

  const handleSaveName = async () => {
    if (!nameInput.trim()) return;
    await saveSettings({ displayName: nameInput.trim() });
  };

  const THEME_OPTIONS: { code: ThemeMode; label: string }[] = [
    { code: 'auto', label: t('settings.themeAuto') },
    { code: 'light', label: t('settings.themeLight') },
    { code: 'dark', label: t('settings.themeDark') },
  ];

  const selectedCurrencyLabel =
    CURRENCIES.find((c) => c.code === currencyCode)?.label ?? 'Euro (€)';
  const selectedLanguageLabel =
    LANGUAGES.find((l) => l.code === language)?.label ?? 'English';
  const selectedThemeLabel =
    THEME_OPTIONS.find((o) => o.code === themeMode)?.label ?? t('settings.themeAuto');

  return (
    <View style={[styles.container, { backgroundColor: dc.background }]}>
      <AppHeader title={t('header.profile')} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* AVATAR CON INICIALES */}
        <View style={styles.avatarSection}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarInitials}>{initials}</Text>
          </View>

          {/* NOMBRE EDITABLE */}
          <View style={styles.nameRow}>
            <TextInput
              value={nameInput}
              onChangeText={setNameInput}
              mode="flat"
              style={[styles.nameInput, { backgroundColor: 'transparent' }]}
              textColor={dc.textPrimary}
              underlineColor={dc.border}
              activeUnderlineColor={colors.primary}
              placeholder={t('settings.displayName')}
              placeholderTextColor={dc.textSecondary}
              right={
                <TextInput.Icon
                  icon="check-circle"
                  color={nameInput.trim() ? colors.primary : dc.border}
                  onPress={handleSaveName}
                />
              }
              onSubmitEditing={handleSaveName}
            />
          </View>

          <Text style={[styles.userEmail, { color: dc.textSecondary }]}>
            {user?.email ?? '—'}
          </Text>
          <Text style={[styles.memberSince, { color: dc.textSecondary }]}>
            {t('settings.memberSince')} {memberSince}
          </Text>
        </View>

        {/* PREFERENCIAS */}
        <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
          {t('settings.preferences')}
        </Text>
        <View style={[styles.card, { backgroundColor: dc.surface, borderColor: dc.border }]}>
          <OptionRow
            icon="cash-outline" iconColor={colors.income}
            label={t('settings.currency')} value={selectedCurrencyLabel}
            onPress={() => setShowCurrencyModal(true)}
          />
          <View style={[styles.divider, { backgroundColor: dc.border }]} />
          <OptionRow
            icon="language-outline" iconColor={colors.primary}
            label={t('settings.language')} value={selectedLanguageLabel}
            onPress={() => setShowLanguageModal(true)}
          />
          <View style={[styles.divider, { backgroundColor: dc.border }]} />
          <OptionRow
            icon="moon-outline" iconColor={colors.primaryDark}
            label={t('settings.theme')} value={selectedThemeLabel}
            onPress={() => setShowThemeModal(true)}
          />
        </View>

        {/* GESTIÓN */}
        <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
          Gestión
        </Text>
        <View style={[styles.card, { backgroundColor: dc.surface, borderColor: dc.border }]}>
          <OptionRow
            icon="repeat" iconColor={colors.savings}
            label={t('settings.recurring')}
            onPress={() => navigation.navigate('Recurring')}
          />
        </View>

        {/* MODALES */}
        <SelectModal
          visible={showCurrencyModal}
          title={t('settings.selectCurrency')}
          options={CURRENCIES.map((c) => ({ code: c.code, label: c.label }))}
          selectedValue={currencyCode}
          onSelect={(code) => saveSettings({ currencyCode: code })}
          onDismiss={() => setShowCurrencyModal(false)}
        />
        <SelectModal
          visible={showLanguageModal}
          title={t('settings.selectLanguage')}
          options={LANGUAGES}
          selectedValue={language}
          onSelect={(code) => saveSettings({ language: code })}
          onDismiss={() => setShowLanguageModal(false)}
        />
        <SelectModal
          visible={showThemeModal}
          title={t('settings.selectTheme')}
          options={THEME_OPTIONS}
          selectedValue={themeMode}
          onSelect={(code) => saveSettings({ themeMode: code as ThemeMode })}
          onDismiss={() => setShowThemeModal(false)}
        />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarInitials: {
    fontSize: 36,
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
  },
  nameRow: {
    width: '100%',
    paddingHorizontal: 32,
    marginBottom: 4,
  },
  nameInput: {
    fontSize: 22,
    fontFamily: 'Poppins_700Bold',
    textAlign: 'center',
  },
  userEmail: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    marginBottom: 4,
  },
  memberSince: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 20,
  },
  card: {
    marginHorizontal: 16,
    borderRadius: 16,
    marginBottom: 20,
    overflow: 'hidden',
    borderWidth: 0.5,
  },
  divider: { height: 0.5, marginLeft: 68 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionLabel: {
    fontSize: 15,
    fontFamily: 'Poppins_500Medium',
  },
  optionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  optionValue: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
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
    maxHeight: '60%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'Poppins_700Bold',
    marginBottom: 16,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 0.5,
  },
  modalOptionText: {
    fontSize: 15,
    fontFamily: 'Poppins_400Regular',
  },
});

export default ProfileScreen;