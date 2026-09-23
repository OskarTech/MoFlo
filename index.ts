// Lo primero de todo, antes de cargar la app: en producción la consola se
// silencia para no dejar datos del usuario en el registro del sistema.
import './src/utils/productionLogging';

import { registerRootComponent } from 'expo';

import { initCrashReporting } from './src/services/crashReporting';
import App from './App';

// En desarrollo la recogida se apaga aquí: iOS, a diferencia de Android, no lo
// hace por su cuenta y el panel acabaría con los cierres de las dev builds.
initCrashReporting();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
