import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSavingsStore } from '../../store/savingsStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useSharedAccountStore } from '../../store/sharedAccountStore';
import { useTheme } from '../../hooks/useTheme';
import { Hucha } from '../../types';
import { formatAmount as formatAmountLocalized } from '../../utils/formatAmount';
import { withAlpha } from '../../utils/color';
import { HeroScrollScreen } from '../../components/layout/HeroScreen';
import { HeroTitleBar, HeroChip } from '../../components/layout/HeroBar';
import { SectionHeader } from '../../components/layout/SheetSection';

// Los importes redondos se muestran sin decimales
const formatAmount = (n: number) => formatAmountLocalized(n, n % 1 === 0 ? 0 : 2);

const HuchaCard = ({ hucha, onPress }: { hucha: Hucha; onPress: () => void }) => {
  const { t } = useTranslation();
  const { colors: dc, ui } = useTheme();
  const { getCurrencySymbol } = useSettingsStore();
  const { isSharedMode, getSharedCurrencySymbol } = useSharedAccountStore();
  const currencySymbol = isSharedMode ? getSharedCurrencySymbol() : getCurrencySymbol();
  const hasTarget = hucha.targetAmount > 0;
  const pct = hasTarget
    ? Math.min(Math.round((hucha.currentAmount / hucha.targetAmount) * 100), 100)
    : 0;

  const isClosed = !!hucha.closedAt;

  // "Mes año" de la fecha objetivo (AAAA-MM), con el nombre del mes en el idioma de la app
  const targetDate = (() => {
    if (!hucha.targetDate) return '';
    const [year, month] = hucha.targetDate.split('-');
    const m = Number(month);
    return m >= 1 && m <= 12 ? `${t(`home.month_${m - 1}`).slice(0, 3)} ${year}` : hucha.targetDate;
  })();

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: ui.field }, isClosed && styles.closed]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.cardIcon, { backgroundColor: withAlpha(hucha.color, 0.16) }]}>
          <Ionicons
            name={isClosed ? 'checkmark-circle' : (hucha.icon as keyof typeof Ionicons.glyphMap)}
            size={22}
            color={hucha.color}
          />
        </View>
        <View style={styles.cardInfo}>
          <Text style={[styles.cardName, { color: dc.textPrimary }]} numberOfLines={1}>
            {hucha.name}
          </Text>
          <Text style={[styles.cardAmounts, { color: dc.textSecondary }]} numberOfLines={1}>
            {formatAmount(hucha.currentAmount)} {currencySymbol}
            {hasTarget ? ` ${t('hucha.of')} ${formatAmount(hucha.targetAmount)} ${currencySymbol}` : ` · ${t('hucha.accumulating')}`}
          </Text>
        </View>
        {hasTarget ? (
          <Text style={[styles.cardPct, { color: hucha.color }]}>{pct}%</Text>
        ) : (
          <Ionicons name="infinite" size={20} color={hucha.color} style={styles.noShrink} />
        )}
      </View>

      {hasTarget && (
        <View style={[styles.progressBar, { backgroundColor: withAlpha(hucha.color, 0.18) }]}>
          <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: hucha.color }]} />
        </View>
      )}

      {isClosed ? (
        <View style={styles.cardMetaRow}>
          <Ionicons name="lock-closed" size={12} color={dc.textSecondary} />
          <Text style={[styles.cardMeta, { color: dc.textSecondary }]}>{t('hucha.closedBadge')}</Text>
        </View>
      ) : (hucha.targetDate || (hucha.isAutomatic && hucha.monthlyAmount)) ? (
        <View style={styles.cardMetaRow}>
          <Ionicons
            name={hucha.isAutomatic && hucha.monthlyAmount ? 'repeat' : 'calendar-outline'}
            size={13}
            color={dc.textSecondary}
          />
          <Text style={[styles.cardMeta, { color: dc.textSecondary }]} numberOfLines={1}>
            {hucha.isAutomatic && hucha.monthlyAmount
              ? t('hucha.everyMonth', { amount: hucha.monthlyAmount, symbol: currencySymbol })
              : ''}
            {hucha.targetDate && hucha.isAutomatic && hucha.monthlyAmount ? ' · ' : ''}
            {targetDate}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
};

const HuchaScreen = () => {
  const { t } = useTranslation();
  const { colors: dc, ui } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { huchas, huchaMovements, getTotalTarget } = useSavingsStore();
  const { getCurrencySymbol } = useSettingsStore();
  const { isSharedMode, getSharedCurrencySymbol } = useSharedAccountStore();
  const currencySymbol = isSharedMode ? getSharedCurrencySymbol() : getCurrencySymbol();
  const activeHuchas = huchas.filter(h => !h.closedAt);
  const closedHuchas = huchas.filter(h => !!h.closedAt);
  const targetedActive = activeHuchas.filter(h => h.targetAmount > 0);
  const totalSaved = targetedActive.reduce((acc, h) => acc + h.currentAmount, 0);
  const totalTarget = getTotalTarget();
  const overallPct = totalTarget > 0
    ? Math.min(Math.round((totalSaved / totalTarget) * 100), 100)
    : 0;

  const now = new Date();
  const thisMonthNet = huchaMovements
    .filter(m => {
      const d = new Date(m.date);
      return d.getMonth() === now.getMonth()
        && d.getFullYear() === now.getFullYear();
    })
    .reduce((sum, m) => sum + (m.type === 'deposit' ? m.amount : -m.amount), 0);

  const hero = (
    <>
      <HeroTitleBar
        title={t('hucha.title')}
        settings
        right={activeHuchas.length > 0
          ? <HeroChip label={`${activeHuchas.length} ${t('hucha.activeGoals')}`} />
          : undefined}
      />
      <View style={styles.heroBody}>
        <Text style={[styles.heroLabel, { color: ui.onHeroSoft }]}>{t('hucha.totalSaved')}</Text>
        <Text style={[styles.heroAmount, { color: ui.onHero }]} numberOfLines={1}>
          {formatAmount(totalSaved)} {currencySymbol}
        </Text>
        {totalTarget > 0 && (
          <>
            <View style={styles.heroTrack}>
              <View style={[styles.heroFill, { width: `${overallPct}%` }]} />
            </View>
            <Text style={[styles.heroCaption, { color: ui.onHeroSoft }]}>
              {overallPct}% {t('hucha.of')} {formatAmount(totalTarget)} {currencySymbol}
            </Text>
          </>
        )}
        {thisMonthNet !== 0 && (
          <View style={styles.heroPill}>
            <Ionicons name={thisMonthNet > 0 ? 'arrow-up' : 'arrow-down'} size={13} color={ui.onHero} />
            <Text style={[styles.heroPillText, { color: ui.onHero }]}>
              {t(thisMonthNet > 0 ? 'hucha.thisMonthAdded' : 'hucha.thisMonthWithdrawn', {
                amount: formatAmount(Math.abs(thisMonthNet)), symbol: currencySymbol,
              })}
            </Text>
          </View>
        )}
      </View>
    </>
  );

  return (
    <HeroScrollScreen hero={hero}>
      {activeHuchas.length === 0 && closedHuchas.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={[styles.emptyIcon, { backgroundColor: ui.accentSoft }]}>
            <Ionicons name="cash-outline" size={30} color={ui.accent} />
          </View>
          <Text style={[styles.emptyText, { color: dc.textPrimary }]}>{t('hucha.noGoals')}</Text>
          <Text style={[styles.emptySubtext, { color: dc.textSecondary }]}>{t('hucha.noGoalsSubtitle')}</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {activeHuchas.map(hucha => (
            <HuchaCard
              key={hucha.id}
              hucha={hucha}
              onPress={() => navigation.navigate('HuchaDetail', { huchaId: hucha.id })}
            />
          ))}
        </View>
      )}

      {closedHuchas.length > 0 && (
        <>
          <SectionHeader title={t('hucha.completedSection')} style={styles.closedHeader} />
          <View style={styles.list}>
            {closedHuchas.map(hucha => (
              <HuchaCard
                key={hucha.id}
                hucha={hucha}
                onPress={() => navigation.navigate('HuchaDetail', { huchaId: hucha.id })}
              />
            ))}
          </View>
        </>
      )}
    </HeroScrollScreen>
  );
};

