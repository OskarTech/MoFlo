import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, StyleSheet, Modal, TouchableOpacity, Platform, Alert, Keyboard, LayoutAnimation, TextInput,
} from 'react-native';
import { create } from 'zustand';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon, { IconName } from '../../components/common/Icon';
import { FilledInput, SheetButton, SheetLabel } from '../../components/common/BottomSheet';
import { HeroScrollScreen } from '../../components/layout/HeroScreen';
import { HeroIconButton, HeroTitleBar } from '../../components/layout/HeroBar';
import PremiumModal from '../../components/common/PremiumModal';
import { useTheme } from '../../hooks/useTheme';
import { usePremiumStore } from '../../store/premiumStore';
import { useSettingsStore } from '../../store/settingsStore';
import { reportError } from '../../services/crashReporting';
import { successHaptic, warningHaptic } from '../../utils/haptics';
import { withAlpha } from '../../utils/color';
import { useBusinessStore } from '../store/businessStore';
import { switchToBusiness } from '../store/switch';
import { channelChoices, CREATABLE_TEMPLATES, templateInfo, TemplateChannel } from '../templates';
import { BusinessMode, SalesMethod, TemplateId } from '../types';
import { Chip, ChipRow, Note, PillButton } from './kit';
import { ImeHeightView } from '../../../modules/ime-height';

type Step = 'choose' | 'name' | 'mode' | 'details' | 'join';

/**
 * Alta de la cuenta de empresa, o unirse a una con su código. Se abre desde
 * el selector de cuentas. Crearla es Premium; unirse como socio, no.
 */
const CreateBusinessModal = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => (
  <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
    <SafeAreaProvider>
      <Wizard onClose={onClose} visible={visible} />
    </SafeAreaProvider>
  </Modal>
);

const useCreateBusinessStore = create<{ visible: boolean }>(() => ({ visible: false }));

/** Abre el asistente, que se dibuja en la raíz de la app (CreateBusinessHost) */
export const openCreateBusiness = () => useCreateBusinessStore.setState({ visible: true });

/**
 * El asistente, en la raíz de la app (RootNavigator), fuera de cualquier
 * lista: los toques de una ventana pasan también por las listas que la
 * contienen. Dentro de la cabecera de Inicio, con el teclado abierto, el
 * primer toque (Siguiente, añadir un empleado) se lo quedaba la lista de
 * Inicio, que solo cerraba el teclado, y había que tocar otra vez
 */
export const CreateBusinessHost = () => {
  const visible = useCreateBusinessStore((s) => s.visible);
  return <CreateBusinessModal visible={visible} onClose={() => useCreateBusinessStore.setState({ visible: false })} />;
};

// Aire entre el botón y el teclado, como en las ventanas (BottomSheet)
const KEYBOARD_GAP = 16;
// Android: espera antes de bajar el pie al ocultarse el teclado (como en BottomSheet)
const ANDROID_HIDE_WAIT = 120;

/**
 * Lo que tapa el teclado por abajo, para subir el pie como en las ventanas
 * (BottomSheet): el botón queda a 16 pt de él. En iOS el teclado tapa también
 * la franja de la barra de inicio. En Android su alto llega sin la barra de
 * navegación, que va debajo, y se le suma; sus cambios de alto con el teclado
 * abierto llegan por ImeHeightView, desde la propia ventana
 */
