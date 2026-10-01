import { create } from 'zustand';
import { Keyboard } from 'react-native';
import i18n from '../i18n';
import { ColorPaletteId, resolvePaletteId } from '../theme';
import { reportError } from '../services/crashReporting';
import { useSettingsStore } from './settingsStore';
import { useSharedAccountStore, readCachedSharedSettings } from './sharedAccountStore';
import { activateSharedAccount, activateIndividualAccount } from './activateAccount';

/**
 * Cambio de cuenta (individual ↔ compartida) tapado por una pantalla de carga
 * (AccountSwitchOverlay). Antes la app cambiaba al momento y lo demás llegaba
 * después: durante un instante se veían la paleta, la moneda o los
 * movimientos de la otra cuenta. Ahora la pantalla tapa la app, por debajo se
 * cambia y se carga todo, y al quitarla ya está la cuenta entera.
 */

/** Lo que enseña la pantalla de carga: la cuenta a la que se va */
export interface SwitchLook {
  name: string;
  photoURL?: string | null;
  initial: string;
  /** Su paleta; null si no está en el móvil, y entonces el fondo es neutro */
  paletteId: ColorPaletteId | null;
}

export interface SwitchSession {
  id: number;
  look: SwitchLook;
  /** Tapa en el mismo momento, sin fundido de entrada */
  instant: boolean;
  /** Ya está todo: se desvanece */
  leaving: boolean;
}

export const useAccountSwitchStore = create<{ session: SwitchSession | null }>(() => ({ session: null }));

// Lo mínimo a la vista, para que no parezca un parpadeo, y lo más que se
// espera a la red: pasado ese tiempo se entra igual y lo que falte sigue
// cargando por detrás, como antes
const MIN_MS = 800;
const MAX_LOAD_MS = 6000;
// Salir de la cuenta o borrarla: si no termina en este tiempo, se deja de
// tapar la app y sigue por detrás (al terminar, te saca de la cuenta el
// listener de la cuenta, con su propia pantalla de carga)
const MAX_BEFORE_MS = 60000;

let running = false;
let nextId = 0;
let onCovered: (() => void) | null = null;

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, ms)));

const begin = (look: SwitchLook, instant: boolean) => {
  const id = ++nextId;
  useAccountSwitchStore.setState({ session: { id, look, instant, leaving: false } });
  return id;
};

// Hasta que la pantalla de carga tapa del todo (avisa al terminar de
// aparecer), con un tope por si no llegase a avisar
const waitCovered = () => new Promise<void>((resolve) => {
  const done = () => { clearTimeout(timer); onCovered = null; resolve(); };
  const timer = setTimeout(done, 700);
  onCovered = done;
});

/** Lo llama la pantalla de carga cuando ya tapa del todo */
export const markCovered = () => onCovered?.();

const end = async (id: number) => {
  // Dos fotogramas para que se dibuje la pantalla a la que se ha ido
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  const { session } = useAccountSwitchStore.getState();
  if (session?.id === id) useAccountSwitchStore.setState({ session: { ...session, leaving: true } });
};

/** Lo llama la pantalla de carga cuando ya se ha desvanecido */
export const clearSwitchSession = (id: number) => {
  if (useAccountSwitchStore.getState().session?.id === id) {
    useAccountSwitchStore.setState({ session: null });
  }
};

interface SwitchOptions {
  look: SwitchLook;
  /** Lo que tiene que terminar antes del cambio (salir de la cuenta o borrarla). Si falla, no se cambia y el error llega a quien llama */
  before?: () => Promise<void>;
  /** El cambio y la carga de los datos */
  load: () => Promise<void>;
  /** Con todo listo y aún tapado, p. ej. ir a Inicio */
  onArrive?: () => void;
}

/**
 * Tapa la app, espera a que tape del todo, cambia y carga, y la destapa.
 * Devuelve false si no se ha cambiado: ya había un cambio en marcha o
 * `before` no terminó a tiempo.
 */
