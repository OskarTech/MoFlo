import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

/**
 * Borrado por lotes que respeta el límite de Firestore.
 *
 * Un `writeBatch` admite como mucho 500 escrituras. Varias pantallas construían
 * un único lote recorriendo subcolecciones enteras, así que a un usuario con un
 * año de movimientos le reventaba el borrado. Y como lo irreversible ya se había
 * ejecutado antes, quedaba la cuenta medio destruida y sin vuelta atrás.
 *
 * Se usan 450 y no 500 para dejar margen: el límite lo impone el servidor y no
 * conviene apurarlo.
 */
const MAX_WRITES_PER_BATCH = 450;

type DocRef = FirebaseFirestoreTypes.DocumentReference;

/** Borra las referencias en tantos lotes como haga falta, en orden. */
export const deleteRefsInChunks = async (refs: DocRef[]): Promise<void> => {
  for (let i = 0; i < refs.length; i += MAX_WRITES_PER_BATCH) {
    const chunk = refs.slice(i, i + MAX_WRITES_PER_BATCH);
    const batch = firestore().batch();
    for (const ref of chunk) batch.delete(ref);
    await batch.commit();
  }
};

/**
 * Vacía las subcolecciones indicadas de un documento.
 * Firestore no borra las subcolecciones al borrar el documento padre, así que
 * hay que recorrerlas a mano.
 */
export const deleteSubcollections = async (
  parent: DocRef,
  names: string[],
): Promise<void> => {
  const refs: DocRef[] = [];
  for (const name of names) {
    const snap = await parent.collection(name).get();
    snap.docs.forEach((doc) => refs.push(doc.ref));
  }
  await deleteRefsInChunks(refs);
};
