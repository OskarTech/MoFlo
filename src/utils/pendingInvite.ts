/**
 * Código de invitación que llega por enlace (moflo://join?code=…) y todavía no
 * se ha podido abrir: sin sesión iniciada, o con la app aún arrancando.
 *
 * Antes se navegaba a 'SharedAccount' desde la raíz en el mismo momento. En
 * React Navigation 7 esa navegación no llega a una pantalla que está dentro de
 * Ajustes, así que el enlace no hacía nada; y aunque llegara, sin sesión o con
 * un arranque de más de dos segundos el código se perdía.
 *
 * Solo en memoria: cubre abrir el enlace y a continuación iniciar sesión o
 * registrarse. Si se cierra la app, basta con volver a pulsar el enlace.
 */

// Lo mínimo que se usa de navigationRef; así esto no depende de la navegación
interface InviteNavigation {
  isReady: () => boolean;
  getRootState: () => { routeNames?: string[] } | undefined;
  navigate: (...args: any[]) => void;
}

const RETRY_MS = 100;
const MAX_ATTEMPTS = 50; // 5 segundos

let pendingCode: string | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

// La navegación de la app con sesión ya está montada: su raíz tiene 'Settings'.
// Sin sesión la raíz es la de login y el código se queda esperando.
const appNavigationReady = (nav: InviteNavigation): boolean =>
  nav.isReady() && !!nav.getRootState()?.routeNames?.includes('Settings');

const tryDeliver = (nav: InviteNavigation, attempt: number) => {
  retryTimer = null;
  if (!pendingCode) return;
  if (!appNavigationReady(nav)) {
    // Si no llega a estar lista, lo entrega AppNavigator al montarse
    if (attempt < MAX_ATTEMPTS) {
      retryTimer = setTimeout(() => tryDeliver(nav, attempt + 1), RETRY_MS);
    }
    return;
  }
  const code = pendingCode;
  pendingCode = null;
  // Con la sintaxis anidada: la pantalla vive dentro del navegador de Ajustes
  nav.navigate('Settings', { screen: 'SharedAccount', params: { code } });
};

/** Abre el código pendiente si ya se puede; si no, lo sigue intentando un rato. */
export const deliverPendingInvite = (nav: InviteNavigation) => {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  tryDeliver(nav, 0);
};

/** Guarda el código recibido por enlace y lo abre en cuanto se pueda. */
export const receiveInviteCode = (code: string, nav: InviteNavigation) => {
  pendingCode = code;
  deliverPendingInvite(nav);
};
