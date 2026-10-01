import { useMovementStore } from './movementStore';
import { useSavingsStore } from './savingsStore';
import { useSharedAccountStore } from './sharedAccountStore';
import { useSharedCategoryStore } from './sharedCategoryStore';

// Espera a todas aunque alguna falle (si no, se dejaba de esperar a las demás
// y la pantalla de carga se quitaba con ellas a medias); después, el primer error
const settleAll = async (loads: Promise<unknown>[]) => {
  const results = await Promise.allSettled(loads);
  const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failed) throw failed.reason;
};

/**
 * Pasa la app a la cuenta compartida y carga todo lo suyo: desde aquí lo nuevo
 * se guarda en ella, se escuchan sus cambios y se cargan sus movimientos,
 * fijos, huchas, categorías y ajustes. Termina cuando está todo.
 *
 * Todas las formas de entrar pasan por aquí (ver accountSwitch, que tapa la
 * app mientras tanto). Antes cada una hacía su parte: desde Ajustes solo se
 * cambiaba el modo, y con "Abrir cuenta compartida" faltaban las huchas y las
 * categorías. La app enseñaba la compartida, pero lo que se añadía se guardaba
 * en la personal.
 */
export const activateSharedAccount = async (accountId: string) => {
  const shared = useSharedAccountStore.getState();
  useMovementStore.getState().setSharedAccountId(accountId);
  useSavingsStore.getState().setSharedAccountId(accountId);
  await shared.setSharedMode(true);
  shared.subscribeToSharedMovements(accountId);

  // A la vez lo que no depende de lo demás: la espera es la de la más lenta
  await settleAll([
    useMovementStore.getState().loadSharedData(accountId)
      .then(() => useMovementStore.getState().applyRecurringMovements()),
    useSavingsStore.getState().loadSharedHuchas(accountId),
    useSharedCategoryStore.getState().loadSharedCategories(accountId)
      .then(() => useSharedCategoryStore.getState().subscribeToSharedCategories(accountId)),
    shared.loadSharedSettings(accountId),
  ]);
};

/**
 * Vuelve a la cuenta individual y carga sus movimientos, fijos y huchas.
 * Primero se deja de escuchar la compartida: si no, un cambio suyo que llegase
 * mientras tanto se colaba entre los datos personales.
 */
export const activateIndividualAccount = async () => {
  useMovementStore.getState().setSharedAccountId(null);
  useSavingsStore.getState().setSharedAccountId(null);
  await useSharedAccountStore.getState().setSharedMode(false);
  await settleAll([
    useMovementStore.getState().loadData(),
    useSavingsStore.getState().loadHuchas(),
  ]);
};
