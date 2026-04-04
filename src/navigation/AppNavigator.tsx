import React, { useState } from 'react';
import { View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import { useNavigationState } from '@react-navigation/native';
import HomeScreen from '../screens/app/HomeScreen';
import MovementsScreen from '../screens/app/MovementsScreen';
import AnnualScreen from '../screens/app/AnnualScreen';
import RecurringScreen from '../screens/app/RecurringScreen';
import SettingsScreen from '../screens/app/SettingsScreen';
import RemindersScreen from '../screens/app/RemindersScreen';
import SupportScreen from '../screens/app/SupportScreen';
import AddMovementModal from '../components/movements/AddMovementModal';
import AddRecurringModal from '../components/movements/AddRecurringModal';
import AddTabButton from '../components/common/AddTabButton';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { useTheme } from '../hooks/useTheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const Tab = createBottomTabNavigator();

const AppNavigator = () => {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [movementModalVisible, setMovementModalVisible] = useState(false);
  const [recurringModalVisible, setRecurringModalVisible] = useState(false);
  const [activeTab, setActiveTab] = useState('HomeTab');

  const tabBarBg = isDark ? colors.surfaceDark : '#FFFFFF';
  const tabBarBorder = isDark ? colors.borderDark : '#E5E7EB';
  const activeColor = isDark ? colors.primaryLight : colors.primary;
  const inactiveColor = isDark ? '#FFFFFF' : '#9CA3AF';

  const handleFabPress = () => {
    if (activeTab === 'Reminders') {
      // No FAB para reminders desde aquí
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
            } else if (route.name === 'HistorialTab') {
              iconName = focused ? 'time' : 'time-outline';
            } else if (route.name === 'AnnualTab') {
              iconName = focused ? 'bar-chart' : 'bar-chart-outline';
            } else if (route.name === 'RecurringTab') {
              iconName = focused ? 'repeat' : 'repeat-outline';
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
          name="RecurringTab"
          component={(props: any) => (
            <RecurringScreen
              {...props}
              modalVisible={recurringModalVisible}
              onModalDismiss={() => setRecurringModalVisible(false)}
            />
          )}
          options={{ tabBarLabel: t('tabs.recurring') }}
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
          name="Reminders"
          component={(props: any) => (
            <RemindersScreen {...props} />
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

      <AddMovementModal
        visible={movementModalVisible}
        onDismiss={() => setMovementModalVisible(false)}
      />
      <AddRecurringModal
        visible={recurringModalVisible}
        onDismiss={() => setRecurringModalVisible(false)}
      />
    </>
  );
};

export default AppNavigator;