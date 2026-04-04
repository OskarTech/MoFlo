export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
};

export type AppTabParamList = {
  Home: undefined;
  Movements: undefined;
  AddMovement: undefined; // Tab central (no navega, abre modal)
  Annual: undefined;
  Profile: undefined;
};

// Stack de Ajustes accesible desde el header
export type RootStackParamList = {
  AppTabs: undefined;
  Settings: undefined;
  Recurring: undefined;
};

