import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import { SharedAccount, Movement, RecurringMovement } from '../types';

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

interface SharedAccountStore {
  sharedAccount: SharedAccount | null;
  isSharedMode: boolean;
  notificationsEnabled: boolean;
  isLoading: boolean;

  loadSharedAccount: () => Promise<void>;
  createSharedAccount: (name: string) => Promise<void>;
  joinSharedAccount: (code: string) => Promise<boolean>;
  leaveSharedAccount: () => Promise<void>;
  deleteSharedAccount: () => Promise<void>;
  setSharedMode: (enabled: boolean) => Promise<void>;
  setNotificationsEnabled: (enabled: boolean) => Promise<void>;
  getInviteLink: () => string;
  resetStore: () => void;
}

export const useSharedAccountStore = create<SharedAccountStore>((set, get) => ({
  sharedAccount: null,
  isSharedMode: false,
  notificationsEnabled: true,
  isLoading: false,

  resetStore: () => set({
    sharedAccount: null,
    isSharedMode: false,
  }),

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

  createSharedAccount: async (name) => {
    const uid = auth().currentUser?.uid;
    const displayName = auth().currentUser?.displayName ?? 'Usuario';
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
  },

  joinSharedAccount: async (code) => {
    const uid = auth().currentUser?.uid;
    const displayName = auth().currentUser?.displayName ?? 'Usuario';
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
      return true;
    } catch (e) {
      console.error('Error joining shared account:', e);
      return false;
    }
  },

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

    set({ sharedAccount: null, isSharedMode: false });
    await AsyncStorage.removeItem(STORAGE_KEY);
    await AsyncStorage.setItem(ACTIVE_KEY, 'individual');
  },

  deleteSharedAccount: async () => {
    const { sharedAccount } = get();
    if (!sharedAccount) return;

    const batch = firestore().batch();

    const movementsSnap = await firestore()
      .collection('sharedAccounts').doc(sharedAccount.id)
      .collection('movements').get();
    movementsSnap.docs.forEach(doc => batch.delete(doc.ref));

    const recurringSnap = await firestore()
      .collection('sharedAccounts').doc(sharedAccount.id)
      .collection('recurring').get();
    recurringSnap.docs.forEach(doc => batch.delete(doc.ref));

    await batch.commit();

    await firestore()
      .collection('sharedAccounts')
      .doc(sharedAccount.id)
      .delete();

    set({ sharedAccount: null, isSharedMode: false });
    await AsyncStorage.removeItem(STORAGE_KEY);
    await AsyncStorage.setItem(ACTIVE_KEY, 'individual');
  },

  setSharedMode: async (enabled) => {
    set({ isSharedMode: enabled });
    await AsyncStorage.setItem(ACTIVE_KEY, enabled ? 'shared' : 'individual');
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
}));