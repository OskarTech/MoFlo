import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { HeroScrollScreen } from '../../components/layout/HeroScreen';
import { HeroTitleBar } from '../../components/layout/HeroBar';
import BottomSheet, { FilledInput, SegmentedControl, SheetButton } from '../../components/common/BottomSheet';
import ColorPaletteModal from '../../components/common/ColorPaletteModal';
import { OptionSheet } from '../../components/settings/SettingsSheets';
import { CURRENCIES } from '../../constants/currencies';
import { reportError } from '../../services/crashReporting';
import { warningHaptic } from '../../utils/haptics';
import { businessIsCreator, useBusinessStore } from '../store/businessStore';
import { leaveBusinessMode } from '../store/switch';
import { resolveBusinessPalette } from '../store/modeStore';
import { orderedItems } from '../logic/basics';
import { usesOrders, usesTills } from '../logic/days';
import { BusinessMode, ConfigListKind, MAX_BUSINESS_MEMBERS, SalesMethod } from '../types';
import { AmountBox, Chip, ChipRow, Note, SettingsGroup, SettingsRow, SettingsSwitch, useMoney } from '../ui/kit';
import { weekdayLetter } from '../ui/format';

const currencyName = (label: string) => label.replace(/\s*\([^)]*\)\s*$/, '');

/**
 * Empresa: todo lo que se personaliza. Cómo se trabaja (Sencillo o Experto,
 * por caja o pedido a pedido), la carta y las listas, las opciones, los
 * socios y el historial. La plantilla solo rellenó lo de partida.
 */
