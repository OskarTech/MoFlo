import React from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
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
import AppHeader from '../../components/common/AppHeader';

const formatAmount = (n: number) => n % 1 === 0 ? n.toFixed(0) : n.toFixed(2);

const formatTargetDate = (yyyyMM?: string): string => {
  if (!yyyyMM) return '';
  const [year, month] = yyyyMM.split('-');
  const months: Record<string, string> = {
    '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr',
    '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago',
    '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic',
  };
  return `${months[month] ?? month} ${year}`;
};

const HuchaCard = ({ hucha, onPress }: { hucha: Hucha; onPress: () => void }) => {
  const { t } = useTranslation();
  const { colors: dc } = useTheme();
  const { getCurrencySymbol } = useSettingsStore();
  const { isSharedMode, getSharedCurrencySymbol } = useSharedAccountStore();
  const currencySymbol = isSharedMode ? getSharedCurrencySymbol() : getCurrencySymbol();
  const hasTarget = hucha.targetAmount > 0;
  const pct = hasTarget
    ? Math.min(Math.round((hucha.currentAmount / hucha.targetAmount) * 100), 100)
    : 0;

  const isClosed = !!hucha.closedAt;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        { backgroundColor: dc.surface, borderColor: dc.border },
        isClosed && { opacity: 0.65 },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.cardIcon, { backgroundColor: hucha.color + '20' }]}>
          <Ionicons
            name={isClosed ? 'checkmark-circle' : (hucha.icon as keyof typeof Ionicons.glyphMap)}
            size={24}
            color={hucha.color}
          />
        </View>
        <View style={styles.cardInfo}>
          <Text style={[styles.cardName, { color: dc.textPrimary }]} numberOfLines={1}>
            {hucha.name}
          </Text>
          {isClosed ? (
            <View style={styles.cardMetaRow}>
              <Ionicons name="lock-closed" size={11} color={dc.textSecondary} />
              <Text style={[styles.cardMeta, { color: dc.textSecondary }]}>
                {t('hucha.closedBadge')}
              </Text>
            </View>
          ) : (hucha.targetDate || hucha.isAutomatic) && (
            <View style={styles.cardMetaRow}>
              <Ionicons name="calendar-outline" size={11} color={dc.textSecondary} />
              <Text style={[styles.cardMeta, { color: dc.textSecondary }]}>
                {hucha.targetDate ? formatTargetDate(hucha.targetDate) : ''}
                {hucha.targetDate && hucha.isAutomatic ? ' · ' : ''}
                {hucha.isAutomatic && hucha.monthlyAmount
                  ? t('hucha.everyMonth', { amount: hucha.monthlyAmount, symbol: currencySymbol })
                  : ''}
              </Text>
            </View>
          )}
        </View>
        {hasTarget ? (
          <Text style={[styles.cardPct, { color: hucha.color }]}>{pct}%</Text>
        ) : (
          <Ionicons name="infinite" size={20} color={hucha.color} style={{ flexShrink: 0 }} />
        )}
      </View>

      {hasTarget ? (
        <View style={[styles.progressBar, { backgroundColor: hucha.color + '25' }]}>
          <View style={[styles.progressFill, { width: `${pct}%` as any, backgroundColor: hucha.color }]} />
        </View>
      ) : (
        <View style={[styles.progressBar, { backgroundColor: hucha.color + '25' }]} />
      )}

      <View style={styles.cardFooter}>
        <Text style={[styles.cardAmount, { color: dc.textPrimary }]}>
          {formatAmount(hucha.currentAmount)} {currencySymbol}
        </Text>
        {hasTarget ? (
          <Text style={[styles.cardTarget, { color: dc.textSecondary }]}>
            {t('hucha.of')} {formatAmount(hucha.targetAmount)} {currencySymbol}
          </Text>
        ) : (
          <Text style={[styles.cardTarget, { color: dc.textSecondary }]}>
            {t('hucha.accumulating')}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
};


const HuchaScreen = () => {
  const { t } = useTranslation();
  const { colors: dc } = useTheme();
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

  return (
    <View style={[styles.container, { backgroundColor: dc.background }]}>
      <AppHeader title={t('hucha.title')} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Tarjeta totales */}
        {activeHuchas.length > 0 && (
          <View style={[styles.totalCard, { backgroundColor: dc.surface, borderColor: dc.border }]}>
            <View style={styles.totalCardTop}>
              <Text style={[styles.totalLabel, { color: dc.textSecondary }]}>
                {t('hucha.totalSaved').toUpperCase()}
              </Text>
              {thisMonthNet !== 0 && (
                <Text style={[styles.thisMonthText, { color: thisMonthNet > 0 ? dc.savings : dc.expense }]}>
                  {t(thisMonthNet > 0 ? 'hucha.thisMonthAdded' : 'hucha.thisMonthWithdrawn', { amount: formatAmount(Math.abs(thisMonthNet)), symbol: currencySymbol })}
                </Text>
              )}
            </View>
            <Text style={[styles.totalAmount, { color: dc.textPrimary }]}>
              {formatAmount(totalSaved)} {currencySymbol}
            </Text>
            {totalTarget > 0 && (
              <View style={[styles.totalProgressBar, { backgroundColor: dc.border }]}>
                <View style={[styles.totalProgressFill, { width: `${overallPct}%` as any, backgroundColor: dc.primary }]} />
              </View>
            )}
            <View style={styles.totalProgressRow}>
              {totalTarget > 0 ? (
                <Text style={[styles.totalGoalsCount, { color: dc.textSecondary }]}>
                  {overallPct}% {t('hucha.of')} {formatAmount(totalTarget)} {currencySymbol}
                </Text>
              ) : <View />}
              <Text style={[styles.totalGoalsCount, { color: dc.textSecondary }]}>
                {activeHuchas.length} {t('hucha.activeGoals')}
              </Text>
            </View>
          </View>
        )}

        {/* Lista de huchas activas */}
        {activeHuchas.length === 0 && closedHuchas.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🐷</Text>
            <Text style={[styles.emptyText, { color: dc.textPrimary }]}>
              {t('hucha.noGoals')}
            </Text>
            <Text style={[styles.emptySubtext, { color: dc.textSecondary }]}>
              {t('hucha.noGoalsSubtitle')}
            </Text>
          </View>
        ) : (
          activeHuchas.map(hucha => (
            <HuchaCard
              key={hucha.id}
              hucha={hucha}
              onPress={() => navigation.navigate('HuchaDetail', { huchaId: hucha.id })}
            />
          ))
        )}

        {closedHuchas.length > 0 && (
          <>
            <Text style={[styles.closedSectionLabel, { color: dc.textSecondary }]}>
              {t('hucha.completedSection')}
            </Text>
            {closedHuchas.map(hucha => (
              <HuchaCard
                key={hucha.id}
                hucha={hucha}
                onPress={() => navigation.navigate('HuchaDetail', { huchaId: hucha.id })}
              />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100 },

  pageHeader: { marginBottom: 20 },
  pageSubtitle: {
    fontSize: 11, fontFamily: 'Poppins_600SemiBold',
    textTransform: 'uppercase', letterSpacing: 1.5,
  },
  pageTitle: { fontSize: 32, fontFamily: 'Poppins_700Bold', marginTop: 2 },

  totalCard: {
    borderRadius: 20, padding: 20, marginBottom: 16, borderWidth: 0.5,
  },
  totalCardTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2,
  },
  totalLabel: {
    fontSize: 11, fontFamily: 'Poppins_600SemiBold', letterSpacing: 0.8,
  },
  thisMonthText: {
    fontSize: 12, fontFamily: 'Poppins_600SemiBold',
  },
  totalAmount: {
    fontSize: 34, fontFamily: 'Poppins_700Bold', marginBottom: 12, marginTop: 4,
  },
  totalProgressBar: {
    width: '100%', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 8,
  },
  totalProgressFill: {
    height: 8, borderRadius: 4,
  },
  totalProgressRow: {
    flexDirection: 'row', justifyContent: 'space-between', width: '100%',
  },
  totalGoalsCount: {
    fontSize: 12, fontFamily: 'Poppins_400Regular',
  },
  closedSectionLabel: {
    fontSize: 12, fontFamily: 'Poppins_600SemiBold',
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginTop: 16, marginBottom: 8, marginLeft: 4,
  },

  card: {
    borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 0.5,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 12 },
  cardIcon: {
    width: 46, height: 46, borderRadius: 23,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  cardMeta: { fontSize: 12, fontFamily: 'Poppins_400Regular' },
  cardPct: { fontSize: 16, fontFamily: 'Poppins_700Bold', flexShrink: 0 },
  progressBar: { height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 10 },
  progressFill: { height: 6, borderRadius: 3 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardAmount: { fontSize: 14, fontFamily: 'Poppins_600SemiBold' },
  cardTarget: { fontSize: 12, fontFamily: 'Poppins_400Regular' },

  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyText: { fontSize: 18, fontFamily: 'Poppins_600SemiBold', marginBottom: 8 },
  emptySubtext: {
    fontSize: 13, fontFamily: 'Poppins_400Regular',
    textAlign: 'center', paddingHorizontal: 32, marginBottom: 24,
  },
  createCardBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 16, borderRadius: 16, marginTop: 4, borderWidth: 0.5,
  },
  createBtnIconBox: {
    width: 36, height: 36, borderRadius: 10, borderWidth: 1.5,
    justifyContent: 'center', alignItems: 'center',
  },
  createCardBtnText: { fontSize: 15, fontFamily: 'Poppins_500Medium' },

});

export default HuchaScreen;
