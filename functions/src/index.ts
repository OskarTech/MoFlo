import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, DocumentReference } from 'firebase-admin/firestore';
import { getMessaging, MulticastMessage, SendResponse } from 'firebase-admin/messaging';

initializeApp();
setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });

type Lang = 'en' | 'es' | 'pl' | 'fr' | 'pt' | 'it' | 'de';
const SUPPORTED: Lang[] = ['en', 'es', 'pl', 'fr', 'pt', 'it', 'de'];

// Umbral (en caracteres) por debajo del cual mantenemos el cuerpo con
// descripción; por encima caemos a la versión corta para que la notificación
// no se trunque en la lockscreen.
const FULL_BODY_MAX_LEN = 65;

interface MovementCtx {
  authorName: string;
  type: 'income' | 'expense';
  amount: string; // ya formateado con símbolo, p. ej. "25,50€"
  detail: string; // descripción o categoría traducida
}

interface Strings {
  movementTitle: string;
  movementWithDetail: (c: MovementCtx) => string;
  movementShort: (c: Omit<MovementCtx, 'detail'>) => string;
  joinRequestTitle: string;
  joinRequestBody: (name: string) => string;
  approvedTitle: string;
  approvedBody: (name: string) => string;
  rejectedTitle: string;
  rejectedBody: (name: string) => string;
}

const STRINGS: Record<Lang, Strings> = {
  en: {
    movementTitle: 'New shared movement',
    movementWithDetail: (c) => `${c.authorName} added ${c.type === 'income' ? 'an income' : 'an expense'} of ${c.amount} · ${c.detail}`,
    movementShort: (c) => `${c.authorName} added ${c.type === 'income' ? 'an income' : 'an expense'} of ${c.amount}`,
    joinRequestTitle: 'Join request',
    joinRequestBody: (n) => `${n} wants to join your shared account`,
    approvedTitle: 'Request approved',
    approvedBody: (n) => `You're now part of "${n}"`,
    rejectedTitle: 'Request rejected',
    rejectedBody: (n) => `Your request to join "${n}" was declined`,
  },
  es: {
    movementTitle: 'Nuevo movimiento',
    movementWithDetail: (c) => `${c.authorName} ha añadido ${c.type === 'income' ? 'un ingreso' : 'un gasto'} de ${c.amount} · ${c.detail}`,
    movementShort: (c) => `${c.authorName} ha añadido ${c.type === 'income' ? 'un ingreso' : 'un gasto'} de ${c.amount}`,
    joinRequestTitle: 'Solicitud de unión',
    joinRequestBody: (n) => `${n} quiere unirse a tu cuenta compartida`,
    approvedTitle: 'Solicitud aprobada',
    approvedBody: (n) => `Ya formas parte de "${n}"`,
    rejectedTitle: 'Solicitud rechazada',
    rejectedBody: (n) => `Tu solicitud para unirte a "${n}" fue rechazada`,
  },
  pl: {
    movementTitle: 'Nowa transakcja',
    movementWithDetail: (c) => `${c.authorName} dodał(-a) ${c.type === 'income' ? 'wpływ' : 'wydatek'} ${c.amount} · ${c.detail}`,
    movementShort: (c) => `${c.authorName} dodał(-a) ${c.type === 'income' ? 'wpływ' : 'wydatek'} ${c.amount}`,
    joinRequestTitle: 'Prośba o dołączenie',
    joinRequestBody: (n) => `${n} chce dołączyć do Twojego wspólnego konta`,
    approvedTitle: 'Wniosek zatwierdzony',
    approvedBody: (n) => `Jesteś teraz częścią "${n}"`,
    rejectedTitle: 'Wniosek odrzucony',
    rejectedBody: (n) => `Twój wniosek o dołączenie do "${n}" został odrzucony`,
  },
  fr: {
    movementTitle: 'Nouveau mouvement partagé',
    movementWithDetail: (c) => `${c.authorName} a ajouté ${c.type === 'income' ? 'un revenu' : 'une dépense'} de ${c.amount} · ${c.detail}`,
    movementShort: (c) => `${c.authorName} a ajouté ${c.type === 'income' ? 'un revenu' : 'une dépense'} de ${c.amount}`,
    joinRequestTitle: 'Demande de participation',
    joinRequestBody: (n) => `${n} veut rejoindre votre compte partagé`,
    approvedTitle: 'Demande approuvée',
    approvedBody: (n) => `Vous faites maintenant partie de "${n}"`,
    rejectedTitle: 'Demande rejetée',
    rejectedBody: (n) => `Votre demande pour rejoindre "${n}" a été refusée`,
  },
  pt: {
    movementTitle: 'Novo movimento partilhado',
    movementWithDetail: (c) => `${c.authorName} adicionou ${c.type === 'income' ? 'uma receita' : 'uma despesa'} de ${c.amount} · ${c.detail}`,
    movementShort: (c) => `${c.authorName} adicionou ${c.type === 'income' ? 'uma receita' : 'uma despesa'} de ${c.amount}`,
    joinRequestTitle: 'Pedido de adesão',
    joinRequestBody: (n) => `${n} quer aderir à sua conta partilhada`,
    approvedTitle: 'Pedido aprovado',
    approvedBody: (n) => `Faz agora parte de "${n}"`,
    rejectedTitle: 'Pedido rejeitado',
    rejectedBody: (n) => `O seu pedido para aderir a "${n}" foi rejeitado`,
  },
  it: {
    movementTitle: 'Nuovo movimento condiviso',
    movementWithDetail: (c) => `${c.authorName} ha aggiunto ${c.type === 'income' ? "un'entrata" : 'una spesa'} di ${c.amount} · ${c.detail}`,
    movementShort: (c) => `${c.authorName} ha aggiunto ${c.type === 'income' ? "un'entrata" : 'una spesa'} di ${c.amount}`,
    joinRequestTitle: 'Richiesta di adesione',
    joinRequestBody: (n) => `${n} vuole unirsi al tuo account condiviso`,
    approvedTitle: 'Richiesta approvata',
    approvedBody: (n) => `Ora fai parte di "${n}"`,
    rejectedTitle: 'Richiesta rifiutata',
    rejectedBody: (n) => `La tua richiesta di unirti a "${n}" è stata rifiutata`,
  },
  de: {
    movementTitle: 'Neue geteilte Bewegung',
    movementWithDetail: (c) => `${c.authorName} hat ${c.type === 'income' ? 'eine Einnahme' : 'eine Ausgabe'} von ${c.amount} hinzugefügt · ${c.detail}`,
    movementShort: (c) => `${c.authorName} hat ${c.type === 'income' ? 'eine Einnahme' : 'eine Ausgabe'} von ${c.amount} hinzugefügt`,
    joinRequestTitle: 'Beitrittsanfrage',
    joinRequestBody: (n) => `${n} möchte deinem geteilten Konto beitreten`,
    approvedTitle: 'Anfrage genehmigt',
    approvedBody: (n) => `Du bist jetzt Teil von "${n}"`,
    rejectedTitle: 'Anfrage abgelehnt',
    rejectedBody: (n) => `Deine Anfrage, "${n}" beizutreten, wurde abgelehnt`,
  },
};

