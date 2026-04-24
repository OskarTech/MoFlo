import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import HomeScreen from '../screens/app/HomeScreen';
import MovementsScreen from '../screens/app/MovementsScreen';
import AnnualScreen from '../screens/app/AnnualScreen';
import HuchaScreen from '../screens/app/HuchaScreen';
import HuchaDetailScreen from '../screens/app/HuchaDetailScreen';
import SettingsScreen from '../screens/app/SettingsScreen';
import RemindersScreen from '../screens/app/RemindersScreen';
import SupportScreen from '../screens/app/SupportScreen';
import CategoriesScreen from '../screens/app/CategoriesScreen';
import SharedAccountScreen from '../screens/app/SharedAccountScreen';
import RecurringScreen from '../screens/app/RecurringScreen';
import SharedCategoriesScreen from '../screens/app/SharedCategoriesScreen';
import PremiumModal from '../components/common/PremiumModal';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { navigationRef } from './RootNavigator';

const Tab = createBottomTabNavigator();

const VISIBLE_TABS = ['HomeTab', 'HuchaTab', 'AnnualTab', 'HistorialTab'];

const getTabIcon = (routeName: string, focused: boolean): keyof typeof Ionicons.glyphMap => {
  switch (routeName) {
    case 'HomeTab':      return focused ? 'home'      : 'home-outline';
    case 'HuchaTab':    return focused ? 'cash'      : 'cash-outline';
    case 'AnnualTab':   return focused ? 'bar-chart' : 'bar-chart-outline';
    case 'HistorialTab': return focused ? 'menu'     : 'menu-outline';
    default: return 'ellipsis-horizontal';
  }
};

const FloatingTabBar = ({ activeTab }: { activeTab: string }) => {
  const { isDark, colors: dc } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const getLabel = (routeName: string) => {
    switch (routeName) {
      case 'HomeTab':      return t('tabs.home');
      case 'HuchaTab':    return t('tabs.hucha');
      case 'AnnualTab':   return t('tabs.annual');
      case 'HistorialTab': return t('tabs.historial');
      default: return '';
    }
  };

  const activeColor = '#FFFFFF';
  const inactiveColor = isDark ? 'rgba(255,255,255,0.5)' : '#9CA3AF';
  const pillBg = isDark ? dc.primaryLight : dc.primary;

  return (
    <View style={[
      tabStyles.bar,
      {
        bottom: (insets.bottom || 0) + 10,
        backgroundColor: dc.surface,
        borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)',
      },
    ]}>
      {VISIBLE_TABS.map((routeName) => {
        const isFocused = activeTab === routeName;
        const iconColor = isFocused ? activeColor : inactiveColor;

        return (
          <TouchableOpacity
            key={routeName}
            style={tabStyles.tabItem}
            onPress={() => {
              if (!isFocused && navigationRef.isReady()) {
                navigationRef.navigate(routeName as never);
              }
            }}
            activeOpacity={0.75}
          >
            <View style={[tabStyles.pill, isFocused && { backgroundColor: pillBg }]}>
              <Ionicons name={getTabIcon(routeName, isFocused)} size={22} color={iconColor} />
              <Text style={[tabStyles.label, { color: iconColor }]}>{getLabel(routeName)}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const tabStyles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    borderRadius: 24,
    overflow: 'hidden',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    gap: 2,
    minWidth: 64,
  },
  label: {
    fontSize: 10,
    fontFamily: 'Poppins_500Medium',
  },
});

const AppNavigator = () => {
  const [activeTab, setActiveTab] = useState('HomeTab');
  const [reminderModalVisible, setReminderModalVisible] = useState(false);
  const [premiumModalVisible, setPremiumModalVisible] = useState(false);

  return (
    <>
      <Tab.Navigator
        screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}
        screenListeners={{
          state: (e) => {
            const route = e.data?.state?.routes?.[e.data?.state?.index ?? 0];
            if (route) setActiveTab(route.name);
          },
        }}
      >
        <Tab.Screen name="HomeTab" component={HomeScreen} />
        <Tab.Screen name="HuchaTab" component={HuchaScreen} />
        <Tab.Screen name="AnnualTab" component={AnnualScreen} />
        <Tab.Screen name="HistorialTab" component={MovementsScreen} />

        {/* TABS OCULTOS */}
        <Tab.Screen
          name="HuchaDetail"
          component={HuchaDetailScreen}
          options={{ tabBarButton: () => null }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ tabBarButton: () => null }}
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
          options={{ tabBarButton: () => null }}
        />
        <Tab.Screen
          name="Support"
          component={SupportScreen}
          options={{ tabBarButton: () => null }}
        />
        <Tab.Screen
          name="Categories"
          component={CategoriesScreen}
          options={{ tabBarButton: () => null }}
        />
        <Tab.Screen
          name="SharedAccount"
          component={SharedAccountScreen}
          options={{ tabBarButton: () => null }}
        />
        <Tab.Screen
          name="Recurring"
          component={RecurringScreen}
          options={{ tabBarButton: () => null }}
        />
        <Tab.Screen
          name="SharedCategories"
          component={SharedCategoriesScreen}
          options={{ tabBarButton: () => null }}
        />
      </Tab.Navigator>

      {/* Tab bar flotante — fuera del navigator, sin contenedor de React Navigation */}
      <FloatingTabBar activeTab={activeTab} />

      <PremiumModal
        visible={premiumModalVisible}
        onDismiss={() => setPremiumModalVisible(false)}
        onPurchase={() => setPremiumModalVisible(false)}
      />
    </>
  );
};

export default AppNavigator;
