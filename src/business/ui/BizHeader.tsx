import React, { useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import Icon, { IconName } from '../../components/common/Icon';
import BottomSheet from '../../components/common/BottomSheet';
import PremiumModal from '../../components/common/PremiumModal';
import Avatar from '../../components/common/Avatar';
import { HeroIconButton, HeroTitleBar } from '../../components/layout/HeroBar';
import { useTheme } from '../../hooks/useTheme';
import { usePremiumStore } from '../../store/premiumStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useSharedAccountStore } from '../../store/sharedAccountStore';
import { navigationRef } from '../../navigation/navigationRef';
import { reportError } from '../../services/crashReporting';
import { beforeGap, splitAmountParts, symbolGoesBefore } from '../../utils/formatAmount';
import { useBusinessStore } from '../store/businessStore';
import { leaveBusinessMode } from '../store/switch';
import { templateInfo } from '../templates';

const initialOf = (name?: string | null) => (name?.trim()?.charAt(0) || '?').toUpperCase();

/**
 * La pastilla con la empresa, arriba a la izquierda, como la del selector de
 * Inicio: al tocarla se elige la cuenta (la individual, la compartida o la
 * empresa)
 */
export const BizSwitcher = () => {
  const { t } = useTranslation();
  const { colors: dc, ui } = useTheme();
  const business = useBusinessStore((s) => s.business);
  const isPremium = usePremiumStore((s) => s.isPremium);
  const sharedAccount = useSharedAccountStore((s) => s.sharedAccount);
  const photoURL = useSettingsStore((s) => s.photoURL);
  const [showSheet, setShowSheet] = useState(false);
  const [showPremium, setShowPremium] = useState(false);
  const icon = (business ? templateInfo(business.template).icon : 'business') as IconName;

  const goIndividual = () => {
    setShowSheet(false);
    leaveBusinessMode('individual').catch((e) => reportError(e, 'empresa: a la individual'));
  };
  const goShared = () => {
    setShowSheet(false);
    if (!isPremium) {
      setTimeout(() => setShowPremium(true), 300);
      return;
    }
    if (sharedAccount) {
      leaveBusinessMode('shared').catch((e) => reportError(e, 'empresa: a la compartida'));
    } else {
      // Sin compartida: se crea desde Ajustes, en la individual
      leaveBusinessMode('individual')
        .then((done) => {
          if (done && navigationRef.isReady()) navigationRef.navigate('Settings', { screen: 'SharedAccount' });
        })
        .catch((e) => reportError(e, 'empresa: crear compartida'));
    }
  };

  const option = (
    selected: boolean, onPress: () => void, optIcon: IconName, title: string, subtitle: string, photo?: string | null,
  ) => (
    <TouchableOpacity
      style={[styles.option, selected && { backgroundColor: ui.accentSoft }]}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <Avatar uri={photo} style={[styles.optionIcon, { backgroundColor: selected ? ui.sheet : ui.field }]}>
        <Icon name={optIcon} size={20} color={ui.accent} />
      </Avatar>
      <View style={styles.optionInfo}>
        <Text style={[styles.optionTitle, { color: dc.textPrimary }]} numberOfLines={1}>{title}</Text>
        <Text style={[styles.optionSubtitle, { color: dc.textSecondary }]} numberOfLines={1}>{subtitle}</Text>
      </View>
      <View style={[styles.check, selected ? { backgroundColor: ui.accent } : { borderColor: ui.hair2, borderWidth: 1.5 }]}>
        {selected && <Icon name="checkmark" size={15} color={ui.onAccent} />}
      </View>
    </TouchableOpacity>
  );

  return (
    <>
      <TouchableOpacity
        style={[styles.pill, { backgroundColor: ui.heroFill }]}
        onPress={() => setShowSheet(true)}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={t('header.selectAccount')}
      >
        <View style={[styles.avatar, { borderColor: ui.hero }]}>
          <Icon name={icon} size={15} color={ui.hero} />
        </View>
        <Text style={[styles.pillText, { color: ui.onHero }]} numberOfLines={1}>
          {business?.name ?? t('business.title')}
        </Text>
        <Icon name="chevron-down" size={15} color={ui.onHero} />
      </TouchableOpacity>

      <BottomSheet visible={showSheet} onClose={() => setShowSheet(false)} title={t('header.selectAccount')} scrollable={false}>
        {option(false, goIndividual, 'person', t('header.individualAccount'), t('header.individualAccountSubtitle'), photoURL)}
        {option(
          false, goShared, 'people',
          sharedAccount?.name ?? t('sharedAccount.switchToShared'),
          sharedAccount
            ? t('sharedAccount.memberCount', { count: sharedAccount.members.length })
            : t('header.sharedAccountSubtitle'),
          sharedAccount?.photoURL,
        )}
        {option(
          true, () => setShowSheet(false), icon,
          business?.name ?? t('business.title'),
          t('business.partnerCount', { count: business?.members.length ?? 1 }),
        )}
      </BottomSheet>

      <PremiumModal
        visible={showPremium}
        onDismiss={() => setShowPremium(false)}
        onPurchase={() => setShowPremium(false)}
      />
    </>
  );
};

/** La barra de arriba de las pantallas de la empresa: la pastilla y la tuerca */
export const BizHeroBar = ({ right }: { right?: React.ReactNode }) => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  return (
    <View style={styles.bar}>
      <BizSwitcher />
      <View style={styles.barRight}>
        {right}
        <HeroIconButton
          icon="settings-outline"
          onPress={() => navigation.navigate('BizSettings', { screen: 'BizSettingsMain' })}
          accessibilityLabel={t('business.settings.title')}
        />
      </View>
    </View>
  );
};

