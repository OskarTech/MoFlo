import { createNavigationContainerRef } from '@react-navigation/native';

// En su propio archivo para poder navegar desde cualquier parte sin importar
// RootNavigator: RootNavigator importa AppNavigator, y AppNavigator (y los
// modales que cuelgan de él) lo importaban de vuelta, formando un ciclo.
export const navigationRef = createNavigationContainerRef<any>();
