import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const COMPLETED_KEY = '@moflo_walkthrough_completed';

export interface TargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WalkthroughStep {
  id: string;
  tab: 'HomeTab' | 'HistorialTab' | 'AnnualTab' | 'HuchaTab';
  // Si isTab es true, el target se calcula geométricamente (índice de la pestaña en el tab bar).
  isTab?: boolean;
  tabIndex?: 0 | 1 | 2 | 3 | 4;
  // Si target es 'header', el spotlight cubre el header completo (selector de cuenta).
  customTarget?: 'header';
  // Radio del recorte del spotlight (default 14). Usar 'circle' para spotlight totalmente circular.
  spotlightShape?: number | 'circle';
  titleKey: string;
  bodyKey: string;
}

export const WALKTHROUGH_STEPS: WalkthroughStep[] = [
  { id: 'home_balance',     tab: 'HomeTab',      spotlightShape: 24, titleKey: 'walkthrough.balance.title',   bodyKey: 'walkthrough.balance.body' },
  { id: 'home_fab',         tab: 'HomeTab',      isTab: true, tabIndex: 2, spotlightShape: 'circle', titleKey: 'walkthrough.fab.title', bodyKey: 'walkthrough.fab.body' },
  { id: 'recurring',        tab: 'HistorialTab', isTab: true, tabIndex: 1, titleKey: 'walkthrough.recurring.title', bodyKey: 'walkthrough.recurring.body' },
  { id: 'hucha_tab',        tab: 'HuchaTab',     isTab: true, tabIndex: 4, titleKey: 'walkthrough.hucha.title',     bodyKey: 'walkthrough.hucha.body' },
  { id: 'annual_tab',       tab: 'AnnualTab',    isTab: true, tabIndex: 3, titleKey: 'walkthrough.annual.title',    bodyKey: 'walkthrough.annual.body' },
  { id: 'header_account',   tab: 'HomeTab',      customTarget: 'header', titleKey: 'walkthrough.account.title',     bodyKey: 'walkthrough.account.body' },
];

interface WalkthroughStore {
  isActive: boolean;
  currentStep: number;
  targets: Record<string, TargetRect>;

  start: () => void;
  next: () => Promise<void>;
  prev: () => void;
  skip: () => Promise<void>;
  finish: () => Promise<void>;
  registerTarget: (id: string, rect: TargetRect) => void;
  clearTargets: () => void;
  checkAndStartIfNew: () => Promise<void>;
}

export const useWalkthroughStore = create<WalkthroughStore>((set, get) => ({
  isActive: false,
  currentStep: 0,
  targets: {},

  start: () => set({ isActive: true, currentStep: 0, targets: {} }),

  next: async () => {
    const { currentStep } = get();
    if (currentStep >= WALKTHROUGH_STEPS.length - 1) {
      await get().finish();
    } else {
      set({ currentStep: currentStep + 1 });
    }
  },

  prev: () => {
    const { currentStep } = get();
    if (currentStep > 0) set({ currentStep: currentStep - 1 });
  },

  skip: async () => { await get().finish(); },

  finish: async () => {
    set({ isActive: false, currentStep: 0, targets: {} });
    try { await AsyncStorage.setItem(COMPLETED_KEY, '1'); } catch {}
  },

  registerTarget: (id, rect) => {
    set((s) => ({ targets: { ...s.targets, [id]: rect } }));
  },

  clearTargets: () => set({ targets: {} }),

  checkAndStartIfNew: async () => {
    try {
      const done = await AsyncStorage.getItem(COMPLETED_KEY);
      if (done !== '1') {
        setTimeout(() => set({ isActive: true, currentStep: 0, targets: {} }), 800);
      }
    } catch {}
  },
}));
