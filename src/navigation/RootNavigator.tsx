import React, { useState, useEffect } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { ActivityIndicator, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

export const navigationRef = createNavigationContainerRef<any>();
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import AuthNavigator from './AuthNavigator';
import AppNavigator from './AppNavigator';
import { useMovementStore } from '../store/movementStore';
import { useSettingsStore } from '../store/settingsStore';
import { usePremiumStore } from '../store/premiumStore';
import { useCategoryStore } from '../store/categoryStore';
import { useSharedAccountStore } from '../store/sharedAccountStore';
import { useSharedCategoryStore } from '../store/sharedCategoryStore';
import { useSavingsStore } from '../store/savingsStore';
import { processQueue } from '../services/syncQueue.service';

const RootNavigator = () => {
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
  const [loading, setLoading] = useState(true);

  const { loadData, loadSharedData, applyRecurringMovements, setSharedAccountId } = useMovementStore();
  const { loadSettings } = useSettingsStore();
  const { loadPremium } = usePremiumStore();
  const { loadCategories } = useCategoryStore();
  const { loadSharedAccount } = useSharedAccountStore();

  const initUser = async () => {
    await loadSettings();
    await loadPremium();
    await loadCategories();
    await loadSharedAccount();

    const { isSharedMode: shared, sharedAccount: account } = useSharedAccountStore.getState();

    if (shared && account) {
      setSharedAccountId(account.id);
      useSavingsStore.getState().setSharedAccountId(account.id);
      await loadSharedData(account.id);
      await useSavingsStore.getState().loadSharedHuchas(account.id);
      await applyRecurringMovements();
      await useSavingsStore.getState().applyAutomaticContributions();
      await useSharedCategoryStore.getState().loadSharedCategories(account.id);
      useSharedCategoryStore.getState().subscribeToSharedCategories(account.id);
      await useSharedAccountStore.getState().loadSharedSettings(account.id);
    } else {
      setSharedAccountId(null);
      useSavingsStore.getState().setSharedAccountId(null);
      await loadData();
      await useSavingsStore.getState().loadHuchas();
      await applyRecurringMovements();
      await useSavingsStore.getState().applyAutomaticContributions();
    }
  };

  useEffect(() => {
    const unsubscribeAuth = auth().onAuthStateChanged(async (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
      if (firebaseUser) {
        await initUser();
      }
    });

    let wasConnected: boolean | null = null;
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      const isConnected = !!state.isConnected;
      if (wasConnected === false && isConnected && auth().currentUser) {
        processQueue().catch(() => {});
      }
      wasConnected = isConnected;
    });

    return () => {
      unsubscribeAuth();
      unsubscribeNet();
    };
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#166634" />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      {user ? <AppNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
};

export default RootNavigator;
