import React from 'react';
import {
  View, StyleSheet, Modal,
  TouchableOpacity,
} from 'react-native';
import { Text, Button } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { colors } from '../../theme';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  onPurchase: () => void;
}

const FEATURES = [
  'premium.featureSharedAccount',
  'premium.featureCustomCategories',
  'premium.featureExportCSV',
  'premium.featureCategoryFilter',
];

const PremiumModal = ({ visible, onDismiss, onPurchase }: Props) => {
  const { t } = useTranslation();
  const { isDark, colors: dc } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onDismiss} />
        <View style={[styles.card, { backgroundColor: isDark ? colors.surfaceDark : '#FFFFFF' }]}>

          {/* HEADER */}
          <View style={[styles.header, { backgroundColor: colors.primary }]}>
            <Text style={styles.headerEmoji}>⭐</Text>
            <Text style={styles.headerTitle}>{t('premium.title')}</Text>
            <Text style={styles.headerPrice}>{t('premium.price')}</Text>
          </View>

          {/* FEATURES */}
          <View style={styles.features}>
            <Text style={[styles.featuresTitle, { color: dc.textSecondary }]}>
              {t('premium.includes')}
            </Text>
            {FEATURES.map((key) => (
              <View key={key} style={styles.featureRow}>
                <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                <Text style={[styles.featureText, { color: dc.textPrimary }]}>
                  {t(key)}
                </Text>
              </View>
            ))}
          </View>

          {/* BOTONES */}
          <Button
            mode="contained"
            onPress={onPurchase}
            style={styles.purchaseButton}
            contentStyle={styles.purchaseButtonContent}
            buttonColor={colors.primary}
            textColor="#FFFFFF"
          >
            {t('premium.purchase')}
          </Button>

          <TouchableOpacity onPress={onDismiss} style={styles.dismissButton}>
            <Text style={[styles.dismissText, { color: dc.textSecondary }]}>
              {t('premium.maybeLater')}
            </Text>
          </TouchableOpacity>

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
  header: {
    padding: 24, alignItems: 'center',
  },
  headerEmoji: { fontSize: 40, marginBottom: 8 },
  headerTitle: {
    fontSize: 24, fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF', marginBottom: 4,
  },
  headerPrice: {
    fontSize: 16, fontFamily: 'Poppins_500Medium',
    color: 'rgba(255,255,255,0.8)',
  },
  features: { padding: 24 },
  featuresTitle: {
    fontSize: 12, fontFamily: 'Poppins_600SemiBold',
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: 16,
  },
  featureRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 12, marginBottom: 12,
  },
  featureText: {
    fontSize: 15, fontFamily: 'Poppins_500Medium',
  },
  purchaseButton: {
    marginHorizontal: 24, borderRadius: 12,
  },
  purchaseButtonContent: { height: 52 },
  dismissButton: {
    padding: 16, alignItems: 'center',
  },
  dismissText: {
    fontSize: 14, fontFamily: 'Poppins_500Medium',
  },
});

export default PremiumModal;