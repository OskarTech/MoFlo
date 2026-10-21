import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { HeroScrollScreen } from '../../components/layout/HeroScreen';
import { HeroTitleBar } from '../../components/layout/HeroBar';
import BottomSheet, { FilledInput, SheetButton } from '../../components/common/BottomSheet';
import Icon from '../../components/common/Icon';
import ColorPaletteModal from '../../components/common/ColorPaletteModal';
import { OptionSheet } from '../../components/settings/SettingsSheets';
import { CURRENCIES } from '../../constants/currencies';
import { useTheme } from '../../hooks/useTheme';
import { reportError } from '../../services/crashReporting';
import { warningHaptic } from '../../utils/haptics';
import { businessIsCreator, useBusinessStore } from '../store/businessStore';
import { leaveBusinessMode } from '../store/switch';
import { resolveBusinessPalette } from '../store/modeStore';
import { orderedItems } from '../logic/basics';
import {
  CORPORATE_TAX_TYPE, DEFAULT_CORPORATE_TAX, DEFAULT_FOOD_TARGET, DEFAULT_SALES_VAT, DEFAULT_STAFF_TARGET, VAT_TYPE,
} from '../templates';
import { ConfigItem, ConfigListKind, MAX_BUSINESS_MEMBERS, POS_ACTOR } from '../types';
import { AmountBox, Chip, ChipRow, Note, PercentBox, SettingsGroup, SettingsRow, SettingsSwitch, useMoney } from '../ui/kit';
import { longDay, timeOf, weekdayName, weekdayNarrow } from '../ui/format';

const currencyName = (label: string) => label.replace(/\s*\([^)]*\)\s*$/, '');
/** De lunes a domingo (0 es domingo) */
const WEEK = [1, 2, 3, 4, 5, 6, 0];
/** A qué hora acaba el día de la pizzería (0: a medianoche) */
const CUTOFF_HOURS = [0, 2, 3, 4, 5, 6];

/**
 * Ajustes de la empresa: cuándo abre, las listas (formas de cobro, empleados,
 * proveedores y tipos de gasto), las opciones, los impuestos para el beneficio
 * real, el último cierre de la caja, los socios y el historial. Al crearla
 * solo se rellenó lo de partida de una pizzería.
 */
