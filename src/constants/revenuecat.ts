import { Platform } from 'react-native';

/**
 * Clave pública del SDK de RevenueCat, una por plataforma.
 *
 * Vive aquí, en un único sitio, porque estuvo duplicada en premiumStore y en
 * PremiumModal y las dos copias se desincronizaron: el store usaba la clave de
 * Google también en iOS, así que allí la verificación de la suscripción fallaba
 * al arrancar y el estado premium dependía solo del caché local.
 */
export const REVENUECAT_API_KEY = Platform.OS === 'ios'
  ? 'appl_YQYNRiBuRZKoXZvhaOnPNMJbSES'
  : 'goog_SAFOqDvIHgdKmDuegCaDuzpfZFr';
