import { generateInviteCode, isInviteCodeFormat } from '../../store/inviteCodes';
import { Business } from '../types';
import { businessCodeRef } from './refs';

/**
 * Códigos para unirse a una empresa, en `businessInviteCodes/{código}`, aparte
 * de los de las cuentas compartidas: cada código lleva el id y el nombre de
 * su empresa. Se puede leer un código concreto, pero no listarlos. La empresa
 * en sí solo la pueden leer sus socios: quien pide entrar ve el nombre aquí.
 */

const ATTEMPTS = 5;

export { isInviteCodeFormat };

/** Un código que no use ninguna empresa (sin conexión, uno nuevo: las reglas no dejan repetirlo) */
export const generateUniqueBusinessCode = async (): Promise<string> => {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const code = generateInviteCode();
    try {
      if (!(await businessCodeRef(code).get()).exists()) return code;
    } catch {
      return code;
    }
  }
  return generateInviteCode();
};

export interface CodeTarget {
  businessId: string;
  name: string;
}

/** La empresa de un código, o null si no hay ninguna */
export const findBusinessByCode = async (raw: string): Promise<CodeTarget | null> => {
  const code = raw.toUpperCase().trim();
  if (!isInviteCodeFormat(code)) return null;
  const snap = await businessCodeRef(code).get();
  if (!snap.exists()) return null;
  const data = snap.data();
  if (typeof data?.businessId !== 'string') return null;
  return { businessId: data.businessId, name: typeof data.name === 'string' ? data.name : '' };
};

/** Al borrar la empresa, su código, antes que ella: las reglas miran en ella quién la creó */
export const deleteBusinessCode = async (business: Pick<Business, 'id' | 'inviteCode'>): Promise<void> => {
  if (!business.inviteCode || !isInviteCodeFormat(business.inviteCode)) return;
  const ref = businessCodeRef(business.inviteCode);
  try {
    const snap = await ref.get();
    if (snap.exists() && snap.data()?.businessId === business.id) await ref.delete();
  } catch {}
};
