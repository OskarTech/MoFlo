import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import * as Notifications from 'expo-notifications';
import i18n from '../i18n';
import { SharedAccount, Movement, RecurringMovement } from '../types';
import { CURRENCIES, ColorPaletteId } from './settingsStore';

const STORAGE_KEY = '@moflo_shared_account';
const ACTIVE_KEY = '@moflo_active_account';
const NOTIF_KEY = '@moflo_shared_notif';

const generateInviteCode = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 6 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
};

export const generateInviteLink = (code: string, name: string): string => {
  const encoded = encodeURIComponent(name);
  return `https://oskartech.github.io/join.html?code=${code}&name=${encoded}`;
};

let accountUnsubscribe: (() => void) | null = null;
let movementsUnsubscribe: (() => void) | null = null;
let recurringUnsubscribe: (() => void) | null = null;

interface SharedAccountStore {
  sharedAccount: SharedAccount | null;
  sharedMovements: Movement[];
  sharedRecurring: RecurringMovement[];
  isSharedMode: boolean;
  notificationsEnabled: boolean;
  sharedCurrencyCode: string;
  sharedColorPalette: ColorPaletteId;
  sharedDateFormat: string;
  isLoading: boolean;

  loadSharedAccount: () => Promise<void>;
  createSharedAccount: (name: string) => Promise<void>;
  joinSharedAccount: (code: string) => Promise<boolean>;
  leaveSharedAccount: () => Promise<void>;
  deleteSharedAccount: () => Promise<void>;
  setSharedMode: (enabled: boolean) => Promise<void>;
  setNotificationsEnabled: (enabled: boolean) => Promise<void>;
  getInviteLink: () => string;
  subscribeToSharedMovements: (accountId: string) => void;
  unsubscribeAll: () => void;
  loadSharedSettings: (accountId: string) => Promise<void>;
  saveSharedSettings: (accountId: string, settings: { currencyCode?: string; colorPalette?: ColorPaletteId; dateFormat?: string }) => Promise<void>;
  getSharedCurrencySymbol: () => string;
  resetStore: () => void;
}