export const switchAccount = async ({ look, before, load, onArrive }: SwitchOptions): Promise<boolean> => {
  if (running) return false;
  running = true;
  Keyboard.dismiss();
  const started = Date.now();
  const covered = waitCovered();
  const id = begin(look, false);
  try {
    await covered;
    if (before) {
      const pending = before();
      const finished = await Promise.race([
        pending.then(() => true),
        wait(MAX_BEFORE_MS).then(() => false),
      ]);
      if (!finished) {
        pending.catch((e) => reportError(e, 'cambiar de cuenta: antes del cambio'));
        return false;
      }
    }
    await Promise.race([
      load().catch((e) => reportError(e, 'cambiar de cuenta')),
      wait(MAX_LOAD_MS),
    ]);
    await wait(MIN_MS - (Date.now() - started));
    onArrive?.();
    return true;
  } finally {
    await end(id);
    running = false;
  }
};

/**
 * Para un cambio que ya está pasando y no ha pedido nadie (te han sacado de
 * la cuenta compartida): tapa en el acto, sin fundido, y `work` empieza en ese
 * mismo momento, así el primer dibujo con la otra cuenta ya sale tapado. Si
 * ya hay un cambio en marcha, lo tapa ese.
 */
export const switchAccountNow = (look: SwitchLook, work: () => Promise<void>) => {
  const run = () => {
    try {
      return work();
    } catch (e) {
      return Promise.reject(e);
    }
  };
  if (running) {
    run().catch((e) => reportError(e, 'cambiar de cuenta'));
    return;
  }
  running = true;
  const started = Date.now();
  const id = begin(look, true);
  const done = run();
  (async () => {
    try {
      await Promise.race([done.catch((e) => reportError(e, 'cambiar de cuenta')), wait(MAX_LOAD_MS)]);
      await wait(MIN_MS - (Date.now() - started));
    } finally {
      await end(id);
      running = false;
    }
  })();
};

const initialOf = (name?: string | null) => (name?.trim()?.charAt(0) || '?').toUpperCase();

/** La cuenta individual: tu foto o inicial y tu paleta, que siempre están en el móvil */
export const individualLook = (): SwitchLook => {
  const { displayName, photoURL, colorPalette } = useSettingsStore.getState();
  return {
    name: i18n.t('header.individualAccount'),
    photoURL,
    initial: initialOf(displayName || i18n.t('common.user')),
    paletteId: resolvePaletteId(colorPalette, false),
  };
};

// La compartida: su paleta sale de la copia de sus ajustes en el móvil, que se
// lee al momento. Sin copia, fondo neutro: esperar a la red para pintar la
// pantalla de carga se notaría. Recién creada aún no tiene ajustes: la de siempre
const sharedLook = async (brandNew: boolean): Promise<SwitchLook | null> => {
  const account = useSharedAccountStore.getState().sharedAccount;
  if (!account) return null;
  let paletteId: ColorPaletteId | null = null;
  if (brandNew) {
    paletteId = resolvePaletteId(null, true);
  } else {
    try {
      const cached = await readCachedSharedSettings(account.id);
      if (cached) paletteId = resolvePaletteId(cached.sharedColorPalette, true);
    } catch {}
  }
  return { name: account.name, photoURL: account.photoURL, initial: initialOf(account.name), paletteId };
};

/** A la cuenta compartida. brandNew: la que se acaba de crear */
export const switchToShared = async (
  { onArrive, brandNew = false }: { onArrive?: () => void; brandNew?: boolean } = {},
): Promise<boolean> => {
  if (running) return false;
  const look = await sharedLook(brandNew);
  const account = useSharedAccountStore.getState().sharedAccount;
  if (!look || !account) return false;
  return switchAccount({ look, load: () => activateSharedAccount(account.id), onArrive });
};

/** A la cuenta individual. before: lo que tiene que terminar antes (salir de la compartida o borrarla) */
export const switchToIndividual = (
  { before, onArrive }: { before?: () => Promise<void>; onArrive?: () => void } = {},
): Promise<boolean> =>
  switchAccount({ look: individualLook(), before, load: activateIndividualAccount, onArrive });
