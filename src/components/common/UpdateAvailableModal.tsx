import React from 'react';
import {
  View, StyleSheet, Modal,
  TouchableOpacity, Linking, Platform, ScrollView,
} from 'react-native';
import { Text, Button } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { colors } from '../../theme';

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
  const { isDark, colors: dc } = useTheme();

  const handleUpdate = () => {
    const url = Platform.OS === 'ios' ? iosUrl : androidUrl;
    if (url) Linking.openURL(url).catch(() => {});
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={forced ? () => {} : onDismiss}
    >
      <View style={styles.overlay}>
        {!forced && (
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onDismiss} />
        )}
        <View style={[styles.card, {
          backgroundColor: isDark ? colors.surfaceDark : '#FFFFFF',
        }]}>

          <View style={[styles.header, { backgroundColor: colors.primary }]}>
            <Ionicons name="rocket" size={36} color="#FFFFFF" />
            <Text style={styles.headerTitle}>{t('update.title')}</Text>
            <Text style={styles.headerVersion}>
              {t('update.versionLabel', { version: latestVersion })}
            </Text>
          </View>

          <View style={styles.body}>
            <Text style={[styles.subtitle, { color: dc.textPrimary }]}>
              {forced ? t('update.subtitleForced') : t('update.subtitle')}
            </Text>

            {releaseNotes ? (
              <View style={styles.notesContainer}>
                <Text style={[styles.notesTitle, { color: dc.textSecondary }]}>
                  {t('update.whatsNew')}
                </Text>
                <ScrollView style={styles.notesScroll}>
                  <Text style={[styles.notesText, { color: dc.textPrimary }]}>
                    {releaseNotes}
                  </Text>
                </ScrollView>
              </View>
            ) : null}

            <Button
              mode="contained"
              onPress={handleUpdate}
              style={styles.updateButton}
              contentStyle={styles.updateButtonContent}
              buttonColor={colors.primary}
              textColor="#FFFFFF"
            >
              {t('update.updateNow')}
            </Button>

            {!forced && (
              <TouchableOpacity onPress={onDismiss} style={styles.laterButton}>
                <Text style={[styles.laterText, { color: dc.textSecondary }]}>
                  {t('update.later')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1, justifyContent: 'center',
    alignItems: 'center', padding: 24,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  backdrop: { ...StyleSheet.absoluteFillObject },
  card: {
    width: '100%', borderRadius: 24,
    overflow: 'hidden', elevation: 8,
  },
  header: { padding: 24, alignItems: 'center', gap: 6 },
  headerTitle: {
    fontSize: 22, fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF', marginTop: 4, textAlign: 'center',
  },
  headerVersion: {
    fontSize: 13, fontFamily: 'Poppins_500Medium',
    color: 'rgba(255,255,255,0.85)',
  },
  body: { padding: 24 },
  subtitle: {
    fontSize: 14, fontFamily: 'Poppins_400Regular',
    textAlign: 'center', marginBottom: 16, lineHeight: 20,
  },
  notesContainer: { marginBottom: 16 },
  notesTitle: {
    fontSize: 12, fontFamily: 'Poppins_600SemiBold',
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: 8,
  },
  notesScroll: { maxHeight: 140 },
  notesText: {
    fontSize: 13, fontFamily: 'Poppins_400Regular',
    lineHeight: 19,
  },
  updateButton: { borderRadius: 12 },
  updateButtonContent: { height: 50 },
  laterButton: { paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  laterText: { fontSize: 14, fontFamily: 'Poppins_500Medium' },
});

export default UpdateAvailableModal;
