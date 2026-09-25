import type { SharedAccount } from '../types';

export interface MemberLabel {
  name: string;
  /** Ya no está en la cuenta: se enseña tachado */
  isFormer: boolean;
}

/**
 * Con qué nombre se firma lo que añadió un miembro de la cuenta compartida.
 *
 * Al salir o ser expulsado se le quita de `members`, pero su nombre se queda en
 * `memberNames`: así lo que añadió se sigue reconociendo. Si el nombre ya no
 * está (salió antes de este cambio, o borró su cuenta de MoFlo), se usa
 * `formerFallback`.
 */
export const getMemberLabel = (
  account: Pick<SharedAccount, 'members' | 'memberNames'> | null | undefined,
  uid: string | undefined,
  formerFallback: string,
): MemberLabel | undefined => {
  if (!account || !uid) return undefined;
  // Sin lista de miembros (una caché antigua) no se marca a nadie como antiguo
  const isFormer = Array.isArray(account.members) && !account.members.includes(uid);
  const name = account.memberNames?.[uid] || (isFormer ? formerFallback : undefined);
  return name ? { name, isFormer } : undefined;
};