// Fallback para el nombre del autor/solicitante cuando no hay displayName.
// Se resuelve por idioma del receptor para no mezclar idiomas en la notificación.
const SOMEONE: Record<Lang, string> = {
  en: 'Someone',
  es: 'Alguien',
  pl: 'Ktoś',
  fr: "Quelqu'un",
  pt: 'Alguém',
  it: 'Qualcuno',
  de: 'Jemand',
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '€',
  USD: '$',
  GBP: '£',
  PLN: 'zł',
  CHF: 'CHF',
  MXN: 'MX$',
};

// Formato europeo con coma decimal para todos los idiomas
// (decisión de producto: consistente y sin milésimas si es entero).
const formatAmount = (amount: number, currency: string): string => {
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
  const [intPart, decPart] = Math.abs(amount).toFixed(2).split('.');
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const formatted = decPart === '00' ? withThousands : `${withThousands},${decPart}`;
  return `${formatted}${symbol}`;
};

const CATEGORY_LABELS: Record<Lang, Record<string, string>> = {
  en: {
    salary: 'Salary', sales: 'Sales', gift: 'Gifts', bonus: 'Bonus',
    housing: 'Home', food: 'Supermarket', transport: 'Transport',
    entertainment: 'Leisure', subscriptions: 'Subscriptions',
    unexpected: 'Unexpected', other: 'Others', freelance: 'Freelance',
    investment: 'Investment', health: 'Health', shopping: 'Shopping',
    education: 'Education', bills: 'Bills', emergency: 'Emergency Fund',
    retirement: 'Retirement', travel: 'Travel',
  },
  es: {
    salary: 'Nómina', sales: 'Ventas', gift: 'Regalos', bonus: 'Bonus',
    housing: 'Hogar', food: 'Supermercado', transport: 'Transporte',
    entertainment: 'Ocio', subscriptions: 'Suscripciones',
    unexpected: 'Imprevistos', other: 'Otros', freelance: 'Freelance',
    investment: 'Inversión', health: 'Salud', shopping: 'Compras',
    education: 'Educación', bills: 'Facturas', emergency: 'Fondo de emergencia',
    retirement: 'Jubilación', travel: 'Viajes',
  },
  pl: {
    salary: 'Wynagrodzenie', sales: 'Sprzedaż', gift: 'Prezenty', bonus: 'Bonus',
    housing: 'Dom', food: 'Supermarket', transport: 'Transport',
    entertainment: 'Rozrywka', subscriptions: 'Subskrypcje',
    unexpected: 'Niespodziewane', other: 'Inne', freelance: 'Freelance',
    investment: 'Inwestycja', health: 'Zdrowie', shopping: 'Zakupy',
    education: 'Edukacja', bills: 'Rachunki', emergency: 'Fundusz awaryjny',
    retirement: 'Emerytura', travel: 'Podróże',
  },
  fr: {
    salary: 'Salaire', sales: 'Ventes', gift: 'Cadeaux', bonus: 'Prime',
    housing: 'Logement', food: 'Supermarché', transport: 'Transport',
    entertainment: 'Loisirs', subscriptions: 'Abonnements',
    unexpected: 'Imprévus', other: 'Autres', freelance: 'Freelance',
    investment: 'Investissement', health: 'Santé', shopping: 'Shopping',
    education: 'Éducation', bills: 'Factures', emergency: "Fonds d'urgence",
    retirement: 'Retraite', travel: 'Voyages',
  },
  pt: {
    salary: 'Salário', sales: 'Vendas', gift: 'Presentes', bonus: 'Bónus',
    housing: 'Casa', food: 'Supermercado', transport: 'Transporte',
    entertainment: 'Lazer', subscriptions: 'Subscrições',
    unexpected: 'Imprevistos', other: 'Outros', freelance: 'Freelance',
    investment: 'Investimento', health: 'Saúde', shopping: 'Compras',
    education: 'Educação', bills: 'Contas', emergency: 'Fundo de emergência',
    retirement: 'Reforma', travel: 'Viagens',
  },
  it: {
    salary: 'Stipendio', sales: 'Vendite', gift: 'Regali', bonus: 'Bonus',
    housing: 'Casa', food: 'Supermercato', transport: 'Trasporti',
    entertainment: 'Tempo libero', subscriptions: 'Abbonamenti',
    unexpected: 'Imprevisti', other: 'Altro', freelance: 'Freelance',
    investment: 'Investimento', health: 'Salute', shopping: 'Shopping',
    education: 'Istruzione', bills: 'Bollette', emergency: 'Fondo di emergenza',
    retirement: 'Pensione', travel: 'Viaggi',
  },
  de: {
    salary: 'Gehalt', sales: 'Verkäufe', gift: 'Geschenke', bonus: 'Bonus',
    housing: 'Wohnen', food: 'Supermarkt', transport: 'Transport',
    entertainment: 'Freizeit', subscriptions: 'Abonnements',
    unexpected: 'Unvorhergesehenes', other: 'Sonstiges', freelance: 'Freiberuflich',
    investment: 'Investition', health: 'Gesundheit', shopping: 'Einkaufen',
    education: 'Bildung', bills: 'Rechnungen', emergency: 'Notgroschen',
    retirement: 'Ruhestand', travel: 'Reisen',
  },
};