/** Importe grande de la cabecera: la parte entera, y los decimales y la moneda más pequeños */
export const HeroAmount = ({ amount, symbol }: { amount: number; symbol: string }) => {
  const { ui } = useTheme();
  const { intPart, decPart, decimalSeparator } = splitAmountParts(Math.abs(amount));
  const before = symbolGoesBefore(symbol);
  const lineHeight = Platform.OS === 'ios' ? 56 : 52;
  return (
    <View style={styles.amountRow}>
      {amount < 0 && <Text style={[styles.amountSign, { color: ui.onHero }]}>-</Text>}
      {before && <Text style={[styles.amountDec, beforeGap(symbol) ? styles.symbolSpaced : styles.symbolBefore]}>{symbol}</Text>}
      <Text style={[styles.amountInt, { color: ui.onHero, lineHeight }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
        {intPart}
      </Text>
      <Text style={styles.amountDec}>{decimalSeparator}{decPart}{before ? '' : ` ${symbol}`}</Text>
    </View>
  );
};

/** Una cifra pequeña de la cabecera, con su icono */
export const HeroStat = ({ icon, label, value, end }: { icon: IconName; label: string; value: string; end?: boolean }) => {
  const { ui } = useTheme();
  return (
    <View style={end && styles.statEnd}>
      <View style={[styles.statLabelRow, end && styles.statLabelRowEnd]}>
        <View style={styles.statIcon}><Icon name={icon} size={13} color={ui.onHero} /></View>
        <Text style={[styles.statLabel, { color: ui.onHeroSoft }]} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={[styles.statValue, { color: ui.onHero }]} numberOfLines={1}>{value}</Text>
    </View>
  );
};

/**
 * La cabecera de color de las pantallas de la empresa: la barra, una
 * etiqueta, el importe y, si hay, la barra de progreso y dos cifras
 */
export const BizHero = ({
  label, amount, symbol, track, caption, stats, right, below,
}: {
  label: string;
  amount: number;
  symbol: string;
  /** De 0 a 100 */
  track?: number | null;
  caption?: string | null;
  stats?: [React.ReactNode, React.ReactNode];
  right?: React.ReactNode;
  below?: React.ReactNode;
}) => {
  const { ui } = useTheme();
  const trackWidth = useMemo(() => Math.max(0, Math.min(100, track ?? 0)), [track]);
  return (
    <>
      <BizHeroBar right={right} />
      <View style={styles.hero}>
        <Text style={[styles.heroLabel, { color: ui.onHeroSoft }]} numberOfLines={1}>{label}</Text>
        <HeroAmount amount={amount} symbol={symbol} />
        {track != null ? (
          <View style={styles.track}><View style={[styles.trackFill, { width: `${trackWidth}%` }]} /></View>
        ) : null}
        {caption ? <Text style={[styles.caption, { color: ui.onHeroSoft }]} numberOfLines={2}>{caption}</Text> : null}
        {stats ? <View style={styles.stats}>{stats[0]}{stats[1]}</View> : null}
        {below}
      </View>
    </>
  );
};

/** La cabecera de una pantalla de detalle: título con flecha para volver, el importe y dos cifras */
export const BizDetailHero = ({
  title, onBack, label, amount, symbol, stats, caption, right,
}: {
  title: string;
  onBack: () => void;
  label?: string | null;
  amount?: number | null;
  symbol: string;
  stats?: [React.ReactNode, React.ReactNode];
  caption?: string | null;
  right?: React.ReactNode;
}) => {
  const { ui } = useTheme();
  return (
    <>
      <HeroTitleBar title={title} onBack={onBack} right={right} />
      {amount != null || label ? (
        <View style={styles.hero}>
          {label ? <Text style={[styles.heroLabel, { color: ui.onHeroSoft }]} numberOfLines={1}>{label}</Text> : null}
          {amount != null ? <HeroAmount amount={amount} symbol={symbol} /> : null}
          {stats ? <View style={styles.stats}>{stats[0]}{stats[1]}</View> : null}
          {caption ? <Text style={[styles.caption, { color: ui.onHeroSoft }]} numberOfLines={2}>{caption}</Text> : null}
        </View>
      ) : null}
    </>
  );
};

export { initialOf };

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingLeft: 18, paddingRight: 16, paddingTop: 8, minHeight: 54,
  },
  barRight: { marginLeft: 'auto', flexDirection: 'row', gap: 8 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1,
    borderRadius: 999, paddingLeft: 5, paddingRight: 12, paddingVertical: 5, maxWidth: 230,
  },
  avatar: {
    width: 28, height: 28, borderRadius: 14, borderWidth: 2, backgroundColor: '#FFFFFF',
    justifyContent: 'center', alignItems: 'center',
  },
  pillText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', flexShrink: 1 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, borderRadius: 16, marginHorizontal: -4, marginBottom: 4,
  },
  optionIcon: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  optionInfo: { flex: 1, minWidth: 0 },
  optionTitle: { fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  optionSubtitle: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 1 },
  check: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  hero: { paddingHorizontal: 20, paddingTop: 14 },
  heroLabel: { fontSize: 13.5, fontFamily: 'Poppins_500Medium' },
  amountRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 4 },
  amountSign: { fontSize: 40, fontFamily: 'Poppins_700Bold', lineHeight: 52, marginRight: 2 },
  amountInt: { fontSize: 48, fontFamily: 'Poppins_700Bold', letterSpacing: -1.5, flexShrink: 1 },
  amountDec: {
    color: 'rgba(255,255,255,0.8)', fontSize: 26,
    fontFamily: 'Poppins_600SemiBold', marginBottom: 6, marginLeft: 1,
  },
  symbolBefore: { marginLeft: 0, marginRight: 2 },
  symbolSpaced: { marginLeft: 0, marginRight: 7 },
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.22)', marginTop: 14, overflow: 'hidden' },
  trackFill: { height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' },
  caption: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 7 },
  stats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, gap: 12 },
  statEnd: { alignItems: 'flex-end' },
  statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 4 },
  statLabelRowEnd: { justifyContent: 'flex-end' },
  statIcon: {
    width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  statLabel: { fontSize: 12.5, fontFamily: 'Poppins_500Medium' },
  statValue: { fontSize: 18, fontFamily: 'Poppins_700Bold', letterSpacing: -0.3 },
});