export const useSharedAccountStore = create<SharedAccountStore>((set, get) => ({
  sharedAccount: null,
  sharedMovements: [],
  sharedRecurring: [],
  isSharedMode: false,
  notificationsEnabled: true,
  sharedCurrencyCode: 'EUR',
  sharedColorPalette: 'blue',
  sharedDateFormat: 'DD/MM/YYYY',
  isLoading: false,

  resetStore: () => {
    if (accountUnsubscribe) { accountUnsubscribe(); accountUnsubscribe = null; }
    if (movementsUnsubscribe) { movementsUnsubscribe(); movementsUnsubscribe = null; }
    if (recurringUnsubscribe) { recurringUnsubscribe(); recurringUnsubscribe = null; }
    set({
      sharedAccount: null,
      sharedMovements: [],
      sharedRecurring: [],
      isSharedMode: false,
      sharedCurrencyCode: 'EUR',
      sharedColorPalette: 'blue',
      sharedDateFormat: 'DD/MM/YYYY',
    });
  },

  unsubscribeAll: () => {
    if (accountUnsubscribe) { accountUnsubscribe(); accountUnsubscribe = null; }
    if (movementsUnsubscribe) { movementsUnsubscribe(); movementsUnsubscribe = null; }
    if (recurringUnsubscribe) { recurringUnsubscribe(); recurringUnsubscribe = null; }
    const { useSavingsStore } = require('./savingsStore');
    useSavingsStore.getState().unsubscribeSharedHuchas();
    const { useSharedCategoryStore } = require('./sharedCategoryStore');
    useSharedCategoryStore.getState().resetSharedCategories();
  },

  // ── LISTENER MOVIMIENTOS EN TIEMPO REAL ───────────────────────
  subscribeToSharedMovements: (accountId) => {
    if (movementsUnsubscribe) { movementsUnsubscribe(); movementsUnsubscribe = null; }
    if (recurringUnsubscribe) { recurringUnsubscribe(); recurringUnsubscribe = null; }

    const { useMovementStore } = require('./movementStore');
    const { useSavingsStore } = require('./savingsStore');
    useSavingsStore.getState().subscribeToSharedHuchas(accountId);

    let isFirstSnapshot = true;

    movementsUnsubscribe = firestore()
      .collection('sharedAccounts').doc(accountId)
      .collection('movements')
      .onSnapshot((snap) => {
        const movements = snap.docs
          .map(d => d.data() as Movement)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        useMovementStore.setState({ movements: [...movements] });

        if (!isFirstSnapshot) {
          const currentUid = auth().currentUser?.uid;
          const { notificationsEnabled, sharedAccount } = get();
          if (notificationsEnabled && currentUid) {
            snap.docChanges().forEach((change) => {
              if (change.type === 'added') {
                const movement = change.doc.data() as Movement;
                if (movement.addedBy && movement.addedBy !== currentUid) {
                  const authorName = sharedAccount?.memberNames?.[movement.addedBy]
                    ?? i18n.t('sharedAccount.someone');
                  Notifications.scheduleNotificationAsync({
                    content: {
                      title: i18n.t('sharedAccount.notifMovementTitle'),
                      body: i18n.t('sharedAccount.notifMovementBody', { name: authorName }),
                    },
                    trigger: null,
                  }).catch(() => {});
                }
              }
            });
          }
        }
        isFirstSnapshot = false;
      }, (e) => {
        console.error('Error listening to shared movements:', e);
      });

    recurringUnsubscribe = firestore()
      .collection('sharedAccounts').doc(accountId)
      .collection('recurring')
      .onSnapshot((snap) => {
        const recurring = snap.docs
          .map(d => d.data() as RecurringMovement)
          .sort((a, b) => a.recurringDay - b.recurringDay);
        useMovementStore.setState({ recurringMovements: [...recurring] });
      }, (e) => {
        console.error('Error listening to shared recurring:', e);
      });
  },

  // ── CARGAR CUENTA COMPARTIDA ───────────────────────────────────
  loadSharedAccount: async () => {
    set({ isLoading: true });
    try {
      const uid = auth().currentUser?.uid;
      if (!uid) return;

      const activeMode = await AsyncStorage.getItem(ACTIVE_KEY);
      const notifPref = await AsyncStorage.getItem(`${NOTIF_KEY}_${uid}`);
      if (notifPref !== null) set({ notificationsEnabled: notifPref === 'true' });
      if (activeMode === 'shared') set({ isSharedMode: true });

      const snap = await firestore()
        .collection('sharedAccounts')
        .where('members', 'array-contains', uid)
        .limit(1)
        .get();

      if (!snap.empty) {
        const account = { id: snap.docs[0].id, ...snap.docs[0].data() } as SharedAccount;
        set({ sharedAccount: account });
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(account));

        // Listener cuenta en tiempo real
        if (accountUnsubscribe) accountUnsubscribe();
        accountUnsubscribe = firestore()
          .collection('sharedAccounts')
          .doc(account.id)
          .onSnapshot((doc) => {
            if (doc.exists()) {
              const updated = { id: doc.id, ...doc.data() } as SharedAccount;
              set({ sharedAccount: updated });
              AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
            } else {
              set({
                sharedAccount: null,
                isSharedMode: false,
                sharedMovements: [],
                sharedRecurring: [],
              });
              AsyncStorage.removeItem(STORAGE_KEY);
              AsyncStorage.setItem(ACTIVE_KEY, 'individual');
            }
          }, (e) => {
            console.error('Error listening to shared account:', e);
          });

        if (activeMode === 'shared') {
          get().subscribeToSharedMovements(account.id);
          await get().loadSharedSettings(account.id);
        }
      } else {
        set({ sharedAccount: null, isSharedMode: false });
        await AsyncStorage.removeItem(STORAGE_KEY);
        await AsyncStorage.setItem(ACTIVE_KEY, 'individual');
      }
    } catch (e) {
      const cached = await AsyncStorage.getItem(STORAGE_KEY);
      if (cached) set({ sharedAccount: JSON.parse(cached) });
    } finally {
      set({ isLoading: false });
    }
  },

  // ── CREAR CUENTA ───────────────────────────────────────────────
  createSharedAccount: async (name) => {
    const uid = auth().currentUser?.uid;
    const { useSettingsStore } = require('./settingsStore');
    const displayName = useSettingsStore.getState().displayName
      || auth().currentUser?.displayName
      || auth().currentUser?.email?.split('@')[0]
      || 'Usuario';
    if (!uid) return;

    const inviteCode = generateInviteCode();
    const accountId = `shared_${uid}_${Date.now()}`;

    const newAccount: SharedAccount = {
      id: accountId,
      name,
      createdBy: uid,
      members: [uid],
      memberNames: { [uid]: displayName },
      inviteCode,
      createdAt: new Date().toISOString(),
    };

    await firestore()
      .collection('sharedAccounts')
      .doc(accountId)
      .set(newAccount);

    set({ sharedAccount: newAccount });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newAccount));

    if (accountUnsubscribe) accountUnsubscribe();
    accountUnsubscribe = firestore()
      .collection('sharedAccounts')
      .doc(accountId)
      .onSnapshot((doc) => {
        if (doc.exists()) {
          const updated = { id: doc.id, ...doc.data() } as SharedAccount;
          set({ sharedAccount: updated });
          AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        }
      });
  },

  // ── UNIRSE A CUENTA ────────────────────────────────────────────
  joinSharedAccount: async (code) => {
    const uid = auth().currentUser?.uid;
    const { useSettingsStore } = require('./settingsStore');
    const displayName = useSettingsStore.getState().displayName
      || auth().currentUser?.displayName
      || auth().currentUser?.email?.split('@')[0]
      || 'Usuario';
    if (!uid) return false;

    try {
      const snap = await firestore()
        .collection('sharedAccounts')
        .where('inviteCode', '==', code.toUpperCase().trim())
        .limit(1)
        .get();

      if (snap.empty) return false;

      const doc = snap.docs[0];
      const account = { id: doc.id, ...doc.data() } as SharedAccount;

      if (account.members.includes(uid)) {
        set({ sharedAccount: account });
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(account));
        return true;
      }

      const updatedMembers = [...account.members, uid];
      const updatedNames = { ...account.memberNames, [uid]: displayName };

      await doc.ref.update({
        members: updatedMembers,
        memberNames: updatedNames,
      });

      const updatedAccount: SharedAccount = {
        ...account,
        members: updatedMembers,
        memberNames: updatedNames,
      };

      set({ sharedAccount: updatedAccount });
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedAccount));

      if (accountUnsubscribe) accountUnsubscribe();
      accountUnsubscribe = firestore()
        .collection('sharedAccounts')
        .doc(account.id)
        .onSnapshot((doc) => {
          if (doc.exists()) {
            const updated = { id: doc.id, ...doc.data() } as SharedAccount;
            set({ sharedAccount: updated });
            AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
          }
        });

      return true;
    } catch (e) {
      console.error('Error joining shared account:', e);
      return false;
    }
  },

  // ── SALIR DE CUENTA ────────────────────────────────────────────
  leaveSharedAccount: async () => {
    const uid = auth().currentUser?.uid;
    const { sharedAccount } = get();
    if (!uid || !sharedAccount) return;

    const updatedMembers = sharedAccount.members.filter(m => m !== uid);
    const updatedNames = { ...sharedAccount.memberNames };
    delete updatedNames[uid];

    await firestore()
      .collection('sharedAccounts')
      .doc(sharedAccount.id)
      .update({ members: updatedMembers, memberNames: updatedNames });

    get().unsubscribeAll();
    set({
      sharedAccount: null,
      isSharedMode: false,
      sharedMovements: [],
      sharedRecurring: [],
    });
    await AsyncStorage.removeItem(STORAGE_KEY);
    await AsyncStorage.setItem(ACTIVE_KEY, 'individual');
  },

  // ── ELIMINAR CUENTA ────────────────────────────────────────────
  deleteSharedAccount: async () => {
    const { sharedAccount } = get();
    if (!sharedAccount) return;

    const batch = firestore().batch();

    const ref = firestore().collection('sharedAccounts').doc(sharedAccount.id);
    const subcollections = ['movements', 'recurring', 'categories', 'huchas', 'huchaMovements', 'savings'];

    for (const sub of subcollections) {
      const snap = await ref.collection(sub).get();
      snap.docs.forEach(doc => batch.delete(doc.ref));
    }

    await batch.commit();

    await firestore()
      .collection('sharedAccounts')
      .doc(sharedAccount.id)
      .delete();

    get().unsubscribeAll();
    set({
      sharedAccount: null,
      isSharedMode: false,
      sharedMovements: [],
      sharedRecurring: [],
    });
    await AsyncStorage.removeItem(STORAGE_KEY);
    await AsyncStorage.setItem(ACTIVE_KEY, 'individual');
  },

  // ── MODO COMPARTIDO ────────────────────────────────────────────
  setSharedMode: async (enabled) => {
    const { sharedAccount } = get();
    set({ isSharedMode: enabled });
    await AsyncStorage.setItem(ACTIVE_KEY, enabled ? 'shared' : 'individual');

    if (enabled && sharedAccount) {
      get().subscribeToSharedMovements(sharedAccount.id);
      await get().loadSharedSettings(sharedAccount.id);
    } else {
      if (movementsUnsubscribe) { movementsUnsubscribe(); movementsUnsubscribe = null; }
      if (recurringUnsubscribe) { recurringUnsubscribe(); recurringUnsubscribe = null; }
      const { useSavingsStore } = require('./savingsStore');
      useSavingsStore.getState().unsubscribeSharedHuchas();
      set({ sharedMovements: [], sharedRecurring: [] });
    }
  },

  setNotificationsEnabled: async (enabled) => {
    const uid = auth().currentUser?.uid;
    set({ notificationsEnabled: enabled });
    await AsyncStorage.setItem(`${NOTIF_KEY}_${uid}`, String(enabled));
  },

  getInviteLink: () => {
    const { sharedAccount } = get();
    if (!sharedAccount) return '';
    return generateInviteLink(sharedAccount.inviteCode, sharedAccount.name);
  },

  // ── SETTINGS COMPARTIDOS ───────────────────────────────────────
  loadSharedSettings: async (accountId) => {
    try {
      const cached = await AsyncStorage.getItem(`@moflo_shared_settings_${accountId}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        set({
          sharedCurrencyCode: parsed.currencyCode ?? 'EUR',
          sharedColorPalette: parsed.colorPalette ?? 'blue',
        });
      }

      const doc = await firestore()
        .collection('sharedAccounts').doc(accountId).get();
      const settings = doc.data()?.sharedSettings;
      if (settings) {
        const update: Partial<{ sharedCurrencyCode: string; sharedColorPalette: ColorPaletteId; sharedDateFormat: string }> = {};
        if (settings.currencyCode) update.sharedCurrencyCode = settings.currencyCode;
        if (settings.colorPalette) update.sharedColorPalette = settings.colorPalette as ColorPaletteId;
        if (settings.dateFormat) update.sharedDateFormat = settings.dateFormat;
        set(update);
        await AsyncStorage.setItem(
          `@moflo_shared_settings_${accountId}`,
          JSON.stringify(settings)
        );
      }
    } catch (e) {
      console.error('Error loading shared settings:', e);
    }
  },

  saveSharedSettings: async (accountId, settings) => {
    const current = {
      currencyCode: settings.currencyCode ?? get().sharedCurrencyCode,
      colorPalette: settings.colorPalette ?? get().sharedColorPalette,
      dateFormat: settings.dateFormat ?? get().sharedDateFormat,
    };
    if (settings.currencyCode) set({ sharedCurrencyCode: settings.currencyCode });
    if (settings.colorPalette) set({ sharedColorPalette: settings.colorPalette });
    if (settings.dateFormat) set({ sharedDateFormat: settings.dateFormat });
    await AsyncStorage.setItem(
      `@moflo_shared_settings_${accountId}`,
      JSON.stringify(current)
    );
    try {
      await firestore()
        .collection('sharedAccounts').doc(accountId)
        .set({ sharedSettings: current }, { merge: true });
    } catch (e) {
      console.error('Error saving shared settings:', e);
    }
  },

  getSharedCurrencySymbol: () => {
    const { sharedCurrencyCode } = get();
    return CURRENCIES.find(c => c.code === sharedCurrencyCode)?.symbol ?? '€';
  },
}));