const isBaseCategory = (category: string): boolean => {
  return category in CATEGORY_LABELS.en;
};

const translateBaseCategory = (category: string, lang: Lang): string => {
  return CATEGORY_LABELS[lang][category] ?? category;
};

// Lee el nombre de una categoría personalizada creada por el usuario
// desde la subcolección del propio account compartido, para que la
// notificación funcione sin cambios de código cuando alguien añade categorías nuevas.
const fetchCustomCategoryName = async (
  accountId: string,
  categoryId: string,
): Promise<string | null> => {
  try {
    const doc = await getFirestore()
      .collection('sharedAccounts').doc(accountId)
      .collection('categories').doc(categoryId)
      .get();
    const name = doc.data()?.name;
    return typeof name === 'string' && name.trim() ? name.trim() : null;
  } catch (e) {
    console.warn(`[push] failed to fetch custom category ${categoryId}:`, e);
    return null;
  }
};

const resolveLang = (raw: unknown): Lang => {
  if (typeof raw !== 'string') return 'en';
  const code = raw.toLowerCase().split('-')[0];
  return (SUPPORTED.includes(code as Lang) ? code : 'en') as Lang;
};

interface UserPrefs {
  lang: Lang;
  notificationsEnabled: boolean;
}

const getUserPrefs = async (uid: string): Promise<UserPrefs> => {
  try {
    const doc = await getFirestore().collection('users').doc(uid).get();
    const data = doc.data();
    return {
      lang: resolveLang(data?.settings?.language),
      // Default a true si no está definido (usuarios existentes sin el campo).
      notificationsEnabled: data?.settings?.notificationsEnabled !== false,
    };
  } catch {
    return { lang: 'en', notificationsEnabled: true };
  }
};

