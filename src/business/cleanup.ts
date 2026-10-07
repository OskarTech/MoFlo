import firestore from '@react-native-firebase/firestore';
import { reportError } from '../services/crashReporting';
import { deleteSubcollections } from '../services/firebase/batchDelete';
import { BUSINESS_ENABLED } from './featureFlag';
import { BUSINESS_SUBCOLLECTIONS, businessesCol } from './cloud/refs';
import { removeBusinessCaches } from './cloud/cache';
import { deleteBusinessCode } from './cloud/codes';
import { useBusinessStore } from './store/businessStore';

/**
 * Lo de la empresa al cerrar sesión y al borrar la cuenta, en una llamada que
 * nunca falla: lo que no se pueda hacer se registra y lo demás sigue.
 */

/** Al cerrar sesión: deja de escuchar y quita la copia del móvil */
export const resetBusinessOnSignOut = async () => {
  try {
    useBusinessStore.getState().reset();
    await removeBusinessCaches();
  } catch (e) {
    reportError(e, 'empresa: cerrar sesión');
  }
};

/**
 * Al borrar la cuenta, como con la compartida: la empresa que creaste se
 * borra entera; de la de otro, sales (y tu nombre se va con tu cuenta)
 */
export const removeBusinessOnAccountDeletion = async (uid: string) => {
  if (BUSINESS_ENABLED) {
    try {
      useBusinessStore.getState().reset();
      const snap = await businessesCol().where('members', 'array-contains', uid).get();
      for (const doc of snap.docs) {
        const data = doc.data();
        if (data.createdBy === uid) {
          await deleteSubcollections(doc.ref, BUSINESS_SUBCOLLECTIONS);
          await deleteBusinessCode({ id: doc.id, inviteCode: data.inviteCode });
          await doc.ref.delete();
        } else {
          await doc.ref.update({
            members: firestore.FieldValue.arrayRemove(uid),
            [`memberNames.${uid}`]: firestore.FieldValue.delete(),
          });
        }
      }
    } catch (e) {
      reportError(e, 'empresa: borrar la cuenta');
    }
  }
  await removeBusinessCaches().catch(() => {});
};
