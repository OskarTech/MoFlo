import { createNavigationContainerRef } from '@react-navigation/native';

// En su propio archivo para poder navegar desde cualquier parte sin importar
// RootNavigator: RootNavigator importa AppNavigator, y AppNavigator (y los
// modales que cuelgan de él) lo importaban de vuelta, formando un ciclo.
export const navigationRef = createNavigationContainerRef<any>();

// Pestaña en la que se estaba antes de entrar en Ajustes: la tuerca está en
// todas las pantallas y volver de Ajustes lleva de vuelta a esa, no a Inicio
let tabBeforeSettings = 'HomeTab';

export const rememberTab = (name: string) => {
  if (name !== 'Settings') tabBeforeSettings = name;
};

export const getTabBeforeSettings = () => tabBeforeSettings;
