// Lo primero de todo, antes de cargar la app: en producción la consola se
// silencia para no dejar datos del usuario en el registro del sistema.
import './src/utils/productionLogging';

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
