import React, { useState } from 'react';
import { View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import { useNavigationState } from '@react-navigation/native';
import HomeScreen from '../screens/app/HomeScreen';
import MovementsScreen from '../screens/app/MovementsScreen';
import AnnualScreen from '../screens/app/AnnualScreen';
import ProfileScreen from '../screens/app/ProfileScreen';
import SettingsScreen from '../screens/app/SettingsScreen';
import RecurringScreen from '../screens/app/RecurringScreen';
import RemindersScreen from '../screens/app/RemindersScreen';
import SupportScreen from '../screens/app/SupportScreen';
import AddMovementModal from '../components/movements/AddMovementModal';
import AddTabButton from '../components/common/AddTabButton';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { useTheme } from '../hooks/useTheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PinSetupScreen from '../screens/app/PinSetupScreen';

const Tab = createBottomTabNavigator();

const AppNavigator = () => {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const [movementModalVisible, setMovementModalVisible] = useState(false);
  const [reminderModalVisible, setReminderModalVisible] = useState(false);
  const insets = useSafeAreaInsets();

  // Detecta la tab activa
  const [activeTab, setActiveTab] = useState('HomeTab');

  const tabBarBg = isDark ? colors.surfaceDark : '#FFFFFF';
  const tabBarBorder = isDark ? colors.borderDark : '#E5E7EB';
  const activeColor = isDark ? colors.primaryLight : colors.primary;
  const inactiveColor = isDark ? '#FFFFFF' : '#9CA3AF';
  const [recurringModalVisible, setRecurringModalVisible] = useState(false);

  const handleFabPress = () => {
    if (activeTab === 'Reminders') {
      setReminderModalVisible(true);
    } else if (activeTab === 'Recurring') {
      setRecurringModalVisible(true);
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
            } else if (route.name === 'MovementsTab') {
              iconName = focused ? 'list' : 'list-outline';
            } else if (route.name === 'AnnualTab') {
              iconName = focused ? 'bar-chart' : 'bar-chart-outline';
            } else if (route.name === 'ProfileTab') {
              iconName = focused ? 'person' : 'person-outline';
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
              setActiveTab(activeRoute?.name ?? 'HomeTab');
            }
          },
        }}
      >
        {/* TABS VISIBLES */}
        <Tab.Screen
          name="HomeTab"
          component={HomeScreen}
          options={{ tabBarLabel: t('tabs.home') }}
        />
        <Tab.Screen
          name="MovementsTab"
          component={MovementsScreen}
          options={{ tabBarLabel: t('tabs.movements') }}
        />
        <Tab.Screen
          name="AddMovement"
          component={View as any}
          options={{
            tabBarLabel: '',
            tabBarButton: () => (
              <AddTabButton onPress={handleFabPress} />
            ),
          }}
        />
        <Tab.Screen
          name="AnnualTab"
          component={AnnualScreen}
          options={{ tabBarLabel: t('tabs.annual') }}
        />
        <Tab.Screen
          name="ProfileTab"
          component={ProfileScreen}
          options={{ tabBarLabel: t('tabs.profile') }}
        />

        {/* TABS OCULTOS */}
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
          name="PinSetup"
          component={PinSetupScreen}
          options={{
            tabBarButton: () => null,
            tabBarLabel: '',
            tabBarItemStyle: { display: 'none' },
          }}
        />
        <Tab.Screen
          name="Recurring"
          component={(props: any) => (
            <RecurringScreen
              {...props}
              modalVisible={recurringModalVisible}
              onModalDismiss={() => setRecurringModalVisible(false)}
            />
          )}
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
      </Tab.Navigator>

      {/* Modal de movimientos — todas las pantallas excepto Recordatorios */}
      <AddMovementModal
        visible={movementModalVisible}
        onDismiss={() => setMovementModalVisible(false)}
      />

      {/* Modal de recordatorios — solo en pantalla Recordatorios */}
      {/* Importamos el modal directamente desde RemindersScreen */}
    </>
  );
};

export default AppNavigator;