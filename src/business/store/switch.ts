import { individualLook, switchAccount, switchAccountNow, SwitchLook } from '../../store/accountSwitch';
import { activateIndividualAccount, activateSharedAccount } from '../../store/activateAccount';
import { readCachedSharedSettings, useSharedAccountStore } from '../../store/sharedAccountStore';
import { resolvePaletteId } from '../../theme';
import { useBusinessStore } from './businessStore';
import { resolveBusinessPalette } from './modeStore';

/**
 * Entrar en la empresa y salir de ella, con la misma pantalla de carga que el
 * cambio entre la individual y la compartida (ver accountSwitch).
 *
 * La empresa va encima de la cuenta en la que se estaba: mientras se está en
 * ella, la individual o la compartida se quedan como estaban, y al salir se
 * vuelve a la elegida. Nada de lo suyo se toca.
 */

const initialOf = (name?: string | null) => (name?.trim()?.charAt(0) || '?').toUpperCase();

/** Lo que enseña la pantalla de carga al ir a la empresa */
export const businessLook = (): SwitchLook | null => {
  const business = useBusinessStore.getState().business;
  if (!business) return null;
  return {
    name: business.name,
    photoURL: null,
    initial: initialOf(business.name),
    paletteId: resolveBusinessPalette(business.colorPalette),
  };
};

const sharedLook = async (): Promise<SwitchLook | null> => {
  const account = useSharedAccountStore.getState().sharedAccount;
  if (!account) return null;
  let paletteId = null;
  try {
    const cached = await readCachedSharedSettings(account.id);
    if (cached) paletteId = resolvePaletteId(cached.sharedColorPalette, true);
  } catch {}
  return { name: account.name, photoURL: account.photoURL, initial: initialOf(account.name), paletteId };
};

/** A la empresa. Devuelve false si no se ha cambiado */
export const switchToBusiness = async (): Promise<boolean> => {
  const look = businessLook();
  if (!look) return false;
  return switchAccount({ look, load: () => useBusinessStore.getState().activate() });
};

/**
 * De la empresa a la individual o a la compartida. before: lo que tiene que
 * terminar antes (salir de la empresa o borrarla)
 */
export const leaveBusinessMode = async (
  target: 'individual' | 'shared',
  { before }: { before?: () => Promise<void> } = {},
): Promise<boolean> => {
  const shared = useSharedAccountStore.getState();
  const look = (target === 'shared' && shared.sharedAccount ? await sharedLook() : null) ?? individualLook();
  return switchAccount({
    look,
    before,
    load: async () => {
      await useBusinessStore.getState().deactivate();
      const { isSharedMode, sharedAccount } = useSharedAccountStore.getState();
      if (target === 'shared' && sharedAccount && !isSharedMode) await activateSharedAccount(sharedAccount.id);
      else if (target === 'individual' && isSharedMode) await activateIndividualAccount();
    },
  });
};

/**
 * Te han sacado de la empresa (o la han borrado) mientras estabas en ella: a
 * la cuenta de debajo, tapando en el acto. work deja la empresa
 */
export const exitBusinessNow = (work: () => Promise<void>) => {
  const { isSharedMode, sharedAccount, sharedColorPalette } = useSharedAccountStore.getState();
  const look: SwitchLook = isSharedMode && sharedAccount
    ? {
      name: sharedAccount.name,
      photoURL: sharedAccount.photoURL,
      initial: initialOf(sharedAccount.name),
      paletteId: resolvePaletteId(sharedColorPalette, true),
    }
    : individualLook();
  switchAccountNow(look, work);
};
