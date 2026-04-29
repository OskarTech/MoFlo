import React, { useState, useRef, useEffect } from 'react';
import { View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import HomeScreen from '../screens/app/HomeScreen';
import MovementsScreen from '../screens/app/MovementsScreen';
import AnnualScreen from '../screens/app/AnnualScreen';
import HuchaScreen from '../screens/app/HuchaScreen';
import HuchaDetailScreen from '../screens/app/HuchaDetailScreen';
import { useSavingsStore } from '../store/savingsStore';
import SettingsScreen from '../screens/app/SettingsScreen';
import RemindersScreen from '../screens/app/RemindersScreen';
import SupportScreen from '../screens/app/SupportScreen';
import CategoriesScreen from '../screens/app/CategoriesScreen';
import SharedAccountScreen from '../screens/app/SharedAccountScreen';
import RecurringScreen from '../screens/app/RecurringScreen';
import SharedCategoriesScreen from '../screens/app/SharedCategoriesScreen';
import AddMovementModal from '../components/movements/AddMovementModal';
import AddTabButton from '../components/common/AddTabButton';
import PremiumModal from '../components/common/PremiumModal';
import WalkthroughOverlay from '../components/walkthrough/WalkthroughOverlay';
import { useWalkthroughStore } from '../store/walkthroughStore';
import { recordFirstLaunch } from '../utils/firstLaunch';
import { maybePromptForSharedInvite } from '../utils/inviteSharedPrompt';
import { navigationRef } from './RootNavigator';
import { useMovementStore } from '../store/movementStore';
import { usePremiumStore } from '../store/premiumStore';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const Tab = createBottomTabNavigator();
const HuchaStack = createNativeStackNavigator();
const SettingsStack = createNativeStackNavigator();

const HuchaNavigator = () => (
  <HuchaStack.Navigator screenOptions={{ headerShown: false }}>
    <HuchaStack.Screen name="HuchaMain" component={HuchaScreen} />
    <HuchaStack.Screen name="HuchaDetail" component={HuchaDetailScreen} />
  </HuchaStack.Navigator>
);

const SettingsNavigator = () => (
  <SettingsStack.Navigator screenOptions={{ headerShown: false }}>
    <SettingsStack.Screen name="SettingsMain" component={SettingsScreen} />
    <SettingsStack.Screen name="Support" component={SupportScreen} />
    <SettingsStack.Screen name="Categories" component={CategoriesScreen} />
    <SettingsStack.Screen name="SharedAccount" component={SharedAccountScreen} />
    <SettingsStack.Screen name="Recurring" component={RecurringScreen} />
    <SettingsStack.Screen name="SharedCategories" component={SharedCategoriesScreen} />
  </SettingsStack.Navigator>
);

const AppNavigator = () => {
  const { t } = useTranslation();
  const { isDark, colors: dc } = useTheme();
  const insets = useSafeAreaInsets();

  const [movementModalVisible, setMovementModalVisible] = useState(false);
  const [reminderModalVisible, setReminderModalVisible] = useState(false);
  const [premiumModalVisible, setPremiumModalVisible] = useState(false);

  const activeTabRef = useRef('HomeTab');

  useEffect(() => {
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

  const tabBarBg = dc.surface;
  const tabBarBorder = isDark ? dc.border : '#E5E7EB';
  const activeColor = isDark ? dc.primaryLight : dc.primary;
  const inactiveColor = isDark ? '#FFFFFF' : '#9CA3AF';

  const handleFabPress = () => {
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
        useSavingsStore.getState().setShowCreateModal(true);
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
    } else {
      setMovementModalVisible(true);
    }
  };

  return (
    <>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: activeColor,
          tabBarInactiveTintColor: inactiveColor,
          tabBarStyle: {
            backgroundColor: tabBarBg,
            borderTopWidth: 0.5,
            borderTopColor: tabBarBorder,
            elevation: 0,
            height: 58 + insets.bottom,
            paddingBottom: insets.bottom + 4,
          },
          tabBarLabelStyle: {
            fontFamily: 'Poppins_500Medium',
            fontSize: 11,
          },
          tabBarIcon: ({ focused, color, size }) => {
            let iconName: keyof typeof Ionicons.glyphMap;
            if (route.name === 'HomeTab') {
              iconName = focused ? 'home' : 'home-outline';
            } else if (route.name === 'HistorialTab') {
              iconName = focused ? 'time' : 'time-outline';
            } else if (route.name === 'AnnualTab') {
              iconName = focused ? 'bar-chart' : 'bar-chart-outline';
            } else if (route.name === 'HuchaTab') {
              iconName = focused ? 'cash' : 'cash-outline';
            } else {
              iconName = 'add';
            }
            return <Ionicons name={iconName} size={size} color={color} />;
          },
        })}
        screenListeners={{
          state: (e) => {
            const state = e.data?.state;
            if (state) {
              const activeRoute = state.routes[state.index];
              if (activeRoute?.name === 'HuchaTab' && activeRoute.state) {
                const nested = activeRoute.state as any;
                const nestedName = nested.routes[nested.index ?? nested.routes.length - 1]?.name;
                activeTabRef.current = nestedName === 'HuchaDetail' ? 'HuchaDetail' : 'HuchaTab';
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
          name="AddMovement"
          component={View as any}
          options={{
            tabBarLabel: '',
            tabBarButton: () => <AddTabButton onPress={handleFabPress} />,
          }}
        />
        <Tab.Screen
          name="AnnualTab"
          component={AnnualScreen}
          options={{ tabBarLabel: t('tabs.annual') }}
        />
        <Tab.Screen
          name="HuchaTab"
          component={HuchaNavigator}
          options={{ tabBarLabel: t('tabs.hucha') }}
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
        <Tab.Screen
          name="Reminders"
          component={(props: any) => (
            <RemindersScreen
              {...props}
              modalVisible={reminderModalVisible}
              onModalDismiss={() => setReminderModalVisible(false)}
            />
          )}
          options={{
            tabBarButton: () => null,
            tabBarLabel: '',
            tabBarItemStyle: { display: 'none' },
          }}
        />
      </Tab.Navigator>

      <AddMovementModal
        visible={movementModalVisible}
        onDismiss={() => setMovementModalVisible(false)}
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