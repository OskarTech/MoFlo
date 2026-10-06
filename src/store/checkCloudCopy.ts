import NetInfo from '@react-native-community/netinfo';
import auth from '@react-native-firebase/auth';
import { useMovementStore } from './movementStore';
import { useSavingsStore } from './savingsStore';
import { useSharedAccountStore } from './sharedAccountStore';
import { lastFullCheck } from './cloudCheck';

export type CloudCheckResult = 'done' | 'offline' | 'failed';

/** La cuenta activa: el uid en la individual, el id de la cuenta en la compartida */
export const activeCloudScope = (): string | null => {
  const { isSharedMode, sharedAccount } = useSharedAccountStore.getState();
  if (isSharedMode && sharedAccount) return sharedAccount.id;
  return auth().currentUser?.uid ?? null;
};

/**
 * Baja de la nube el historial entero de movimientos y de movimientos de
 * huchas de la cuenta activa y lo pone en el móvil (ver cloudCheck). Lo usan
 * «Copia en la nube» en Ajustes, deslizar en Inicio y exportar.
 *
 * unlessCheckedWithinMs: si ya se comprobó hace menos, no se repite.
 */
export const checkCloudCopy = async (
  { unlessCheckedWithinMs }: { unlessCheckedWithinMs?: number } = {},
): Promise<CloudCheckResult> => {
  const scope = activeCloudScope();
  if (!scope) return 'failed';
  if (unlessCheckedWithinMs) {
    const last = await lastFullCheck(scope);
    if (last != null && Date.now() - last < unlessCheckedWithinMs) return 'done';
  }
  const net = await NetInfo.fetch();
  if (!net.isConnected) return 'offline';

  const started = Date.now();
  const { isSharedMode, sharedAccount } = useSharedAccountStore.getState();
  const accountId = isSharedMode && sharedAccount ? sharedAccount.id : null;
  await Promise.all(accountId
    ? [
      useMovementStore.getState().loadSharedData(accountId, { fullCheck: true }),
      useSavingsStore.getState().loadHuchaMovements(accountId, { fullCheck: true }),
    ]
    : [
      useMovementStore.getState().loadData({ fullCheck: true }),
      useSavingsStore.getState().loadHuchaMovements(null, { fullCheck: true }),
    ]);

  // Las cargas no avisan de sus fallos: si ha ido bien, han apuntado la comprobación
  const last = await lastFullCheck(scope);
  return last != null && last >= started ? 'done' : 'failed';
};