const BizSettingsScreen = () => {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const { colors: dc, ui } = useTheme();
  const { symbol } = useMoney();
  const business = useBusinessStore((s) => s.business);
  const config = useBusinessStore((s) => s.config);
  const days = useBusinessStore((s) => s.days);
  const store = useBusinessStore.getState;
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [showCurrency, setShowCurrency] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showDays, setShowDays] = useState(false);
  const [showCutoff, setShowCutoff] = useState(false);

  if (!business || !config) return null;
  const creator = businessIsCreator(business);
  const count = (list: ConfigListKind) => orderedItems(config[list] as Record<string, ConfigItem>).length;
  const listRow = (list: ConfigListKind, icon: string, last?: boolean) => (
    <SettingsRow
      icon={icon as never}
      label={t(`business.lists.${list}.title`)}
      subtitle={t(`business.lists.${list}.settingsHint`)}
      value={String(count(list))}
      onPress={() => navigation.navigate('BizList', { list })}
      last={last}
    />
  );

  // El último día que ha cerrado la caja (de los que hay en el móvil)
  const lastPos = Object.values(days)
    .filter((d) => d.closedBy === POS_ACTOR && d.closedAt)
    .sort((a, b) => b.id.localeCompare(a.id))[0];
  // Quitar un impuesto también archiva su tipo de gasto (ya no sale al
  // apuntar), y ponerlo lo devuelve; lo apuntado con él se queda
  const setTaxEnabled = (tax: 'vat' | 'corporateTax', enabled: boolean) => {
    store().updateConfig(tax === 'vat' ? { vatEnabled: enabled } : { corporateTaxEnabled: enabled });
    const typeId = tax === 'vat' ? VAT_TYPE : CORPORATE_TAX_TYPE;
    const type = config.expenseTypes?.[typeId];
    if (!type || !type.archived === enabled) return;
    const { archived: _archived, ...rest } = type;
    store().saveConfigItem('expenseTypes', typeId, enabled ? rest : { ...rest, archived: true });
  };
  const openDays = config.openDays ?? [];
  const hourLabel = (h: number) => (h === 0 ? t('business.settings.midnight') : `${String(h).padStart(2, '0')}:00`);
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

          {/* Los días y la hora, cada uno en su fila: se cambian en su ventana */}
          <SettingsGroup title={t('business.settings.howYouWork')}>
            <SettingsRow
              icon="calendar-outline"
              label={t('business.settings.openDays')}
              onPress={() => setShowDays(true)}
              right={(
                <View style={styles.week}>
                  {WEEK.map((d) => (
                    <Text
                      key={d}
                      style={[styles.weekLetter, openDays.includes(d) ? { color: dc.textPrimary } : { color: ui.hair2 }]}
                    >
                      {weekdayNarrow(d, i18n.language)}
                    </Text>
                  ))}
                  <Icon name="chevron-forward" size={15} color={dc.textSecondary} />
                </View>
              )}
            />
            <SettingsRow
              icon="time-outline"
              label={t('business.settings.dayEnds')}
              value={hourLabel(config.dayCutoffHour ?? 0)}
              onPress={() => setShowCutoff(true)}
              last
            />
          </SettingsGroup>

          <SettingsGroup title={t('business.settings.yours')}>
            {listRow('channels', 'card-outline')}
            {listRow('workers', 'people-outline')}
            {listRow('suppliers', 'cart-outline')}
            {listRow('expenseTypes', 'pricetag-outline', true)}
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

          <SettingsGroup title={t('business.taxes.settingsTitle')}>
            <SettingsRow
              icon="receipt-outline"
              label={t('business.taxes.vatEnabled')}
              subtitle={t('business.taxes.vatEnabledHint')}
              right={<SettingsSwitch value={config.vatEnabled !== false} onChange={(v) => setTaxEnabled('vat', v)} label={t('business.taxes.vatEnabled')} />}
            />
            {config.vatEnabled !== false && (
              <>
                <SettingsRow
                  icon="receipt-outline"
                  label={t('business.taxes.salesVatRate')}
                  subtitle={t('business.taxes.salesVatRateHint')}
                  right={<PercentBox value={config.salesVatRate ?? DEFAULT_SALES_VAT} onChange={(v) => store().updateConfig({ salesVatRate: v })} label={t('business.taxes.salesVatRate')} />}
                />
                <SettingsRow
                  icon="receipt-outline"
                  label={t('business.taxes.expenseVatSplit')}
                  subtitle={t('business.taxes.expenseVatSplitHint')}
                  right={(
                    <SettingsSwitch
                      value={config.expenseVatSplit === true}
                      onChange={(v) => store().updateConfig({ expenseVatSplit: v })}
                      label={t('business.taxes.expenseVatSplit')}
                    />
                  )}
                />
              </>
            )}
            <SettingsRow
              icon="business-outline"
              label={t('business.taxes.corporateTaxEnabled')}
              subtitle={t('business.taxes.corporateTaxEnabledHint')}
              right={<SettingsSwitch value={config.corporateTaxEnabled !== false} onChange={(v) => setTaxEnabled('corporateTax', v)} label={t('business.taxes.corporateTaxEnabled')} />}
              last={config.corporateTaxEnabled === false}
            />
            {config.corporateTaxEnabled !== false && (
              <SettingsRow
                icon="business-outline"
                label={t('business.taxes.corporateTaxRate')}
                subtitle={t('business.taxes.corporateTaxRateHint')}
                right={<PercentBox value={config.corporateTaxRate ?? DEFAULT_CORPORATE_TAX} onChange={(v) => store().updateConfig({ corporateTaxRate: v })} label={t('business.taxes.corporateTaxRate')} />}
                last
              />
            )}
          </SettingsGroup>

          <SettingsGroup title={t('business.costs.settingsTitle')}>
            <SettingsRow
              icon="basket-outline"
              label={t('business.costs.foodTarget')}
              subtitle={t('business.costs.foodTargetHint')}
              right={<PercentBox value={config.foodCostTarget ?? DEFAULT_FOOD_TARGET} onChange={(v) => store().updateConfig({ foodCostTarget: v })} label={t('business.costs.foodTarget')} />}
            />
            <SettingsRow
              icon="people-outline"
              label={t('business.costs.staffTarget')}
              subtitle={t('business.costs.staffTargetHint')}
              right={<PercentBox value={config.staffCostTarget ?? DEFAULT_STAFF_TARGET} onChange={(v) => store().updateConfig({ staffCostTarget: v })} label={t('business.costs.staffTarget')} />}
              last
            />
          </SettingsGroup>

          <SettingsGroup title={t('business.pos.settingsTitle')}>
            <SettingsRow
              icon="receipt-outline"
              label={t('business.pos.lastClose')}
              subtitle={lastPos?.closedAt
                ? t('business.pos.lastCloseAt', { day: longDay(lastPos.id, i18n.language), time: timeOf(lastPos.closedAt) })
                : t('business.pos.lastCloseNone')}
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
      <BottomSheet
        visible={showDays}
        onClose={() => setShowDays(false)}
        title={t('business.settings.openDays')}
        subtitle={t('business.settings.openDaysHint')}
      >
        <ChipRow>
          {WEEK.map((d) => (
            <Chip key={d} label={weekdayName(d, i18n.language)} selected={openDays.includes(d)} onPress={() => toggleDay(d)} />
          ))}
        </ChipRow>
      </BottomSheet>
      <OptionSheet
        visible={showCutoff}
        title={t('business.settings.dayEnds')}
        subtitle={t('business.settings.dayEndsHint')}
        options={CUTOFF_HOURS.map((h) => ({ code: String(h), label: hourLabel(h) }))}
        selected={String(config.dayCutoffHour ?? 0)}
        onSelect={(code) => store().updateConfig({ dayCutoffHour: Number(code) })}
        onDismiss={() => setShowCutoff(false)}
      />
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
  gapTop: { marginTop: 10 },
  week: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  weekLetter: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', minWidth: 9, textAlign: 'center' },
  legal: { marginTop: 22 },
});

export default BizSettingsScreen;
