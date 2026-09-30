import { useMovementStore } from './movementStore';
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
 */
export const activateSharedAccount = async (accountId: string) => {
  const shared = useSharedAccountStore.getState();
  useMovementStore.getState().setSharedAccountId(accountId);
  useSavingsStore.getState().setSharedAccountId(accountId);
  await shared.setSharedMode(true);
  shared.subscribeToSharedMovements(accountId);
  await useMovementStore.getState().loadSharedData(accountId);
  await useSavingsStore.getState().loadSharedHuchas(accountId);
  await useMovementStore.getState().applyRecurringMovements();
  await useSharedCategoryStore.getState().loadSharedCategories(accountId);
  useSharedCategoryStore.getState().subscribeToSharedCategories(accountId);
  await shared.loadSharedSettings(accountId);
};
