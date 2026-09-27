import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, Linking } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import Purchases, { PurchasesOffering, PURCHASES_ERROR_CODE } from 'react-native-purchases';
import { useTheme } from '../../hooks/useTheme';
import { usePremiumStore } from '../../store/premiumStore';
import { ensurePurchasesUser, hasPremiumEntitlement } from '../../services/revenuecat';
import { reportError } from '../../services/crashReporting';
import HeroDialog from './HeroDialog';
import { SheetButton } from './BottomSheet';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  onPurchase: () => void;
}

const FEATURES: { key: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'premium.featureSharedAccount', icon: 'people-outline' },
  { key: 'premium.featureCustomCategories', icon: 'pricetags-outline' },
  { key: 'premium.featureUnlimitedRecurring', icon: 'repeat-outline' },
  { key: 'premium.featureUnlimitedHuchas', icon: 'cash-outline' },
  { key: 'premium.featureCustomColor', icon: 'color-palette-outline' },
];

const PremiumModal = ({ visible, onDismiss, onPurchase }: Props) => {
  const { t } = useTranslation();
  const { colors: dc, ui } = useTheme();
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
        Alert.alert(t('common.error'), t('premium.errorNoProduct', 'Producto no encontrado.'));
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
      Alert.alert(t('common.error'), t('premium.errorPurchase', 'Ha ocurrido un error con la compra.'));
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
      Alert.alert(t('common.error'), t('premium.errorRestore', 'Error al restaurar las compras.'));
    } finally {
      setRestoring(false);
    }
  };

  const busy = loading || restoring;

  return (
    <HeroDialog
      visible={visible}
      onRequestClose={onDismiss}
      onClose={onDismiss}
      closeDisabled={busy}
      icon="star"
      title={t('premium.title')}
      heroExtra={(
        <>
          <Text style={[styles.price, { color: ui.onHero }]}>2,99€</Text>
          <Text style={[styles.tax, { color: ui.onHeroSoft }]}>{t('premium.taxNote')}</Text>
        </>
      )}
    >
      <Text style={[styles.featuresTitle, { color: dc.textSecondary }]}>{t('premium.includes')}</Text>
      {FEATURES.map(({ key, icon }) => (
        <View key={key} style={styles.featureRow}>
          <View style={[styles.featureIcon, { backgroundColor: ui.accentSoft }]}>
            <Ionicons name={icon} size={18} color={ui.accent} />
          </View>
          <Text style={[styles.featureText, { color: dc.textPrimary }]}>{t(key)}</Text>
        </View>
      ))}

      <SheetButton
        label={t('premium.purchase')}
        onPress={handlePurchase}
        loading={loading}
        disabled={restoring}
        style={styles.purchase}
      />

      <TouchableOpacity onPress={handleRestore} disabled={busy} style={styles.restore}>
        {restoring
          ? <ActivityIndicator size={16} color={dc.textSecondary} />
          : <Text style={[styles.restoreText, { color: ui.accent }]}>{t('premium.restore')}</Text>}
      </TouchableOpacity>

      <View style={styles.legal}>
        <TouchableOpacity onPress={() => Linking.openURL('https://oskartech.github.io/terms.html')}>
          <Text style={[styles.legalText, { color: dc.textSecondary }]}>{t('settings.termsOfService')}</Text>
        </TouchableOpacity>
        <Text style={[styles.legalDot, { color: dc.textSecondary }]}>·</Text>
        <TouchableOpacity onPress={() => Linking.openURL('https://oskartech.github.io/privacy.html')}>
          <Text style={[styles.legalText, { color: dc.textSecondary }]}>{t('settings.privacyPolicy')}</Text>
        </TouchableOpacity>
      </View>
    </HeroDialog>
  );
};

const styles = StyleSheet.create({
  price: { fontSize: 30, fontFamily: 'Poppins_700Bold', letterSpacing: -0.8, marginTop: 2 },
  tax: { fontSize: 11.5, fontFamily: 'Poppins_400Regular', textAlign: 'center', marginTop: 2 },
  featuresTitle: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', marginBottom: 6 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  featureIcon: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  featureText: { flex: 1, fontSize: 14.5, fontFamily: 'Poppins_500Medium' },
  purchase: { marginTop: 18 },
  restore: { paddingVertical: 12, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  restoreText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold' },
  legal: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  legalText: { fontSize: 11.5, fontFamily: 'Poppins_400Regular', textDecorationLine: 'underline', opacity: 0.8 },
  legalDot: { fontSize: 11.5, opacity: 0.6 },
});

export default PremiumModal;
