import AsyncStorage from '@react-native-async-storage/async-storage';
import firestore from '@react-native-firebase/firestore';
import { SharedAccount } from '../types';
import { reportError } from '../services/crashReporting';
import { SHARED_CACHE, sharedCacheKey } from './sharedCache';

/**
 * Códigos de invitación de las cuentas compartidas.
 *
 * Hasta la 2.0.4, para unirse a una cuenta la app buscaba el código entre
 * todas las cuentas, y por eso las reglas dejaban a cualquiera con sesión
 * listar todas las cuentas: nombres, miembros, fotos y códigos. Desde la 2.0.5
 * cada código tiene su documento en `inviteCodes/{código}` con el id de su
 * cuenta. Se puede leer un código concreto, pero no listarlos, y no se puede
 * sobrescribir: no hay dos cuentas con el mismo código. Las cuentas solo se
 * pueden listar entre las tuyas (ver firestore.rules).
 *
 * Las cuentas que ya existían tienen su código aquí desde el 6 de octubre de
 * 2026. Las que cree la 2.0.4 o anteriores no lo guardan: lo guarda el primer
 * miembro que abre la cuenta con esta versión (ensureInviteCode).
 */

const INVITE_CODE_ATTEMPTS = 5;
const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export const generateInviteCode = (): string =>
  Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

/**
 * Lo que puede ser un código: los de la app son 6 letras y números. Lo que
 * escribe el usuario se comprueba antes de usarlo como id de documento (una
 * barra lo convertiría en otra ruta).
 */
export const isInviteCodeFormat = (code: string) => /^[A-Z0-9]{4,12}$/.test(code);

export const inviteCodeRef = (code: string) => firestore().collection('inviteCodes').doc(code);

/**
 * Un código que no use ninguna cuenta. Si no se puede comprobar (sin
 * conexión), uno nuevo sin más: al crear la cuenta, las reglas no dejan
 * repetirlo (ver createAccountWithInviteCode)
 */
export const generateUniqueInviteCode = async (): Promise<string> => {
  for (let attempt = 0; attempt < INVITE_CODE_ATTEMPTS; attempt++) {
    const code = generateInviteCode();
    try {
      if (!(await inviteCodeRef(code).get()).exists()) return code;
    } catch {
      return code;
    }
  }
  return generateInviteCode();
};

/**
 * Crea la cuenta y su código en el mismo lote: si otra cuenta acaba de
 * quedarse con el código, las reglas rechazan los dos y se prueba con otro.
 * Si el código no se puede guardar por otra razón, se crea la cuenta sola,
 * como antes, y su código lo guarda después ensureInviteCode.
 */
export const createAccountWithInviteCode = async (
  build: (inviteCode: string) => SharedAccount,
): Promise<SharedAccount> => {
  for (let attempt = 0; ; attempt++) {
    const account = build(await generateUniqueInviteCode());
    const accountRef = firestore().collection('sharedAccounts').doc(account.id);
    const codeRef = inviteCodeRef(account.inviteCode);
    try {
      const batch = firestore().batch();
      batch.set(accountRef, account);
      batch.set(codeRef, { accountId: account.id, createdAt: account.createdAt });
      await batch.commit();
      await markInviteCodeSaved(account);
      return account;
    } catch (e) {
      const owner = await codeRef.get().then((d) => (d.exists() ? d.data()?.accountId : null), () => null);
      // Se guardó, pero no llegó la respuesta
      if (owner === account.id) {
        await markInviteCodeSaved(account);
        return account;
      }
      if (owner) {
        if (attempt + 1 < INVITE_CODE_ATTEMPTS) continue;
        throw e;
      }
      reportError(e, 'createSharedAccount: código de invitación');
      await accountRef.set(account);
      return account;
    }
  }
};

/** La cuenta de un código, o null si no hay ninguna */
export const findAccountByInviteCode = async (code: string): Promise<SharedAccount | null> => {
  if (!isInviteCodeFormat(code)) return null;
  const codeDoc = await inviteCodeRef(code).get();
  const accountId = codeDoc.exists() ? codeDoc.data()?.accountId : null;
  if (typeof accountId !== 'string') return null;
  const accountDoc = await firestore().collection('sharedAccounts').doc(accountId).get();
  // La cuenta ya no existe (la borró una versión anterior, que no borra el código)
  if (!accountDoc.exists()) return null;
  const account = { id: accountDoc.id, ...accountDoc.data() } as SharedAccount;
  return account.inviteCode === code ? account : null;
};

// En el móvil, que el código de esta cuenta ya está en inviteCodes: así no se
// vuelve a comprobar en cada inicio
const savedKey = (accountId: string) => sharedCacheKey(SHARED_CACHE.INVITE_CODE, accountId);
const markInviteCodeSaved = (account: SharedAccount) =>
  AsyncStorage.setItem(savedKey(account.id), account.inviteCode).catch(() => {});

/**
 * Guarda el código de una cuenta creada con la 2.0.4 o anteriores, si aún no
 * está. Lo hace cualquier miembro (las reglas solo dejan guardar el código
 * que tiene la cuenta). Si ya lo tiene otra cuenta, alguien lo copió antes: se
 * avisa, porque quien lo use no llegará a esta cuenta.
 */
export const ensureInviteCode = async (account: SharedAccount): Promise<void> => {
  if (!account.inviteCode || !isInviteCodeFormat(account.inviteCode)) return;
  if ((await AsyncStorage.getItem(savedKey(account.id))) === account.inviteCode) return;
  const codeRef = inviteCodeRef(account.inviteCode);
  const snap = await codeRef.get();
  // Sin respuesta del servidor no se sabe si está: en el siguiente inicio
  if (snap.metadata.fromCache) return;
  if (!snap.exists()) {
    await codeRef.set({ accountId: account.id, createdAt: new Date().toISOString() });
  } else if (snap.data()?.accountId !== account.id) {
    reportError(
      new Error(`El código ${account.inviteCode} de ${account.id} lo tiene ${snap.data()?.accountId}`),
      'ensureInviteCode',
    );
    return;
  }
  await markInviteCodeSaved(account);
};

/**
 * Al borrar la cuenta, su código, antes que la cuenta: las reglas miran en
 * ella quién la creó. Si falla, la cuenta se borra igual: un código de una
 * cuenta que ya no existe no lleva a ningún sitio.
 */
export const deleteInviteCode = async (account: SharedAccount): Promise<void> => {
  if (!account.inviteCode || !isInviteCodeFormat(account.inviteCode)) return;
  const codeRef = inviteCodeRef(account.inviteCode);
  try {
    // Solo si es el de esta cuenta
    const snap = await codeRef.get();
    if (snap.exists() && snap.data()?.accountId === account.id) await codeRef.delete();
  } catch {}
};
