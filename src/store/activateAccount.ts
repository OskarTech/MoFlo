import { readSharedCache, useMovementStore } from './movementStore';
import { useSavingsStore } from './savingsStore';
import { useSharedAccountStore } from './sharedAccountStore';
import { useSharedCategoryStore } from './sharedCategoryStore';

/**
 * Pasa la app a la cuenta compartida: desde aquí lo nuevo se guarda en ella,
 * se escuchan sus cambios y se cargan sus movimientos, huchas, categorías y
 * ajustes.
 *
 * Todas las formas de entrar pasan por aquí. Antes cada una hacía su parte:
 * desde Ajustes solo se cambiaba el modo, y con "Abrir cuenta compartida"
 * faltaban las huchas y las categorías. La app enseñaba la cuenta compartida,
 * pero lo que se añadía se guardaba en la personal.
 *
 * La app cambia de golpe: la paleta, la moneda y los movimientos que tenía
 * guardados en el móvil se ponen a la vez que el modo, antes de que llegue
 * nada de la red. Poniendo los movimientos después, Inicio salía un momento
 * con la cuenta compartida y los movimientos de la individual. onSwitched se
 * llama en ese mismo momento: quien lleva a Inicio lo hace ahí, y yendo antes
 * Inicio se veía un momento con la cuenta individual.
 */
export const activateSharedAccount = async (accountId: string, onSwitched?: () => void) => {
  const shared = useSharedAccountStore.getState();
  useMovementStore.getState().setSharedAccountId(accountId);
  useSavingsStore.getState().setSharedAccountId(accountId);
  const cached = await readSharedCache();

  // En el mismo momento en que cambia el modo (sin esperas en medio, así se
  // dibuja una sola vez): sus movimientos y, si hay, la pantalla a la que se va
  let switched = false;
  const switchNow = () => {
    if (switched) return;
    switched = true;
    if (cached) useMovementStore.setState(cached);
    onSwitched?.();
  };
  const unsubscribe = useSharedAccountStore.subscribe((s) => { if (s.isSharedMode) switchNow(); });
  try {
    await shared.setSharedMode(true);
  } finally {
    unsubscribe();
  }
  switchNow();

  shared.subscribeToSharedMovements(accountId);
  await useMovementStore.getState().loadSharedData(accountId);
  await useSavingsStore.getState().loadSharedHuchas(accountId);
  await useMovementStore.getState().applyRecurringMovements();
  await useSharedCategoryStore.getState().loadSharedCategories(accountId);
  useSharedCategoryStore.getState().subscribeToSharedCategories(accountId);
  await shared.loadSharedSettings(accountId);
};