const useKeyboardCover = () => {
  const insets = useSafeAreaInsets();
  const [height, setHeight] = useState(0);
  const heightRef = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ios = Platform.OS === 'ios';

  const apply = (next: number, duration?: number) => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    if (next === heightRef.current) return;
    if (ios) {
      // Como KeyboardAvoidingView: a la vez que el teclado
      const ms = duration && duration > 10 ? duration : 220;
      LayoutAnimation.configureNext({ duration: ms, update: { duration: ms, type: LayoutAnimation.Types.keyboard } });
    }
    heightRef.current = next;
    setHeight(next);
  };
  const lowerSoon = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => { hideTimer.current = null; apply(0); }, ANDROID_HIDE_WAIT);
  };

  useEffect(() => {
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => apply(e.endCoordinates.height, e.duration));
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', (e) => {
      if (ios) apply(0, e.duration);
      else lowerSoon();
    });
    return () => {
      show.remove();
      hide.remove();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- una vez, con la ventana abierta
  }, []);

  return {
    cover: height > 0 ? height + (ios ? 0 : insets.bottom) : 0,
    // Android: el alto nuevo con el teclado ya abierto (ver ImeHeightView)
    onIme: (next: number) => {
      if (next > 0) { if (heightRef.current > 0) apply(next); } else if (heightRef.current > 0) lowerSoon();
    },
    // Android avisa tarde de que el teclado se ha ido con una ventana encima:
    // si tras un toque no queda ningún campo activo, ya no está (como BottomSheet)
    onTouchEnd: ios ? undefined : () => {
      setTimeout(() => { if (!TextInput.State.currentlyFocusedInput()) apply(0); }, 250);
    },
  };
};