const BizSettingsScreen = () => {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const { symbol } = useMoney();
  const business = useBusinessStore((s) => s.business);
  const config = useBusinessStore((s) => s.config);
  const catalog = useBusinessStore((s) => s.catalog);
  const store = useBusinessStore.getState;
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [showCurrency, setShowCurrency] = useState(false);
  const [showPalette, setShowPalette] = useState(false);

  if (!business || !config) return null;
  const creator = businessIsCreator(business);
  const count = (list: ConfigListKind) => orderedItems(config[list]).length;
  const listRow = (list: ConfigListKind, icon: string, last?: boolean) => (
    <SettingsRow
      icon={icon as never}
      label={t(`business.lists.${list}.title`)}
      value={String(count(list))}
      onPress={() => navigation.navigate('BizList', { list })}
      last={last}
    />
  );

  const setMode = (mode: BusinessMode) => store().updateConfig({ mode });
  const setMethod = (salesMethod: SalesMethod) => store().updateConfig({ salesMethod });
  const toggleDay = (day: number) => {
    const days = new Set(config.openDays ?? []);
    if (days.has(day)) days.delete(day); else days.add(day);
    store().updateConfig({ openDays: [...days].sort() });
  };

  const leave = () => {
    Alert.alert(t('business.settings.leaveTitle'), t('business.settings.leaveBody', { name: business.name }), [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('business.settings.leave'),
        style: 'destructive',
        onPress: () => {
          warningHaptic();
          leaveBusinessMode('individual', { before: () => store().leaveBusiness() })
            .catch((e) => {
              if ((e as { code?: string })?.code === 'offline') {
                Alert.alert(t('business.settings.offlineTitle'), t('business.settings.offlineLeave'));
                return;
              }
              reportError(e, 'empresa: salir');
            });
        },
      },
    ]);
  };

  const remove = () => {
    Alert.alert(t('business.settings.deleteTitle'), t('business.settings.deleteBody', { name: business.name }), [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('business.settings.delete'),
        style: 'destructive',
        onPress: () => {
          Alert.alert(t('business.settings.deleteConfirmTitle'), t('business.settings.deleteConfirmBody'), [
            { text: t('settings.cancel'), style: 'cancel' },
            {
              text: t('business.settings.delete'),
              style: 'destructive',
              onPress: () => {
                warningHaptic();
                leaveBusinessMode('individual', { before: () => store().deleteBusiness() })
                  .catch((e) => {
                    if ((e as { code?: string })?.code === 'offline') {
                      Alert.alert(t('business.settings.offlineTitle'), t('business.settings.offlineDelete'));
                      return;
                    }
                    reportError(e, 'empresa: borrar');
                  });
              },
            },
          ]);
        },
      },
    ]);
  };

  const currencyOptions = CURRENCIES.map((c) => ({
    code: c.code, badge: c.symbol, label: currencyName(t(`settings.currencies.${c.code}`)), detail: c.code,
  }));
  const paletteId = resolveBusinessPalette(business.colorPalette);

  return (
    <>
      <HeroScrollScreen hero={<HeroTitleBar title={t('business.settings.title')} onBack={() => navigation.goBack()} />}>
        <View style={styles.pad}>
          <SettingsGroup>
            <SettingsRow
              icon="business"
              label={business.name}
              subtitle={t(`business.tpl.name.${business.template}`)}
              onPress={() => { setNameInput(business.name); setRenaming(true); }}
              last
            />
          </SettingsGroup>

          <SettingsGroup title={t('business.settings.howYouWork')}>
            <View style={styles.block}>
              <SegmentedControl
                options={[
                  { key: 'simple', label: t('business.mode.simple') },
                  { key: 'expert', label: t('business.mode.expert') },
                ]}
                value={config.mode}
                onChange={setMode}
              />
              <Note
                text={config.mode === 'simple' ? t('business.mode.simpleHint') : t('business.mode.expertHint')}
                style={styles.gapTop}
              />
              {config.mode === 'expert' && (
                <SegmentedControl
                  options={[
                    { key: 'tills', label: t('business.mode.tills') },
                    { key: 'orders', label: t('business.mode.orders') },
                  ]}
                  value={config.salesMethod}
                  onChange={setMethod}
                  style={styles.gapTop}
                />
              )}
            </View>
            <View style={styles.block}>
              <SettingsRow icon="calendar-outline" label={t('business.settings.openDays')} subtitle={t('business.settings.openDaysHint')} last />
              <ChipRow style={styles.days}>
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <Chip key={d} label={weekdayLetter(d, i18n.language)} selected={(config.openDays ?? []).includes(d)} onPress={() => toggleDay(d)} />
                ))}
              </ChipRow>
            </View>
            <View style={styles.block}>
              <SettingsRow icon="time-outline" label={t('business.settings.dayEnds')} subtitle={t('business.settings.dayEndsHint')} last />
              <ChipRow style={styles.days}>
                {[0, 2, 3, 4, 5, 6].map((h) => (
                  <Chip
                    key={h}
                    label={h === 0 ? t('business.settings.midnight') : `${String(h).padStart(2, '0')}:00`}
                    selected={(config.dayCutoffHour ?? 0) === h}
                    onPress={() => store().updateConfig({ dayCutoffHour: h })}
                  />
                ))}
              </ChipRow>
            </View>
          </SettingsGroup>

          <SettingsGroup title={t('business.settings.yours')}>
            {usesOrders(config) && (
              <SettingsRow
                icon="restaurant-outline"
                label={t('business.catalog.title')}
                value={String(orderedItems(catalog?.products).length)}
                onPress={() => navigation.navigate('BizCatalog')}
              />
            )}
            {listRow('channels', 'card-outline')}
            {listRow('workers', 'people-outline')}
            {listRow('suppliers', 'cart-outline')}
            {listRow('expenseTypes', 'pricetag-outline')}
            {usesTills(config) && listRow('tills', 'cash-outline')}
            {usesTills(config) && listRow('sections', 'grid-outline')}
            {listRow('shifts', 'time-outline', true)}
          </SettingsGroup>

          <SettingsGroup title={t('business.settings.options')}>
            <SettingsRow
              icon="cash-outline"
              label={t('business.settings.cashCount')}
              subtitle={t('business.settings.cashCountHint')}
              right={<SettingsSwitch value={config.cashCount} onChange={(v) => store().updateConfig({ cashCount: v })} label={t('business.settings.cashCount')} />}
            />
            {config.cashCount && (
              <SettingsRow
                icon="cash-outline"
                label={t('business.settings.float')}
                right={<AmountBox value={config.floatAmount} onChange={(v) => store().updateConfig({ floatAmount: v ?? 0 })} width={96} accessibilityLabel={t('business.settings.float')} />}
              />
            )}
            <SettingsRow
              icon="calendar-outline"
              label={t('business.settings.spreadFixed')}
              subtitle={t('business.settings.spreadFixedHint')}
              right={<SettingsSwitch value={config.spreadFixed} onChange={(v) => store().updateConfig({ spreadFixed: v })} label={t('business.settings.spreadFixed')} />}
            />
            <SettingsRow
              icon="notifications-outline"
              label={t('business.settings.notifyOnClose')}
              subtitle={t('business.settings.notifyOnCloseHint')}
              right={<SettingsSwitch value={config.notifyOnClose} onChange={(v) => store().updateConfig({ notifyOnClose: v })} label={t('business.settings.notifyOnClose')} />}
            />
            <SettingsRow
              icon="cash-outline"
              label={t('settings.currency')}
              value={symbol}
              onPress={() => setShowCurrency(true)}
            />
            <SettingsRow
              icon="color-palette-outline"
              label={t('settings.colorPalette')}
              value={t(`settings.palette${paletteId.charAt(0).toUpperCase() + paletteId.slice(1)}`)}
              onPress={() => setShowPalette(true)}
              last
            />
          </SettingsGroup>

          <SettingsGroup title={t('business.settings.partners')}>
            <SettingsRow
              icon="people-outline"
              label={t('business.members.title')}
              value={t('business.members.countOf', { count: business.members.length, max: MAX_BUSINESS_MEMBERS })}
              onPress={() => navigation.navigate('BizMembers')}
            />
            <SettingsRow
              icon="time-outline"
              label={t('business.history.title')}
              subtitle={t('business.history.hint')}
              onPress={() => navigation.navigate('BizHistory')}
              last
            />
          </SettingsGroup>

          <SettingsGroup>
            {creator ? (
              <SettingsRow icon="trash-outline" label={t('business.settings.delete')} subtitle={t('business.settings.deleteHint')} onPress={remove} danger last />
            ) : (
              <SettingsRow icon="exit-outline" label={t('business.settings.leave')} onPress={leave} danger last />
            )}
          </SettingsGroup>

          <Note icon="shield-checkmark-outline" text={t('business.settings.legal')} style={styles.legal} />
        </View>
      </HeroScrollScreen>

      {/* Las ventanas, fuera de la lista: dentro, con el teclado abierto, el
          primer toque se lo quedaba la lista (lo cerraba) y «Guardar» pedía dos */}
      <BottomSheet
        visible={renaming}
        onClose={() => setRenaming(false)}
        title={t('business.settings.rename')}
        footer={(
          <SheetButton
            label={t('business.common.save')}
            disabled={!nameInput.trim()}
            onPress={() => {
              store().updateBusiness({ name: nameInput.trim().slice(0, 60) }).catch((e) => reportError(e, 'empresa: nombre'));
              setRenaming(false);
            }}
          />
        )}
      >
        <FilledInput value={nameInput} onChangeText={setNameInput} placeholder={t('business.create.namePlaceholder')} maxLength={60} autoFocus />
      </BottomSheet>
      <OptionSheet
        visible={showCurrency}
        title={t('settings.currency')}
        subtitle={t('business.settings.currencyHint')}
        options={currencyOptions}
        selected={business.currencyCode}
        onSelect={(code) => store().updateBusiness({ currencyCode: code }).catch((e) => reportError(e, 'empresa: moneda'))}
        onDismiss={() => setShowCurrency(false)}
      />
      <ColorPaletteModal
        visible={showPalette}
        selectedPalette={paletteId}
        onSelect={(id) => {
          store().updateBusiness({ colorPalette: id }).catch((e) => reportError(e, 'empresa: color'));
          setShowPalette(false);
        }}
        onDismiss={() => setShowPalette(false)}
        currencySymbol={symbol}
      />
    </>
  );
};

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 20 },
  block: { paddingVertical: 12 },
  gapTop: { marginTop: 10 },
  days: { marginTop: 4, marginBottom: 4 },
  legal: { marginTop: 22 },
});

export default BizSettingsScreen;
