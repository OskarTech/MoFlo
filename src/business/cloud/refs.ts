import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { DELETION_TTL_MS } from '../../store/cloudCheck';

/**
 * Dónde vive cada cosa de la empresa en Firestore (ver firestore.rules):
 *
 *   businesses/{id}            la empresa: nombre, socios (5 como mucho), creador
 *   ├─ config/main             formas de cobro, empleados, proveedores, cajas…
 *   ├─ catalog/main            la carta
 *   ├─ days/{AAAA-MM-DD}       el cierre de cada día
 *   ├─ orders/{id}             los pedidos (pedido a pedido)
 *   ├─ expenses/{id}           los gastos
 *   ├─ recurring/{id}          los fijos
 *   ├─ changes/{id}            el historial de cambios (solo se añade)
 *   ├─ deletedExpenses/{id}    apuntes de borrado, como en las otras cuentas
 *   ├─ deletedRecurring/{id}
 *   └─ joinRequests/{uid}      solicitudes para entrar
 *   businessInviteCodes/{código}
 */

type DocRef = FirebaseFirestoreTypes.DocumentReference;
type ColRef = FirebaseFirestoreTypes.CollectionReference;

/** Lo que se sincroniza por la hora del servidor de su último cambio */
export type BizCollection = 'days' | 'orders' | 'expenses' | 'recurring';

/** Dónde se apuntan los borrados (los pedidos y los días no se borran: se anulan y se reabren) */
export const BIZ_DELETED: Partial<Record<BizCollection, string>> = {
  expenses: 'deletedExpenses',
  recurring: 'deletedRecurring',
};

export const BUSINESS_SUBCOLLECTIONS = [
  'config', 'catalog', 'days', 'orders', 'expenses', 'recurring', 'changes',
  'deletedExpenses', 'deletedRecurring', 'joinRequests',
];

export const businessesCol = (): ColRef => firestore().collection('businesses');
export const businessRef = (businessId: string): DocRef => businessesCol().doc(businessId);
export const configRef = (businessId: string): DocRef => businessRef(businessId).collection('config').doc('main');
export const catalogRef = (businessId: string): DocRef => businessRef(businessId).collection('catalog').doc('main');
export const bizCol = (businessId: string, name: BizCollection | 'changes' | 'joinRequests'): ColRef =>
  businessRef(businessId).collection(name);
export const bizDeletedCol = (businessId: string, name: BizCollection): ColRef | null => {
  const deleted = BIZ_DELETED[name];
  return deleted ? businessRef(businessId).collection(deleted) : null;
};
export const businessCodeRef = (code: string): DocRef => firestore().collection('businessInviteCodes').doc(code);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;

/**
 * Sin los campos undefined, también dentro de los mapas: Firestore rechaza la
 * escritura entera si encuentra uno. Lo que no es un objeto normal (la hora
 * del servidor, los borrados de campo) se deja tal cual
 */
export const deepClean = <T>(value: T): T => {
  if (Array.isArray(value)) return value.map((v) => deepClean(v)) as unknown as T;
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    if (v !== undefined) out[key] = deepClean(v);
  }
  return out as T;
};

/** Lo que se sube: limpio y con la hora del servidor (las reglas la exigen) */
export const stamped = (data: object): Record<string, unknown> => {
  const { updatedAt: _ignored, ...rest } = data as Record<string, unknown>;
  return { ...deepClean(rest), updatedAt: firestore.FieldValue.serverTimestamp() };
};

export const serverNow = () => firestore.FieldValue.serverTimestamp();
export const deleteField = () => firestore.FieldValue.delete();

/** El apunte de un borrado: la hora del servidor y cuándo lo quita Firestore solo */
export const deletionRecord = () => ({
  updatedAt: firestore.FieldValue.serverTimestamp(),
  expireAt: firestore.Timestamp.fromMillis(Date.now() + DELETION_TTL_MS),
});