const styles = StyleSheet.create({
  heroBody: { paddingHorizontal: 20, paddingTop: 14 },
  heroLabel: { fontSize: 13, fontFamily: 'Poppins_400Regular' },
  heroAmount: { fontSize: 36, fontFamily: 'Poppins_700Bold', letterSpacing: -1 },
  heroTrack: {
    height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.22)', marginTop: 12, overflow: 'hidden',
  },
  heroFill: { height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' },
  heroCaption: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 7 },
  heroPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5,
  },
  heroPillText: { fontSize: 12.5, fontFamily: 'Poppins_500Medium' },

  list: { paddingHorizontal: 20, gap: 10 },
  closedHeader: { marginTop: 22 },
  card: { borderRadius: 22, padding: 16 },
  closed: { opacity: 0.7 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIcon: { width: 42, height: 42, borderRadius: 14, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  cardInfo: { flex: 1, minWidth: 0 },
  cardName: { fontSize: 15.5, fontFamily: 'Poppins_600SemiBold' },
  cardAmounts: { fontSize: 12.5, fontFamily: 'Poppins_400Regular', marginTop: 1 },
  cardPct: { fontSize: 16, fontFamily: 'Poppins_700Bold', flexShrink: 0 },
  noShrink: { flexShrink: 0 },
  progressBar: { height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 12 },
  progressFill: { height: 8, borderRadius: 4 },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 },
  cardMeta: { fontSize: 12.5, fontFamily: 'Poppins_400Regular', flexShrink: 1 },

  emptyState: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  emptyText: { fontSize: 17, fontFamily: 'Poppins_600SemiBold', marginBottom: 6, textAlign: 'center' },
  emptySubtext: { fontSize: 13, fontFamily: 'Poppins_400Regular', textAlign: 'center' },
});

export default HuchaScreen;