interface DeviceToken {
  token: string;
  ref: DocumentReference;
}

const getDeviceTokens = async (uid: string): Promise<DeviceToken[]> => {
  try {
    const snap = await getFirestore()
      .collection('users').doc(uid)
      .collection('devices')
      .get();
    return snap.docs
      .map(d => ({ token: (d.data().token as string) ?? '', ref: d.ref }))
      .filter(t => !!t.token);
  } catch (e) {
    console.error(`Failed to fetch device tokens for ${uid}:`, e);
    return [];
  }
};

const cleanupInvalidTokens = async (
  responses: SendResponse[],
  devices: DeviceToken[],
): Promise<void> => {
  const stale: DocumentReference[] = [];
  responses.forEach((res, i) => {
    if (res.success) return;
    const code = res.error?.code ?? '';
    if (
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-argument' ||
      code === 'messaging/invalid-registration-token'
    ) {
      stale.push(devices[i].ref);
    }
  });
  await Promise.all(stale.map(ref => ref.delete().catch(() => undefined)));
};

const sendToUser = async (
  uid: string,
  buildPayload: (lang: Lang) => { title: string; body: string; data?: Record<string, string> },
): Promise<void> => {
  const [prefs, devices] = await Promise.all([
    getUserPrefs(uid),
    getDeviceTokens(uid),
  ]);
  if (!prefs.notificationsEnabled) {
    console.log(`[push] uid=${uid} skipped (notifications disabled)`);
    return;
  }
  console.log(`[push] uid=${uid} devices=${devices.length}`, devices.map(d => d.ref.id));
  if (devices.length === 0) return;
  const payload = buildPayload(prefs.lang);

  const message: MulticastMessage = {
    tokens: devices.map(d => d.token),
    notification: { title: payload.title, body: payload.body },
    data: payload.data,
    android: {
      priority: 'high',
      notification: { channelId: 'default', sound: 'default' },
    },
    apns: {
      payload: {
        aps: { sound: 'default', badge: 1 },
      },
    },
  };

  try {
    const response = await getMessaging().sendEachForMulticast(message);
    response.responses.forEach((r, i) => {
      const id = devices[i].ref.id;
      if (r.success) {
        console.log(`[push] uid=${uid} device=${id} OK messageId=${r.messageId}`);
      } else {
        console.warn(`[push] uid=${uid} device=${id} FAIL code=${r.error?.code} msg=${r.error?.message}`);
      }
    });
    if (response.failureCount > 0) {
      await cleanupInvalidTokens(response.responses, devices);
    }
  } catch (e) {
    console.error(`Failed to send to ${uid}:`, e);
  }
};

