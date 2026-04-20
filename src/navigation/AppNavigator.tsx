import React, { useState, useRef } from 'react';
import { View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import HomeScreen from '../screens/app/HomeScreen';
import MovementsScreen from '../screens/app/MovementsScreen';
import AnnualScreen from '../screens/app/AnnualScreen';
import RecurringScreen from '../screens/app/RecurringScreen';
import HuchaScreen from '../screens/app/HuchaScreen';
import HuchaDetailScreen from '../screens/app/HuchaDetailScreen';
import { useSavingsStore } from '../store/savingsStore';
import SettingsScreen from '../screens/app/SettingsScreen';
import RemindersScreen from '../screens/app/RemindersScreen';
import SupportScreen from '../screens/app/SupportScreen';
import CategoriesScreen from '../screens/app/CategoriesScreen';
import SharedAccountScreen from '../screens/app/SharedAccountScreen';
import SharedAccountSettingsScreen from '../screens/app/SharedAccountSettingsScreen';
import SharedCategoriesScreen from '../screens/app/SharedCategoriesScreen';
import AddMovementModal from '../components/movements/AddMovementModal';
import AddTabButton from '../components/common/AddTabButton';
import PremiumModal from '../components/common/PremiumModal';
import { useMovementStore } from '../store/movementStore';
import { usePremiumStore } from '../store/premiumStore';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const Tab = createBottomTabNavigator();

const AppNavigator = () => {
  const { t } = useTranslation();
  const { isDark, colors: dc } = useTheme();
  const insets = useSafeAreaInsets();

  const [movementModalVisible, setMovementModalVisible] = useState(false);
  const [reminderModalVisible, setReminderModalVisible] = useState(false);
  const [premiumModalVisible, setPremiumModalVisible] = useState(false);

  const activeTabRef = useRef('HomeTab');

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
      if (!isPremium && huchas.length >= 1) {
        setPremiumModalVisible(true);
      } else {
        useSavingsStore.getState().setShowCreateModal(true);
      }
    } else if (current === 'HuchaDetail') {
      useSavingsStore.getState().setShowAddMoneyModal(true);
    } else if (current === 'Recurring') {
      useMovementStore.getState().setShowRecurringModal(true);
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
            height: 64 + insets.bottom,
            paddingBottom: insets.bottom + 8,
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
              activeTabRef.current = activeRoute?.name ?? 'HomeTab';
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
          component={HuchaScreen}
          options={{ tabBarLabel: t('tabs.hucha') }}
        />

        {/* TABS OCULTOS */}
        <Tab.Screen
          name="HuchaDetail"
          component={HuchaDetailScreen}
          options={{
            tabBarButton: () => null,
            tabBarLabel: '',
            tabBarItemStyle: { display: 'none' },
          }}
        />
        <Tab.Screen
          name="Recurring"
          component={RecurringScreen}
          options={{
            tabBarButton: () => null,
            tabBarLabel: '',
            tabBarItemStyle: { display: 'none' },
          }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
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
        <Tab.Screen
          name="Support"
          component={SupportScreen}
          options={{
            tabBarButton: () => null,
            tabBarLabel: '',
            tabBarItemStyle: { display: 'none' },
          }}
        />
        <Tab.Screen
          name="Categories"
          component={CategoriesScreen}
          options={{
            tabBarButton: () => null,
            tabBarLabel: '',
            tabBarItemStyle: { display: 'none' },
          }}
        />
        <Tab.Screen
          name="SharedAccount"
          component={SharedAccountScreen}
          options={{
            tabBarButton: () => null,
            tabBarLabel: '',
            tabBarItemStyle: { display: 'none' },
          }}
        />
        <Tab.Screen
          name="SharedAccountSettings"
          component={SharedAccountSettingsScreen}
          options={{
            tabBarButton: () => null,
            tabBarLabel: '',
            tabBarItemStyle: { display: 'none' },
          }}
        />
        <Tab.Screen
          name="SharedCategories"
          component={SharedCategoriesScreen}
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
    </>
  );
};

export default AppNavigator;