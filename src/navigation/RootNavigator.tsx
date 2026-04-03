import React, { useState, useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { ActivityIndicator, View, AppState } from 'react-native';
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import AuthNavigator from './AuthNavigator';
import AppNavigator from './AppNavigator';
import PinLockScreen from '../screens/app/PinLockScreen';
import { usePinStore } from '../store/pinStore';

const RootNavigator = () => {
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const { pin, loadPin } = usePinStore();
  const appState = useRef(AppState.currentState);
  const justSetPin = useRef(false);

  useEffect(() => {
    const init = async () => {
      await loadPin();
    };
    init();

    const unsubscribe = auth().onAuthStateChanged((firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });

    // Detecta cuando la app vuelve al primer plano
    const appStateListener = AppState.addEventListener('change', (nextAppState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        // App vuelve al primer plano → bloquea si hay PIN
        const currentPin = usePinStore.getState().pin;
        if (currentPin && !justSetPin.current) {
          setIsLocked(true);
        }
        justSetPin.current = false;
      }
      appState.current = nextAppState;
    });

    return () => {
      unsubscribe();
      appStateListener.remove();
    };
  }, []);

  // Solo bloquea al iniciar la app si ya había un PIN guardado
  useEffect(() => {
    if (user && pin && !justSetPin.current) {
      setIsLocked(true);
    }
  }, [user]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#166634" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {!user ? (
        <AuthNavigator />
      ) : isLocked ? (
        <PinLockScreen onUnlock={() => setIsLocked(false)} />
      ) : (
        <AppNavigator />
      )}
    </NavigationContainer>
  );
};

export default RootNavigator;