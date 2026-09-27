import React from 'react';
import { View, StyleSheet, Linking, Platform, ScrollView } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/useTheme';
import HeroDialog from './HeroDialog';
import { SheetButton } from './BottomSheet';

interface Props {
  visible: boolean;
  forced: boolean;
  latestVersion: string;
  releaseNotes?: string;
  iosUrl: string;
  androidUrl: string;
  onDismiss: () => void;
}

const UpdateAvailableModal = ({
  visible, forced, latestVersion, releaseNotes,
  iosUrl, androidUrl, onDismiss,
}: Props) => {
  const { t } = useTranslation();
  const { colors: dc, ui } = useTheme();

  const handleUpdate = () => {
    const url = Platform.OS === 'ios' ? iosUrl : androidUrl;
    if (url) Linking.openURL(url).catch(() => {});
  };

  return (
    <HeroDialog
      visible={visible}
      // Si es obligatoria, no se puede cerrar
      onRequestClose={forced ? () => {} : onDismiss}
      onClose={forced ? undefined : onDismiss}
      icon="rocket"
      title={t('update.title')}
      heroExtra={(
        <View style={[styles.version, { backgroundColor: ui.heroFill }]}>
          <Text style={[styles.versionText, { color: ui.onHero }]}>
            {t('update.versionLabel', { version: latestVersion })}
          </Text>
        </View>
      )}
    >
      <Text style={[styles.subtitle, { color: dc.textPrimary }]}>
        {forced ? t('update.subtitleForced') : t('update.subtitle')}
      </Text>

      {releaseNotes ? (
        <View style={[styles.notes, { backgroundColor: ui.field }]}>
          <Text style={[styles.notesTitle, { color: dc.textSecondary }]}>{t('update.whatsNew')}</Text>
          {/* Va dentro del desplazamiento de la ventana: en Android hace falta nestedScrollEnabled */}
          <ScrollView style={styles.notesScroll} nestedScrollEnabled>
            <Text style={[styles.notesText, { color: dc.textPrimary }]}>{releaseNotes}</Text>
          </ScrollView>
        </View>
      ) : null}

      <SheetButton label={t('update.updateNow')} onPress={handleUpdate} icon="arrow-down-circle-outline" />
    </HeroDialog>
  );
};

const styles = StyleSheet.create({
  version: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, marginTop: 8 },
  versionText: { fontSize: 12.5, fontFamily: 'Poppins_600SemiBold' },
  subtitle: { fontSize: 14, fontFamily: 'Poppins_400Regular', textAlign: 'center', lineHeight: 21, marginBottom: 16 },
  notes: { borderRadius: 16, padding: 14, marginBottom: 18 },
  notesTitle: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', marginBottom: 6 },
  notesScroll: { maxHeight: 140 },
  notesText: { fontSize: 13, fontFamily: 'Poppins_400Regular', lineHeight: 19 },
});

export default UpdateAvailableModal;
