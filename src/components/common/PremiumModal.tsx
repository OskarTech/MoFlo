import React, { useState } from 'react';
import {
  View, StyleSheet, Modal,
  TouchableOpacity, Alert,
} from 'react-native';
import { Text, Button, ActivityIndicator } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import Purchases, { PurchasesOffering } from 'react-native-purchases';
import { useTheme } from '../../hooks/useTheme';
import { usePremiumStore } from '../../store/premiumStore';
import { colors } from '../../theme';

const REVENUECAT_API_KEY = 'goog_SAFOqDvIHgdKmDuegCaDuzpfZFr';

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
  const { setPremium } = usePremiumStore();
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const handlePurchase = async () => {
    setLoading(true);
    try {
      await Purchases.configure({ apiKey: REVENUECAT_API_KEY });
      const offerings = await Purchases.getOfferings();
      const offering: PurchasesOffering | null = offerings.current;

      if (!offering || !offering.lifetime) {
        Alert.alert('Error', t('premium.errorNoProduct'));
        return;
      }

      const { customerInfo } = await Purchases.purchasePackage(offering.lifetime);

      if (customerInfo.entitlements.active['premium']) {
        await setPremium(true);
        onPurchase();
        Alert.alert('✅', t('premium.successMessage'));
      }
    } catch (e: any) {
      if (!e.userCancelled) {
        Alert.alert('Error', t('premium.errorPurchase'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      await Purchases.configure({ apiKey: REVENUECAT_API_KEY });
      const customerInfo = await Purchases.restorePurchases();

      if (customerInfo.entitlements.active['premium']) {
        await setPremium(true);
        onPurchase();
        Alert.alert('✅', t('premium.restoreSuccess'));
      } else {
        Alert.alert('', t('premium.restoreNotFound'));
      }
    } catch (e) {
      Alert.alert('Error', t('premium.errorRestore'));
    } finally {
      setRestoring(false);
    }
  };

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

          {/* BOTÓN COMPRAR */}
          <Button
            mode="contained"
            onPress={handlePurchase}
            loading={loading}
            disabled={loading || restoring}
            style={styles.purchaseButton}
            contentStyle={styles.purchaseButtonContent}
            buttonColor={colors.primary}
            textColor="#FFFFFF"
          >
            {t('premium.purchase')}
          </Button>

          {/* RESTAURAR COMPRA */}
          <TouchableOpacity
            onPress={handleRestore}
            disabled={loading || restoring}
            style={styles.restoreButton}
          >
            {restoring
              ? <ActivityIndicator size={16} color={dc.textSecondary} />
              : (
                <Text style={[styles.restoreText, { color: dc.textSecondary }]}>
                  {t('premium.restore')}
                </Text>
              )
            }
          </TouchableOpacity>

          {/* QUIZÁS MÁS TARDE */}
          <TouchableOpacity
            onPress={onDismiss}
            disabled={loading || restoring}
            style={styles.dismissButton}
          >
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
  header: { padding: 24, alignItems: 'center' },
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
  featureText: { fontSize: 15, fontFamily: 'Poppins_500Medium' },
  purchaseButton: { marginHorizontal: 24, borderRadius: 12 },
  purchaseButtonContent: { height: 52 },
  restoreButton: { padding: 12, alignItems: 'center' },
  restoreText: { fontSize: 13, fontFamily: 'Poppins_400Regular' },
  dismissButton: { paddingBottom: 16, alignItems: 'center' },
  dismissText: { fontSize: 14, fontFamily: 'Poppins_500Medium' },
});

export default PremiumModal;