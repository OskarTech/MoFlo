import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import GlassTabBar, { TabDef } from '../../components/navigation/GlassTabBar';
import { closeOpenSwipeable } from '../../components/common/SwipeableRow';
import { businessToday, useBusinessStore } from '../store/businessStore';
import { useBizUiStore } from '../store/uiStore';
import BizTodayScreen from '../screens/BizTodayScreen';
import BizSalesScreen from '../screens/BizSalesScreen';
import BizDayScreen from '../screens/BizDayScreen';
import BizExpensesScreen from '../screens/BizExpensesScreen';
import BizSummaryScreen from '../screens/BizSummaryScreen';
import BizSettingsScreen from '../screens/BizSettingsScreen';
import BizListScreen from '../screens/BizListScreen';
import BizMembersScreen from '../screens/BizMembersScreen';
import BizHistoryScreen from '../screens/BizHistoryScreen';
import EntrySheet from '../sheets/EntrySheet';
import ExpenseSheet from '../sheets/ExpenseSheet';
import RecurringSheet from '../sheets/RecurringSheet';
import ItemSheet from '../sheets/ItemSheet';

const Tab = createBottomTabNavigator();
const SalesStack = createNativeStackNavigator();
const SettingsStack = createNativeStackNavigator();

const STACK_OPTIONS = {
  headerShown: false,
  animation: 'slide_from_right',
  animationDuration: 250,
} as const;

const BIZ_TABS: Record<string, TabDef> = {
  BizToday: { label: 'business.tabs.today', icon: 'home-outline', iconOn: 'home' },
  BizSales: { label: 'business.tabs.sales', icon: 'receipt-outline', iconOn: 'receipt' },
  BizExpenses: { label: 'business.tabs.expenses', icon: 'wallet-outline', iconOn: 'wallet' },
  BizSummary: { label: 'business.tabs.summary', icon: 'bar-chart-outline', iconOn: 'bar-chart' },
};

const SalesNavigator = () => (
  <SalesStack.Navigator screenOptions={STACK_OPTIONS}>
    <SalesStack.Screen name="BizSalesMain" component={BizSalesScreen} />
    <SalesStack.Screen name="BizDay" component={BizDayScreen} />
  </SalesStack.Navigator>
);

const SettingsNavigator = () => (
  <SettingsStack.Navigator screenOptions={STACK_OPTIONS}>
    <SettingsStack.Screen name="BizSettingsMain" component={BizSettingsScreen} />
    <SettingsStack.Screen name="BizList" component={BizListScreen} />
    <SettingsStack.Screen name="BizMembers" component={BizMembersScreen} />
    <SettingsStack.Screen name="BizHistory" component={BizHistoryScreen} />
  </SettingsStack.Navigator>
);

// La pantalla de dentro (la de la pila de una pestaña, si la hay)
const deepestRoute = (state: any): string => {
  const route = state?.routes?.[state.index ?? 0];
  if (!route) return 'BizToday';
  return route.state ? deepestRoute(route.state) : route.name;
};

/** Apuntar una venta a mano en un día (sin caja, un encargo de fuera) */
export const openSaleEntry = (dayId = businessToday()) => {
  useBizUiStore.getState().open({ kind: 'entry', dayId });
};

/**
 * La app en la cuenta de empresa: sus pestañas (Hoy, Ventas, Gastos y
 * Resumen), su botón + y sus ventanas. Va en lugar del navegador de la app
 * mientras se está en la empresa (ver RootNavigator); la individual y la
 * compartida siguen como estaban por debajo.
 */
const BusinessNavigator = () => {
  const { t } = useTranslation();
  const sheet = useBizUiStore((s) => s.sheet);
  const close = useBizUiStore((s) => s.close);

  useEffect(() => {
    useBizUiStore.getState().close();
    // Al volver a primer plano, las escuchas al día
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') useBusinessStore.getState().resume();
    });
    return () => sub.remove();
  }, []);

  // Lo de las ventas llega solo de la caja: el + apunta un gasto, salvo en
  // Ventas (una venta a mano) y en las listas de Ajustes (una más)
  const handleFab = () => {
    closeOpenSwipeable();
    const ui = useBizUiStore.getState();
    switch (ui.route) {
      case 'BizSalesMain':
        openSaleEntry();
        return;
      case 'BizList':
        if (ui.list) ui.open({ kind: 'item', list: ui.list });
        return;
      default:
        ui.open({ kind: 'expense' });
    }
  };

  return (
    <>
      <StatusBar style="light" />
      <Tab.Navigator
        tabBar={(props) => <GlassTabBar {...props} tabs={BIZ_TABS} onFabPress={handleFab} />}
        screenOptions={{ headerShown: false }}
        screenListeners={{
          tabPress: () => { closeOpenSwipeable(); },
          state: (e) => {
            const state = (e.data as { state?: unknown })?.state;
            if (state) useBizUiStore.getState().setRoute(deepestRoute(state));
          },
        }}
      >
        <Tab.Screen name="BizToday" component={BizTodayScreen} options={{ tabBarLabel: t('business.tabs.today') }} />
        <Tab.Screen name="BizSales" component={SalesNavigator} options={{ tabBarLabel: t('business.tabs.sales') }} />
        <Tab.Screen name="BizExpenses" component={BizExpensesScreen} options={{ tabBarLabel: t('business.tabs.expenses') }} />
        <Tab.Screen name="BizSummary" component={BizSummaryScreen} options={{ tabBarLabel: t('business.tabs.summary') }} />
        <Tab.Screen
          name="BizSettings"
          component={SettingsNavigator}
          options={{ tabBarButton: () => null, tabBarLabel: '', tabBarItemStyle: { display: 'none' } }}
        />
      </Tab.Navigator>

      <EntrySheet
        visible={sheet?.kind === 'entry'}
        dayId={sheet?.kind === 'entry' ? sheet.dayId : businessToday()}
        entryId={sheet?.kind === 'entry' ? sheet.entryId : undefined}
        onClose={close}
      />
      <ExpenseSheet
        visible={sheet?.kind === 'expense'}
        expenseId={sheet?.kind === 'expense' ? sheet.expenseId : undefined}
        date={sheet?.kind === 'expense' ? sheet.date : undefined}
        onClose={close}
      />
      <RecurringSheet visible={sheet?.kind === 'recurring'} recurringId={sheet?.kind === 'recurring' ? sheet.recurringId : undefined} onClose={close} />
      <ItemSheet
        visible={sheet?.kind === 'item'}
        list={sheet?.kind === 'item' ? sheet.list : 'channels'}
        itemId={sheet?.kind === 'item' ? sheet.itemId : undefined}
        onClose={close}
      />
    </>
  );
};

export default BusinessNavigator;
