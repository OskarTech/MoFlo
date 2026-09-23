import React, { useState } from 'react';
import {
  View, StyleSheet, Modal,
  TouchableOpacity, Alert, Linking
} from 'react-native';
import { Text, Button, ActivityIndicator } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import Purchases, { PurchasesOffering, PURCHASES_ERROR_CODE } from 'react-native-purchases';
import { useTheme } from '../../hooks/useTheme';
import { usePremiumStore } from '../../store/premiumStore';
import { colors } from '../../theme';
import { ensurePurchasesUser, hasPremiumEntitlement } from '../../services/revenuecat';
import { reportError } from '../../services/crashReporting';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  onPurchase: () => void;
}

const FEATURES = [
  'premium.featureSharedAccount',
  'premium.featureCustomCategories',
  'premium.featureExportCSV',
  'premium.featureUnlimitedRecurring',
  'premium.featureUnlimitedHuchas',
  'premium.featureCustomColor',
];

const PremiumModal = ({ visible, onDismiss, onPurchase }: Props) => {
  const { t } = useTranslation();
  const { isDark, colors: dc } = useTheme();
  const { setPremium } = usePremiumStore();
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Restauración sin avisos: la usan tanto el botón como la compra que la
  // tienda rechaza por estar el producto ya comprado.
  const applyRestore = async (): Promise<boolean> => {
    await ensurePurchasesUser();
    const customerInfo = await Purchases.restorePurchases();

    if (!hasPremiumEntitlement(customerInfo)) return false;

    await setPremium(true);
    onPurchase();
    return true;
  };

  const handlePurchase = async () => {
    setLoading(true);
    try {
      // Identifica al usuario en RevenueCat ANTES de comprar: si no, la compra
      // puede acabar registrada bajo el usuario anónimo del SDK y perderse.
      await ensurePurchasesUser();
      const offerings = await Purchases.getOfferings();
      const offering: PurchasesOffering | null = offerings.current;

      if (!offering || !offering.lifetime) {
        Alert.alert('Error', t('premium.errorNoProduct', 'Producto no encontrado.'));
        return;
      }

      const { customerInfo } = await Purchases.purchasePackage(offering.lifetime);

      if (hasPremiumEntitlement(customerInfo)) {
        await setPremium(true);
        onPurchase();
        Alert.alert('✅', t('premium.successMessage', '¡Gracias por tu compra!'));
      }
    } catch (e: any) {
      if (e?.userCancelled) return;

      // La tienda responde que este producto ya está comprado con esta cuenta.
      // No es un error que enseñar: es una compra que hay que restaurar.
      if (e?.code === PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR ||
          e?.code === PURCHASES_ERROR_CODE.RECEIPT_ALREADY_IN_USE_ERROR) {
        try {
          if (await applyRestore()) {
            Alert.alert('✅', t('premium.restoreSuccess', 'Compras restauradas con éxito.'));
            return;
          }
        } catch (restoreError) {
          reportError(restoreError, 'PremiumModal: restaurar tras compra ya poseída');
        }
        // La compra existe en la tienda pero está atada a otra cuenta de MoFlo.
        reportError(e, 'PremiumModal: compra ya poseída');
        Alert.alert('', t('premium.alreadyOwned'));
        return;
      }

      reportError(e, 'PremiumModal: compra');
      Alert.alert('Error', t('premium.errorPurchase', 'Ha ocurrido un error con la compra.'));
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      if (await applyRestore()) {
        Alert.alert('✅', t('premium.restoreSuccess', 'Compras restauradas con éxito.'));
      } else {
        Alert.alert('', t('premium.restoreNotFound', 'No se han encontrado compras para restaurar.'));
      }
    } catch (e) {
      reportError(e, 'PremiumModal: restaurar');
      Alert.alert('Error', t('premium.errorRestore', 'Error al restaurar las compras.'));
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onDismiss} />
        <View style={[styles.card, {
          backgroundColor: isDark ? colors.surfaceDark : '#FFFFFF',
        }]}>

          {/* HEADER */}
          <View style={[styles.header, { backgroundColor: colors.primary }]}>
            <Text style={styles.headerEmoji}>⭐</Text>
            <Text style={styles.headerTitle}>{t('premium.title')}</Text>
            <Text style={styles.headerPrice}>2,99€</Text>
            <Text style={styles.headerTax}>{t('premium.taxNote')}</Text>
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

          {/* RESTAURAR */}
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

          {/* ENLACES LEGALES */}
          <View style={styles.legalContainer}>
            <TouchableOpacity onPress={() => Linking.openURL('https://oskartech.github.io/terms.html')}>
              <Text style={[styles.legalText, { color: dc.textSecondary }]}>Términos de Servicio</Text>
            </TouchableOpacity>
            <Text style={[styles.legalSeparator, { color: dc.textSecondary }]}>|</Text>
            <TouchableOpacity onPress={() => Linking.openURL('https://oskartech.github.io/privacy.html')}>
              <Text style={[styles.legalText, { color: dc.textSecondary }]}>Política de Privacidad</Text>
            </TouchableOpacity>
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
  header: { padding: 24, alignItems: 'center' },
  headerEmoji: { fontSize: 40, marginBottom: 8 },
  headerTitle: {
    fontSize: 24, fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF', marginBottom: 4,
  },
  headerPrice: {
    fontSize: 28, fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
  },
  headerTax: {
    fontSize: 11, fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.6)',
    marginTop: 4, textAlign: 'center',
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
  restoreButton: { padding: 12, alignItems: 'center', marginTop: 4 },
  restoreText: { fontSize: 13, fontFamily: 'Poppins_400Regular' },
  dismissButton: { paddingBottom: 16, alignItems: 'center' },
  dismissText: { fontSize: 14, fontFamily: 'Poppins_500Medium' },
  legalContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 24,
    gap: 8,
  },
  legalText: {
    fontSize: 11,
    fontFamily: 'Poppins_400Regular',
    textDecorationLine: 'underline',
    opacity: 0.7,
  },
  legalSeparator: {
    fontSize: 11,
    opacity: 0.5,
  },
});

export default PremiumModal;