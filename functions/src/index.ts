import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, DocumentReference } from 'firebase-admin/firestore';
import { getMessaging, MulticastMessage, SendResponse } from 'firebase-admin/messaging';

initializeApp();
setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });

type Lang = 'en' | 'es' | 'pl';
const SUPPORTED: Lang[] = ['en', 'es', 'pl'];

const STRINGS: Record<Lang, {
  movementTitle: string;
  movementBody: (name: string) => string;
  joinRequestTitle: string;
  joinRequestBody: (name: string) => string;
  approvedTitle: string;
  approvedBody: (name: string) => string;
  rejectedTitle: string;
  rejectedBody: (name: string) => string;
}> = {
  en: {
    movementTitle: 'New shared movement',
    movementBody: (n) => `${n} added a new movement`,
    joinRequestTitle: 'Join request',
    joinRequestBody: (n) => `${n} wants to join your shared account`,
    approvedTitle: 'Request approved',
    approvedBody: (n) => `You're now part of "${n}"`,
    rejectedTitle: 'Request rejected',
    rejectedBody: (n) => `Your request to join "${n}" was declined`,
  },
  es: {
    movementTitle: 'Nuevo movimiento',
    movementBody: (n) => `${n} ha añadido un movimiento`,
    joinRequestTitle: 'Solicitud de unión',
    joinRequestBody: (n) => `${n} quiere unirse a tu cuenta compartida`,
    approvedTitle: 'Solicitud aprobada',
    approvedBody: (n) => `Ya formas parte de "${n}"`,
    rejectedTitle: 'Solicitud rechazada',
    rejectedBody: (n) => `Tu solicitud para unirte a "${n}" fue rechazada`,
  },
  pl: {
    movementTitle: 'Nowa transakcja',
    movementBody: (n) => `${n} dodał(-a) nową transakcję`,
    joinRequestTitle: 'Prośba o dołączenie',
    joinRequestBody: (n) => `${n} chce dołączyć do Twojego wspólnego konta`,
    approvedTitle: 'Wniosek zatwierdzony',
    approvedBody: (n) => `Jesteś teraz częścią "${n}"`,
    rejectedTitle: 'Wniosek odrzucony',
    rejectedBody: (n) => `Twój wniosek o dołączenie do "${n}" został odrzucony`,
  },
};

const resolveLang = (raw: unknown): Lang => {
  if (typeof raw !== 'string') return 'en';
  const code = raw.toLowerCase().split('-')[0];
  return (SUPPORTED.includes(code as Lang) ? code : 'en') as Lang;
};

const getUserLanguage = async (uid: string): Promise<Lang> => {
  try {
    const doc = await getFirestore().collection('users').doc(uid).get();
    const data = doc.data();
    return resolveLang(data?.settings?.language);
  } catch {
    return 'en';
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
  const [lang, devices] = await Promise.all([
    getUserLanguage(uid),
    getDeviceTokens(uid),
  ]);
  console.log(`[push] uid=${uid} devices=${devices.length}`, devices.map(d => d.ref.id));
  if (devices.length === 0) return;
  const payload = buildPayload(lang);

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
    const authorName = memberNames[addedBy] ?? 'Alguien';

    const recipients = members.filter(uid => uid !== addedBy);
    await Promise.all(recipients.map(uid =>
      sendToUser(uid, (lang) => ({
        title: STRINGS[lang].movementTitle,
        body: STRINGS[lang].movementBody(authorName),
        data: { type: 'shared_movement', accountId },
      })),
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
    const requesterName: string = data.displayName ?? 'Alguien';

    const accountSnap = await getFirestore()
      .collection('sharedAccounts').doc(accountId).get();
    const createdBy: string | undefined = accountSnap.data()?.createdBy;
    if (!createdBy) return;

    await sendToUser(createdBy, (lang) => ({
      title: STRINGS[lang].joinRequestTitle,
      body: STRINGS[lang].joinRequestBody(requesterName),
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