// ── 1) Movimiento añadido a cuenta compartida ────────────────────────
export const onSharedMovementCreated = onDocumentCreated(
  'sharedAccounts/{accountId}/movements/{movementId}',
  async (event) => {
    const movement = event.data?.data();
    if (!movement) return;
    const accountId = event.params.accountId;
    const addedBy: string | undefined = movement.addedBy;
    if (!addedBy) return;

    const accountSnap = await getFirestore()
      .collection('sharedAccounts').doc(accountId).get();
    const account = accountSnap.data();
    if (!account) return;

    const members: string[] = account.members ?? [];
    const memberNames: Record<string, string> = account.memberNames ?? {};
    // Capturamos el displayName crudo; el fallback se resuelve por idioma
    // del receptor dentro del closure para no mezclar idiomas.
    const rawAuthorName = (memberNames[addedBy] ?? '').trim();

    const rawType = typeof movement.type === 'string' ? movement.type : 'expense';
    const type: 'income' | 'expense' = rawType === 'income' ? 'income' : 'expense';
    const rawAmount = typeof movement.amount === 'number' ? movement.amount : 0;
    const currency = typeof movement.currency === 'string' ? movement.currency : 'EUR';
    const rawNote = typeof movement.note === 'string' ? movement.note.trim() : '';
    const rawCategory = typeof movement.category === 'string' ? movement.category : '';
    const rawDescription = typeof movement.description === 'string' ? movement.description.trim() : '';

    const amountStr = formatAmount(rawAmount, currency);

    // Detalle no dependiente del idioma del receptor (nota libre del usuario o
    // nombre de categoría custom guardado en el account compartido). Si el
    // "category" es una clave base conocida, se traduce por receptor más abajo.
    let sharedDetail = '';
    if (rawNote) {
      sharedDetail = rawNote;
    } else if (rawCategory && !isBaseCategory(rawCategory)) {
      // Categoría personalizada creada por algún miembro: buscar su nombre en Firestore.
      sharedDetail = (await fetchCustomCategoryName(accountId, rawCategory)) ?? rawDescription;
    }

    const recipients = members.filter(uid => uid !== addedBy);
    await Promise.all(recipients.map(uid =>
      sendToUser(uid, (lang) => {
        const authorName = rawAuthorName || SOMEONE[lang];
        // Si no hay note ni custom name, traducimos la categoría base al idioma
        // del receptor. Si el category está vacío, caemos a description como
        // último recurso (nombre en el idioma del autor).
        const detail = sharedDetail
          || (isBaseCategory(rawCategory) ? translateBaseCategory(rawCategory, lang) : rawDescription);
        const shortBody = STRINGS[lang].movementShort({ authorName, type, amount: amountStr });
        const body = detail
          ? (() => {
              const withDetail = STRINGS[lang].movementWithDetail({ authorName, type, amount: amountStr, detail });
              return withDetail.length <= FULL_BODY_MAX_LEN ? withDetail : shortBody;
            })()
          : shortBody;
        return {
          title: STRINGS[lang].movementTitle,
          body,
          data: { type: 'shared_movement', accountId },
        };
      }),
    ));
  },
);

// ── 2) Solicitud de unión creada → notifica al creador ───────────────
export const onJoinRequestCreated = onDocumentCreated(
  'sharedAccounts/{accountId}/joinRequests/{requesterId}',
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    if (data.status !== 'pending') return;
    const accountId = event.params.accountId;
    const rawRequesterName = typeof data.displayName === 'string' ? data.displayName.trim() : '';

    const accountSnap = await getFirestore()
      .collection('sharedAccounts').doc(accountId).get();
    const createdBy: string | undefined = accountSnap.data()?.createdBy;
    if (!createdBy) return;

    await sendToUser(createdBy, (lang) => ({
      title: STRINGS[lang].joinRequestTitle,
      body: STRINGS[lang].joinRequestBody(rawRequesterName || SOMEONE[lang]),
      data: { type: 'shared_join_request', accountId },
    }));
  },
);

// ── 3) Solicitud rechazada → notifica al solicitante ─────────────────
export const onJoinRequestUpdated = onDocumentUpdated(
  'sharedAccounts/{accountId}/joinRequests/{requesterId}',
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    if (before.status === 'rejected' || after.status !== 'rejected') return;
    const accountId = event.params.accountId;
    const requesterId = event.params.requesterId;

    const accountSnap = await getFirestore()
      .collection('sharedAccounts').doc(accountId).get();
    const accountName: string = accountSnap.data()?.name ?? '';

    await sendToUser(requesterId, (lang) => ({
      title: STRINGS[lang].rejectedTitle,
      body: STRINGS[lang].rejectedBody(accountName),
      data: { type: 'shared_request_rejected', accountId },
    }));
  },
);

// ── 4) Cuenta compartida actualizada → detecta nuevos miembros (aprobaciones)
export const onSharedAccountUpdated = onDocumentUpdated(
  'sharedAccounts/{accountId}',
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    const beforeMembers: string[] = before.members ?? [];
    const afterMembers: string[] = after.members ?? [];
    const newMembers = afterMembers.filter(uid => !beforeMembers.includes(uid));
    if (newMembers.length === 0) return;

    const accountId = event.params.accountId;
    const accountName: string = after.name ?? '';

    await Promise.all(newMembers.map(uid =>
      sendToUser(uid, (lang) => ({
        title: STRINGS[lang].approvedTitle,
        body: STRINGS[lang].approvedBody(accountName),
        data: { type: 'shared_request_approved', accountId },
      })),
    ));
  },
);