const Wizard = ({ onClose, visible }: { onClose: () => void; visible: boolean }) => {
  const { t } = useTranslation();
  const { colors: dc, ui } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardCover();
  const isPremium = usePremiumStore((s) => s.isPremium);
  const pending = useBusinessStore((s) => s.pendingRequest);
  const [step, setStep] = useState<Step>('choose');
  const [name, setName] = useState('');
  const [template, setTemplate] = useState<TemplateId>('pizzeria');
  const [mode, setMode] = useState<BusinessMode>('expert');
  const [method, setMethod] = useState<SalesMethod>('orders');
  const [channels, setChannels] = useState<TemplateChannel[]>([]);
  const [workers, setWorkers] = useState<string[]>([]);
  const [workerInput, setWorkerInput] = useState('');
  const [code, setCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPremium, setShowPremium] = useState(false);
  const choices = useMemo(() => channelChoices(), []);

  useEffect(() => {
    if (!visible) return;
    setStep('choose');
    setName('');
    setCode('');
    setJoinError(null);
    setWorkers([]);
    setWorkerInput('');
    pickTemplate('pizzeria');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- al abrir
  }, [visible]);

  const pickTemplate = (id: TemplateId) => {
    const info = templateInfo(id);
    setTemplate(id);
    setMode(info.mode);
    setMethod(info.salesMethod);
    setChannels(info.channels.filter((c) => choices.some((x) => x.key === c)));
  };

  const back = () => {
    if (step === 'name' || step === 'join') setStep('choose');
    else if (step === 'mode') setStep('name');
    else if (step === 'details') setStep('mode');
    else onClose();
  };

  const create = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await useBusinessStore.getState().createBusiness({
        name: name.trim(),
        template,
        mode,
        salesMethod: method,
        channels,
        workers,
        currencyCode: useSettingsStore.getState().currencyCode || 'EUR',
      });
      successHaptic();
      onClose();
      // Con la pantalla de carga, a la empresa recién creada
      setTimeout(() => { switchToBusiness().catch((e) => reportError(e, 'empresa: entrar')); }, 350);
    } catch (e) {
      warningHaptic();
      const already = (e as Error)?.message === 'already_in_business';
      if (!already) reportError(e, 'empresa: crear');
      Alert.alert(
        t('common.error'),
        already ? t('business.create.alreadyInBusiness') : t('business.create.error'),
      );
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    if (busy) return;
    setBusy(true);
    setJoinError(null);
    try {
      const result = await useBusinessStore.getState().requestJoin(code);
      if (result === 'pending' || result === 'has_pending') {
        successHaptic();
        setStep('choose');
        return;
      }
      warningHaptic();
      setJoinError(t(`business.join.${result}`));
    } finally {
      setBusy(false);
    }
  };

  const option = (icon: IconName, title: string, subtitle: string, onPress: () => void, badge?: string) => (
    <TouchableOpacity style={[styles.option, { backgroundColor: ui.field }]} onPress={onPress} activeOpacity={0.75} accessibilityRole="button">
      <View style={[styles.optionIcon, { backgroundColor: ui.sheet }]}>
        <Icon name={icon} size={22} color={ui.accent} />
      </View>
      <View style={styles.flex}>
        <View style={styles.optionTitleRow}>
          <Text style={[styles.optionTitle, { color: dc.textPrimary }]}>{title}</Text>
          {badge ? (
            <View style={[styles.badge, { backgroundColor: dc.savings + '22' }]}>
              <Text style={[styles.badgeText, { color: ui.savingsText }]}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.optionSub, { color: dc.textSecondary }]}>{subtitle}</Text>
      </View>
      <Icon name="chevron-forward" size={18} color={dc.textSecondary} />
    </TouchableOpacity>
  );

  const modeCard = (key: string, selected: boolean, title: string, lines: string[], onPress: () => void) => (
    <TouchableOpacity
      key={key}
      style={[styles.modeCard, { backgroundColor: ui.field, borderColor: selected ? ui.accent : 'transparent' }]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <View style={styles.modeHead}>
        <Text style={[styles.modeTitle, { color: dc.textPrimary }]}>{title}</Text>
        <View style={[styles.radio, selected ? { backgroundColor: ui.accent, borderColor: ui.accent } : { borderColor: ui.hair2 }]}>
          {selected && <Icon name="checkmark" size={13} color={ui.onAccent} />}
        </View>
      </View>
      {lines.map((line) => (
        <Text key={line} style={[styles.modeLine, { color: dc.textSecondary }]}>• {line}</Text>
      ))}
    </TouchableOpacity>
  );

  const titles: Record<Step, string> = {
    choose: t('business.create.title'),
    name: t('business.create.stepName'),
    mode: t('business.create.stepMode'),
    details: t('business.create.stepDetails'),
    join: t('business.join.title'),
  };

  let body: React.ReactNode;
  let footer: React.ReactNode = null;
  if (step === 'choose') {
    body = (
      <>
        <Text style={[styles.intro, { color: dc.textSecondary }]}>{t('business.create.intro')}</Text>
        {pending ? (
          <View style={[styles.pending, { backgroundColor: ui.field }]}>
            <Icon name={pending.status === 'rejected' ? 'close-circle-outline' : 'time-outline'} size={22} color={pending.status === 'rejected' ? ui.expenseText : ui.accent} />
            <View style={styles.flex}>
              <Text style={[styles.optionTitle, { color: dc.textPrimary }]}>
                {pending.status === 'rejected' ? t('business.join.rejectedTitle') : t('business.join.pendingTitle')}
              </Text>
              <Text style={[styles.optionSub, { color: dc.textSecondary }]}>
                {pending.status === 'rejected'
                  ? t('business.join.rejectedBody', { name: pending.businessName })
                  : t('business.join.pendingBody', { name: pending.businessName })}
              </Text>
            </View>
            <PillButton
              label={pending.status === 'rejected' ? t('common.close') : t('settings.cancel')}
              tone="soft"
              onPress={() => useBusinessStore.getState().cancelRequest().catch(() => {})}
            />
          </View>
        ) : (
          <>
            {option('business', t('business.create.createOption'), t('business.create.createOptionHint'), () => {
              if (!isPremium) {
                setShowPremium(true);
                return;
              }
              setStep('name');
            }, isPremium ? undefined : t('premium.badge'))}
            {option('people', t('business.create.joinOption'), t('business.create.joinOptionHint'), () => setStep('join'))}
          </>
        )}
        <Note icon="shield-checkmark-outline" text={t('business.settings.legal')} style={styles.legal} />
      </>
    );
  } else if (step === 'name') {
    body = (
      <>
        <SheetLabel style={styles.firstLabel}>{t('business.create.name')}</SheetLabel>
        <FilledInput value={name} onChangeText={setName} placeholder={t('business.create.namePlaceholder')} maxLength={60} />
        <SheetLabel>{t('business.create.template')}</SheetLabel>
        <View style={styles.grid}>
          {CREATABLE_TEMPLATES.map((tpl) => {
            const on = tpl.id === template;
            return (
              <TouchableOpacity
                key={tpl.id}
                style={[styles.tile, { backgroundColor: on ? withAlpha(ui.accent, 0.1) : ui.field, borderColor: on ? ui.accent : 'transparent' }]}
                onPress={() => pickTemplate(tpl.id)}
                activeOpacity={0.8}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
              >
                <View style={[styles.tileIcon, { backgroundColor: ui.sheet }]}>
                  <Icon name={tpl.icon as IconName} size={18} color={ui.accent} />
                </View>
                <Text style={[styles.tileText, { color: dc.textPrimary }]} numberOfLines={2}>{t(`business.tpl.name.${tpl.id}`)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={[styles.hint, { color: dc.textSecondary }]}>{t(`business.tpl.desc.${template}`)}</Text>
      </>
    );
    footer = <SheetButton label={t('common.next')} disabled={!name.trim()} onPress={() => setStep('mode')} />;
  } else if (step === 'mode') {
    body = (
      <>
        <Text style={[styles.intro, { color: dc.textSecondary }]}>{t('business.create.modeIntro')}</Text>
        {modeCard('simple', mode === 'simple', t('business.mode.simple'), [
          t('business.create.simple1'), t('business.create.simple2'), t('business.create.simple3'),
        ], () => setMode('simple'))}
        {modeCard('expert', mode === 'expert', t('business.mode.expert'), [
          t('business.create.expert1'), t('business.create.expert2'), t('business.create.expert3'),
        ], () => setMode('expert'))}
        {mode === 'expert' && (
          <>
            <SheetLabel>{t('business.create.method')}</SheetLabel>
            {modeCard('tills', method === 'tills', t('business.mode.tills'), [t('business.create.tills1'), t('business.create.tills2')], () => setMethod('tills'))}
            {modeCard('orders', method === 'orders', t('business.mode.orders'), [t('business.create.orders1'), t('business.create.orders2')], () => setMethod('orders'))}
          </>
        )}
        <Text style={[styles.hint, { color: dc.textSecondary }]}>{t('business.create.changeLater')}</Text>
      </>
    );
    footer = <SheetButton label={t('common.next')} onPress={() => setStep('details')} />;
  } else if (step === 'details') {
    body = (
      <>
        <SheetLabel style={styles.firstLabel}>{t('business.create.howCharge')}</SheetLabel>
        <ChipRow>
          {choices.map((c) => (
            <Chip
              key={c.key}
              label={c.name}
              selected={channels.includes(c.key)}
              onPress={() => setChannels((prev) => (prev.includes(c.key) ? prev.filter((x) => x !== c.key) : [...prev, c.key]))}
            />
          ))}
        </ChipRow>
        <SheetLabel>{t('business.create.workers')}</SheetLabel>
        {workers.length > 0 && (
          <ChipRow style={styles.workers}>
            {workers.map((w) => (
              <Chip key={w} label={w} icon="close" onPress={() => setWorkers((prev) => prev.filter((x) => x !== w))} />
            ))}
          </ChipRow>
        )}
        <View style={styles.inline}>
          <FilledInput
            value={workerInput}
            onChangeText={setWorkerInput}
            placeholder={t('business.create.workerPlaceholder')}
            containerStyle={styles.flex}
            maxLength={40}
            returnKeyType="done"
            onSubmitEditing={() => {
              const w = workerInput.trim();
              if (w && !workers.includes(w)) setWorkers((prev) => [...prev, w]);
              setWorkerInput('');
            }}
          />
          <TouchableOpacity
            style={[styles.addSmall, { backgroundColor: dc.primary }, !workerInput.trim() && styles.disabled]}
            disabled={!workerInput.trim()}
            onPress={() => {
              const w = workerInput.trim();
              if (w && !workers.includes(w)) setWorkers((prev) => [...prev, w]);
              setWorkerInput('');
            }}
            accessibilityRole="button"
            accessibilityLabel={t('common.add')}
          >
            <Icon name="add" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        <Text style={[styles.hint, { color: dc.textSecondary }]}>{t('business.create.workersHint')}</Text>
      </>
    );
    footer = <SheetButton label={t('business.create.create')} icon="checkmark" loading={busy} disabled={!channels.length} onPress={create} />;
  } else {
    body = (
      <>
        <Text style={[styles.intro, { color: dc.textSecondary }]}>{t('business.join.intro')}</Text>
        <FilledInput
          value={code}
          onChangeText={(v) => { setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '')); setJoinError(null); }}
          placeholder={t('business.join.placeholder')}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={12}
          autoFocus
        />
        {joinError ? <Text style={[styles.error, { color: ui.expenseText }]}>{joinError}</Text> : null}
      </>
    );
    footer = <SheetButton label={t('business.join.send')} loading={busy} disabled={code.length < 4} onPress={join} />;
  }

  return (
    <View style={[styles.flex, { backgroundColor: ui.sheet }]} onTouchEnd={keyboard.onTouchEnd}>
      {ImeHeightView ? (
        <ImeHeightView style={styles.imeProbe} pointerEvents="none" onImeChange={(e) => keyboard.onIme(e.nativeEvent.height)} />
      ) : null}
      {/* Con el teclado, todo sube lo que tapa y el botón queda a 16 pt de él */}
      <View style={[styles.flex, { paddingBottom: keyboard.cover }]}>
        <HeroScrollScreen
          hero={(
            <HeroTitleBar
              title={titles[step]}
              onBack={step === 'choose' ? undefined : back}
              right={<HeroIconButton icon="close" onPress={onClose} accessibilityLabel={t('common.close')} size={36} />}
            />
          )}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.pad}>{body}</View>
        </HeroScrollScreen>
        {footer ? (
          <View
            style={[
              styles.footer,
              {
                paddingBottom: keyboard.cover > 0 ? KEYBOARD_GAP : Math.max(16, insets.bottom + 8),
                backgroundColor: ui.sheet,
                borderTopColor: ui.hair,
              },
            ]}
          >
            {footer}
          </View>
        ) : null}
      </View>
      <PremiumModal visible={showPremium} onDismiss={() => setShowPremium(false)} onPurchase={() => setShowPremium(false)} />
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  imeProbe: { position: 'absolute', width: 0, height: 0 },
  pad: { paddingHorizontal: 20, paddingBottom: 40 },
  intro: { fontSize: 14, fontFamily: 'Poppins_400Regular', lineHeight: 20, marginBottom: 14 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 20, padding: 16, marginBottom: 10 },
  optionIcon: { width: 46, height: 46, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  optionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  optionTitle: { fontSize: 16, fontFamily: 'Poppins_600SemiBold' },
  optionSub: { fontSize: 12.5, fontFamily: 'Poppins_400Regular', marginTop: 2 },
  badge: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontFamily: 'Poppins_600SemiBold' },
  pending: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, padding: 16 },
  legal: { marginTop: 18 },
  firstLabel: { marginTop: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    width: '48.5%', flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 16, borderWidth: 1.5, padding: 10,
  },
  tileIcon: { width: 34, height: 34, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  tileText: { flex: 1, fontSize: 13, fontFamily: 'Poppins_500Medium' },
  hint: { fontSize: 12.5, fontFamily: 'Poppins_400Regular', marginTop: 10, lineHeight: 18 },
  modeCard: { borderRadius: 18, borderWidth: 1.5, padding: 14, marginBottom: 10, gap: 4 },
  modeHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  modeTitle: { fontSize: 16, fontFamily: 'Poppins_700Bold' },
  modeLine: { fontSize: 13, fontFamily: 'Poppins_400Regular' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  workers: { marginBottom: 8 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addSmall: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  disabled: { opacity: 0.4 },
  error: { fontSize: 13, fontFamily: 'Poppins_500Medium', marginTop: 8 },
  footer: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});

export default CreateBusinessModal;
