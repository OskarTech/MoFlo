import React, { useState, useRef, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import HomeScreen from '../screens/app/HomeScreen';
import MovementsScreen from '../screens/app/MovementsScreen';
import AnnualScreen from '../screens/app/AnnualScreen';
import HuchaScreen from '../screens/app/HuchaScreen';
import HuchaDetailScreen from '../screens/app/HuchaDetailScreen';
import CreateHuchaScreen from '../screens/app/CreateHuchaScreen';
import { useSavingsStore } from '../store/savingsStore';
import SettingsScreen from '../screens/app/SettingsScreen';
import RemindersScreen from '../screens/app/RemindersScreen';
import SupportScreen from '../screens/app/SupportScreen';
import CategoriesScreen from '../screens/app/CategoriesScreen';
import SharedAccountScreen from '../screens/app/SharedAccountScreen';
import SharedCategoriesScreen from '../screens/app/SharedCategoriesScreen';
import AddMovementModal from '../components/movements/AddMovementModal';
import GlassTabBar from '../components/navigation/GlassTabBar';
import PremiumModal from '../components/common/PremiumModal';
import WalkthroughOverlay from '../components/walkthrough/WalkthroughOverlay';
import { useWalkthroughStore } from '../store/walkthroughStore';
import { recordFirstLaunch } from '../utils/firstLaunch';
import { maybePromptForSharedInvite } from '../utils/inviteSharedPrompt';
import { deliverPendingInvite } from '../utils/pendingInvite';
import { navigationRef, rememberTab } from './navigationRef';
import { useMovementStore } from '../store/movementStore';
import { usePremiumStore } from '../store/premiumStore';
import { useCategoryStore } from '../store/categoryStore';
import { useSharedCategoryStore } from '../store/sharedCategoryStore';
import { closeOpenSwipeable } from '../components/common/SwipeableRow';

const Tab = createBottomTabNavigator();
const HuchaStack = createNativeStackNavigator();
const SettingsStack = createNativeStackNavigator();

// Cada pantalla lleva su propia cabecera de color, así que entra deslizándose
// entera desde la derecha, igual en iOS y Android. Con 'fade', en Android la
// pantalla nueva se quedaba invisible (se veía solo el fondo gris).
const STACK_OPTIONS = {
  headerShown: false,
  animation: 'slide_from_right',
  animationDuration: 250,
} as const;

const HuchaNavigator = () => (
  <HuchaStack.Navigator screenOptions={STACK_OPTIONS}>
    <HuchaStack.Screen name="HuchaMain" component={HuchaScreen} />
    <HuchaStack.Screen name="HuchaDetail" component={HuchaDetailScreen} />
    <HuchaStack.Screen name="CreateHucha" component={CreateHuchaScreen} />
  </HuchaStack.Navigator>
);

const SettingsNavigator = () => (
  <SettingsStack.Navigator screenOptions={STACK_OPTIONS}>
    <SettingsStack.Screen name="SettingsMain" component={SettingsScreen} />
    <SettingsStack.Screen name="Support" component={SupportScreen} />
    <SettingsStack.Screen name="Categories" component={CategoriesScreen} />
    <SettingsStack.Screen name="SharedAccount" component={SharedAccountScreen} />
    <SettingsStack.Screen name="SharedCategories" component={SharedCategoriesScreen} />
  </SettingsStack.Navigator>
);

const AppNavigator = () => {
  const { t } = useTranslation();

  const [movementModalVisible, setMovementModalVisible] = useState(false);
  // Lo activan los estados vacíos para abrir el mismo modal que el botón +
  const { showMovementModal, setShowMovementModal } = useMovementStore();
  const [reminderModalVisible, setReminderModalVisible] = useState(false);
  const [premiumModalVisible, setPremiumModalVisible] = useState(false);

  const activeTabRef = useRef('HomeTab');

  useEffect(() => {
    // Tras cerrar sesión y volver a entrar se empieza otra vez en Inicio
    rememberTab('HomeTab');
    // Un enlace de invitación abierto sin sesión o durante el arranque se abre
    // ahora, que ya hay sesión y la navegación de la app existe
    deliverPendingInvite(navigationRef);
    useWalkthroughStore.getState().checkAndStartIfNew();
    recordFirstLaunch();
    // Disparamos el prompt de invitación compartida con un retraso para no competir
    // con la animación de entrada de la app ni con el walkthrough de nuevos usuarios.
    const timer = setTimeout(() => {
      maybePromptForSharedInvite(() => {
        if (navigationRef.isReady()) {
          navigationRef.navigate('Settings', { screen: 'SharedAccount' });
        }
      });
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  const handleFabPress = () => {
    closeOpenSwipeable();
    const current = activeTabRef.current;
    if (current === 'Reminders') {
      setReminderModalVisible(true);
    } else if (current === 'HuchaTab') {
      const { huchas } = useSavingsStore.getState();
      const { isPremium } = usePremiumStore.getState();
      const activeCount = huchas.filter(h => !h.closedAt).length;
      if (!isPremium && activeCount >= 1) {
        setPremiumModalVisible(true);
      } else {
        if (navigationRef.isReady()) {
          navigationRef.navigate('HuchaTab', { screen: 'CreateHucha' });
        }
      }
    } else if (current === 'HuchaDetail') {
      useSavingsStore.getState().setShowAddMoneyModal(true);
    } else if (current === 'HistorialTab' && useMovementStore.getState().activeHistorialFilter === 'recurring') {
      const { recurringMovements } = useMovementStore.getState();
      const { isPremium } = usePremiumStore.getState();
      if (!isPremium && recurringMovements.length >= 5) {
        setPremiumModalVisible(true);
      } else {
        useMovementStore.getState().setShowRecurringModal(true);
      }
    } else if (current === 'Categories') {
      // Solo se entra con premium, así que aquí no hace falta comprobarlo
      useCategoryStore.getState().setShowAddCategoryModal(true);
    } else if (current === 'SharedCategories') {
      useSharedCategoryStore.getState().setShowAddCategoryModal(true);
    } else {
      setMovementModalVisible(true);
    }
  };

  return (
    <>
      {/* Todas las pantallas llevan cabecera de color: hora y batería en blanco */}
      <StatusBar style="light" />
      <Tab.Navigator
        // Barra propia: cápsula de cristal con las pestañas y el + aparte
        tabBar={(props) => <GlassTabBar {...props} onFabPress={handleFabPress} />}
        screenOptions={{ headerShown: false }}
        screenListeners={{
          // Cambiar de pestaña cierra la fila que hubiera deslizada: las pantallas
          // de pestañas no se desmontan, así que se quedaría abierta al volver
          tabPress: () => { closeOpenSwipeable(); },
          state: (e) => {
            const state = e.data?.state;
            if (state) {
              const activeRoute = state.routes[state.index];
              if (activeRoute) rememberTab(activeRoute.name);
              if (activeRoute?.name === 'HuchaTab' && activeRoute.state) {
                const nested = activeRoute.state as any;
                const nestedName = nested.routes[nested.index ?? nested.routes.length - 1]?.name;
                activeTabRef.current = nestedName === 'HuchaDetail' ? 'HuchaDetail' : 'HuchaTab';
              } else if (activeRoute?.name === 'Settings' && activeRoute.state) {
                // Las pantallas de categorías viven dentro de Ajustes: ahí el +
                // crea una categoría. En el resto de Ajustes sigue igual.
                const nested = activeRoute.state as any;
                const nestedName = nested.routes[nested.index ?? nested.routes.length - 1]?.name;
                activeTabRef.current = nestedName === 'Categories' || nestedName === 'SharedCategories'
                  ? nestedName
                  : 'Settings';
              } else {
                activeTabRef.current = activeRoute?.name ?? 'HomeTab';
              }
            }
          },
        }}
      >
        <Tab.Screen
          name="HomeTab"
          component={HomeScreen}
          options={{ tabBarLabel: t('tabs.home') }}
        />
        <Tab.Screen
          name="HistorialTab"
          component={MovementsScreen}
          options={{ tabBarLabel: t('tabs.historial') }}
        />
        <Tab.Screen
          name="AnnualTab"
          component={AnnualScreen}
          options={{ tabBarLabel: t('tabs.annual') }}
        />
        <Tab.Screen
          name="HuchaTab"
          component={HuchaNavigator}
          options={{ tabBarLabel: t('tabs.hucha'), tabBarHideOnKeyboard: true }}
        />

        {/* TABS OCULTOS */}
        <Tab.Screen
          name="Settings"
          component={SettingsNavigator}
          options={{
            tabBarButton: () => null,
            tabBarLabel: '',
            tabBarItemStyle: { display: 'none' },
          }}
        />
        {/* Render callback (no `component` inline): evita que la pantalla se desmonte
            y vuelva a montar en cada render del navegador */}
        <Tab.Screen
          name="Reminders"
          options={{
            tabBarButton: () => null,
            tabBarLabel: '',
            tabBarItemStyle: { display: 'none' },
          }}
        >
          {(props: any) => (
            <RemindersScreen
              {...props}
              modalVisible={reminderModalVisible}
              onModalDismiss={() => setReminderModalVisible(false)}
            />
          )}
        </Tab.Screen>
      </Tab.Navigator>

      <AddMovementModal
        visible={movementModalVisible || showMovementModal}
        onDismiss={() => {
          setMovementModalVisible(false);
          setShowMovementModal(false);
        }}
      />
      <PremiumModal
        visible={premiumModalVisible}
        onDismiss={() => setPremiumModalVisible(false)}
        onPurchase={() => setPremiumModalVisible(false)}
      />
      <WalkthroughOverlay />
    </>
  );
};

export default AppNavigator;