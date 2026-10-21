import { createHash, timingSafeEqual } from 'crypto';
import { onDocumentCreated, onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { FieldValue, Firestore, Timestamp, getFirestore } from 'firebase-admin/firestore';
import {
  commissionExpenseId, dayCommissions, parsePosClose, POS_ACTOR, POS_CHANNELS, posEntry, PosClose, sameEntry,
} from './pos';

/**
 * La cuenta de empresa (businesses/{id}):
 * - El cierre de caja de la Pizzería Vesuvio, que manda su TPV (businessPosClose).
 * - Avisos, como los de la cuenta compartida: al cerrar un día, a los socios
 *   (también si lo cierra la caja); una solicitud para entrar, a quien creó la
 *   empresa; la solicitud aceptada o rechazada, a quien la hizo.
 *
 * Se crean desde index.ts con su envío, después de setGlobalOptions: así van
 * en la misma región que las demás.
 */

/**
 * La clave que comparten MoFlo y el TPV (en el Secret Manager de los dos
 * proyectos; nunca en el código) y la empresa en la que escribe el TPV: la fija
 * MoFlo, no el mensaje, así que con la clave solo se escribe en ella
 */
const POS_KEY = defineSecret('VESUVIO_POS_KEY');
const POS_BUSINESS_ID = defineString('VESUVIO_BUSINESS_ID');

type Lang = 'en' | 'es' | 'pl' | 'fr' | 'pt' | 'it' | 'de';

interface Deps {
  sendToUser: (
    uid: string,
    buildPayload: (lang: Lang) => { title: string; body: string; data?: Record<string, string> },
  ) => Promise<void>;
  someone: Record<Lang, string>;
  formatAmount: (amount: number, currency: string) => string;
  /** El idioma de una cuenta (sus ajustes) */
  langOf: (uid: string) => Promise<Lang>;
}

interface Strings {
  closedTitle: (business: string) => string;
  closedBody: (name: string, day: string, amount: string) => string;
  /** Cuando el día lo cierra la caja */
  posClosedBody: (day: string, amount: string) => string;
  /** Quién es la caja (el historial) y el nombre del gasto de una comisión, como en la app */
  posName: string;
  commissionOf: (channel: string) => string;
  /** Las formas de pago de la caja, si la empresa aún no las tiene, y el tipo de gasto de las comisiones */
  channels: Record<string, string>;
  commissionType: string;
  joinTitle: string;
  joinBody: (name: string, business: string) => string;
  approvedTitle: string;
  approvedBody: (business: string) => string;
  rejectedTitle: string;
  rejectedBody: (business: string) => string;
}

const STRINGS: Record<Lang, Strings> = {
  es: {
    closedTitle: (b) => `${b}: día cerrado`,
    closedBody: (n, d, a) => `${n} ha cerrado el ${d}: ${a} vendidos`,
    posClosedBody: (d, a) => `La caja ha cerrado el ${d}: ${a} vendidos`,
    posName: 'La caja',
    commissionOf: (c) => `Comisión de ${c}`,
    channels: { cash: 'Efectivo', card: 'Tarjeta', online: 'Online' },
    commissionType: 'Comisiones',
    joinTitle: 'Solicitud para entrar',
    joinBody: (n, b) => `${n} quiere unirse a ${b}`,
    approvedTitle: 'Solicitud aceptada',
    approvedBody: (b) => `Ya eres socio de "${b}"`,
    rejectedTitle: 'Solicitud rechazada',
    rejectedBody: (b) => `Tu solicitud para unirte a "${b}" fue rechazada`,
  },
  en: {
    closedTitle: (b) => `${b}: day closed`,
    closedBody: (n, d, a) => `${n} closed ${d}: ${a} sold`,
    posClosedBody: (d, a) => `The till closed ${d}: ${a} sold`,
    posName: 'The till',
    commissionOf: (c) => `${c} commission`,
    channels: { cash: 'Cash', card: 'Card', online: 'Online' },
    commissionType: 'Fees',
    joinTitle: 'Join request',
    joinBody: (n, b) => `${n} wants to join ${b}`,
    approvedTitle: 'Request approved',
    approvedBody: (b) => `You're now a partner in "${b}"`,
    rejectedTitle: 'Request declined',
    rejectedBody: (b) => `Your request to join "${b}" was declined`,
  },
  pl: {
    closedTitle: (b) => `${b}: dzień zamknięty`,
    closedBody: (n, d, a) => `${n} zamknął(-ęła) ${d}: sprzedaż ${a}`,
    posClosedBody: (d, a) => `Kasa zamknęła ${d}: sprzedaż ${a}`,
    posName: 'Kasa',
    commissionOf: (c) => `Prowizja: ${c}`,
    channels: { cash: 'Gotówka', card: 'Karta', online: 'Online' },
    commissionType: 'Prowizje',
    joinTitle: 'Prośba o dołączenie',
    joinBody: (n, b) => `${n} chce dołączyć do ${b}`,
    approvedTitle: 'Prośba zaakceptowana',
    approvedBody: (b) => `Jesteś teraz wspólnikiem w „${b}”`,
    rejectedTitle: 'Prośba odrzucona',
    rejectedBody: (b) => `Twoja prośba o dołączenie do „${b}” została odrzucona`,
  },
  fr: {
    closedTitle: (b) => `${b} : journée clôturée`,
    closedBody: (n, d, a) => `${n} a clôturé ${d} : ${a} de ventes`,
    posClosedBody: (d, a) => `La caisse a clôturé ${d} : ${a} de ventes`,
    posName: 'La caisse',
    commissionOf: (c) => `Commission ${c}`,
    channels: { cash: 'Espèces', card: 'Carte', online: 'En ligne' },
    commissionType: 'Commissions',
    joinTitle: 'Demande pour rejoindre',
    joinBody: (n, b) => `${n} veut rejoindre ${b}`,
    approvedTitle: 'Demande acceptée',
    approvedBody: (b) => `Vous êtes maintenant associé de « ${b} »`,
    rejectedTitle: 'Demande refusée',
    rejectedBody: (b) => `Votre demande pour rejoindre « ${b} » a été refusée`,
  },
  pt: {
    closedTitle: (b) => `${b}: dia fechado`,
    closedBody: (n, d, a) => `${n} fechou ${d}: ${a} vendidos`,
    posClosedBody: (d, a) => `A caixa fechou ${d}: ${a} vendidos`,
    posName: 'A caixa',
    commissionOf: (c) => `Comissão ${c}`,
    channels: { cash: 'Dinheiro', card: 'Cartão', online: 'Online' },
    commissionType: 'Comissões',
    joinTitle: 'Pedido para entrar',
    joinBody: (n, b) => `${n} quer juntar-se a ${b}`,
    approvedTitle: 'Pedido aceite',
    approvedBody: (b) => `Já é sócio de "${b}"`,
    rejectedTitle: 'Pedido recusado',
    rejectedBody: (b) => `O seu pedido para se juntar a "${b}" foi recusado`,
  },
  it: {
    closedTitle: (b) => `${b}: giornata chiusa`,
    closedBody: (n, d, a) => `${n} ha chiuso ${d}: ${a} di vendite`,
    posClosedBody: (d, a) => `La cassa ha chiuso ${d}: ${a} di vendite`,
    posName: 'La cassa',
    commissionOf: (c) => `Commissione ${c}`,
    channels: { cash: 'Contanti', card: 'Carta', online: 'Online' },
    commissionType: 'Commissioni',
    joinTitle: 'Richiesta di adesione',
    joinBody: (n, b) => `${n} vuole unirsi a ${b}`,
    approvedTitle: 'Richiesta accettata',
    approvedBody: (b) => `Ora sei socio di "${b}"`,
    rejectedTitle: 'Richiesta rifiutata',
    rejectedBody: (b) => `La tua richiesta di unirti a "${b}" è stata rifiutata`,
  },
  de: {
    closedTitle: (b) => `${b}: Tag abgeschlossen`,
    closedBody: (n, d, a) => `${n} hat ${d} abgeschlossen: ${a} verkauft`,
    posClosedBody: (d, a) => `Die Kasse hat ${d} abgeschlossen: ${a} verkauft`,
    posName: 'Die Kasse',
    commissionOf: (c) => `Provision ${c}`,
    channels: { cash: 'Bargeld', card: 'Karte', online: 'Online' },
    commissionType: 'Gebühren',
    joinTitle: 'Beitrittsanfrage',
    joinBody: (n, b) => `${n} möchte ${b} beitreten`,
    approvedTitle: 'Anfrage angenommen',
    approvedBody: (b) => `Du bist jetzt Partner von „${b}“`,
    rejectedTitle: 'Anfrage abgelehnt',
    rejectedBody: (b) => `Deine Anfrage, „${b}“ beizutreten, wurde abgelehnt`,
  },
};

const LOCALES: Record<Lang, string> = {
  es: 'es-ES', en: 'en-US', pl: 'pl-PL', fr: 'fr-FR', pt: 'pt-PT', it: 'it-IT', de: 'de-DE',
};

/** «miércoles, 7 oct» en el idioma de quien lo recibe */
const dayLabel = (dayId: string, lang: Lang): string => {
  const [y, m, d] = dayId.split('-').map(Number);
  if (!y || !m || !d) return dayId;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(LOCALES[lang], {
    weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC',
  });
};

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Lo vendido en un día: lo de la caja y lo apuntado a mano (lo pendiente de cobro no es venta) */
const daySales = (entries: unknown): number => {
  let total = 0;
  if (!entries || typeof entries !== 'object') return 0;
  for (const entry of Object.values(entries as Record<string, Record<string, unknown>>)) {
    for (const v of Object.values((entry?.amounts as Record<string, unknown>) ?? {})) total += num(v);
    for (const m of (entry?.manual as { amount?: unknown }[]) ?? []) total += num(m?.amount);
  }
  return Math.round(total * 100) / 100;
};

/** Si la cabecera trae la clave: «Bearer <clave>», comparada sin dar pistas por el tiempo */
const keyMatches = (header: string | undefined, key: string): boolean => {
  const match = /^Bearer\s+(\S+)\s*$/.exec(header ?? '');
  if (!match || !key) return false;
  const digest = (v: string) => createHash('sha256').update(v).digest();
  return timingSafeEqual(digest(match[1]), digest(key.trim()));
};

const DELETION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Guarda el cierre de la caja en el día de la empresa, en una transacción:
 * - La entrada `pos` del día, entera (lo apuntado a mano ese día no se toca),
 *   y el día cerrado por la caja, con la hora del servidor (la app baja lo
 *   cambiado por ella).
 * - Un cierre más antiguo que el guardado se ignora; el mismo otra vez (un
 *   reintento), no escribe nada. Se reemplaza, nunca se duplica.
 * - Las comisiones del día, con los mismos ids y la misma forma que la app.
 * - Si cambian los números de un cierre ya guardado, en el historial queda lo
 *   de antes.
 */
export const savePosClose = async (
  db: Firestore, businessId: string, close: PosClose, lang: Lang,
): Promise<'saved' | 'same' | 'older'> => {
  const bizRef = db.collection('businesses').doc(businessId);
  const configRef = bizRef.collection('config').doc('main');
  const dayRef = bizRef.collection('days').doc(close.day);
  const strings = STRINGS[lang];
  return db.runTransaction(async (tx) => {
    const [bizSnap, configSnap, daySnap] = await tx.getAll(bizRef, configRef, dayRef);
    if (!bizSnap.exists || !configSnap.exists) throw new Error(`no existe la empresa ${businessId}`);
    const config = configSnap.data() ?? {};
    const day = daySnap.data();
    const previous = day?.entries?.pos as Record<string, unknown> | undefined;
    if (previous && typeof previous.closedAtMs === 'number' && previous.closedAtMs > close.closedAt) return 'older';

    // Las formas de pago de la caja, en la configuración si aún no están
    const channels: Record<string, { name?: string; commissionPct?: number; commissionFixed?: number; order?: number }> = {
      ...(config.channels ?? {}),
    };
    const configChanges: Record<string, unknown> = {};
    let order = Object.values(channels).reduce((max, c) => Math.max(max, c.order ?? 0), 0);
    for (const id of POS_CHANNELS) {
      if (channels[id]) continue;
      order += 1;
      channels[id] = { name: strings.channels[id], order };
      configChanges[`channels.${id}`] = { name: strings.channels[id], kind: id === 'cash' ? 'cash' : id === 'card' ? 'card' : 'other', order };
    }
    const entry = posEntry(close, Object.fromEntries(Object.entries(channels).map(([id, c]) => [id, c.name ?? id])));
    if (previous && day?.status === 'closed' && sameEntry(previous, entry)) return 'same';
    // Los mismos números (solo ha cambiado el nombre de una forma de cobro): sin rastro en el historial
    const withoutNames = (e: Record<string, unknown>) => ({ ...e, channelNames: null });
    const sameNumbers = !!previous && sameEntry(withoutNames(previous), withoutNames(entry));

    const entries = { ...(day?.entries ?? {}), pos: entry } as Record<string, { amounts?: Record<string, number>; counts?: Record<string, number> }>;
    const commissions = dayCommissions(Object.values(entries), channels);
    const commissionIds = Object.keys(commissions);
    const commissionRefs = commissionIds.map((id) => bizRef.collection('expenses').doc(commissionExpenseId(close.day, id)));
    const commissionSnaps = commissionRefs.length ? await tx.getAll(...commissionRefs) : [];

    const now = FieldValue.serverTimestamp();
    const nowIso = new Date().toISOString();
    const closedAt = new Date(close.closedAt).toISOString();
    if (Object.keys(configChanges).length) tx.update(configRef, { ...configChanges, updatedAt: now });
    if (daySnap.exists) {
      tx.update(dayRef, { 'entries.pos': entry, status: 'closed', closedBy: POS_ACTOR, closedAt, updatedAt: now });
    } else {
      tx.set(dayRef, { id: close.day, status: 'closed', entries: { pos: entry }, closedBy: POS_ACTOR, closedAt, updatedAt: now });
    }

    const typeName = (config.expenseTypes?.commissions?.name as string | undefined) ?? strings.commissionType;
    commissionIds.forEach((id, i) => {
      const amount = commissions[id];
      const snap = commissionSnaps[i];
      if (amount > 0) {
        if (snap.exists && snap.data()?.amount === amount) return;
        tx.set(commissionRefs[i], {
          id: snap.id,
          date: close.day,
          amount,
          name: strings.commissionOf(channels[id]?.name ?? id),
          typeId: 'commissions',
          typeName,
          by: POS_ACTOR,
          createdAt: (snap.data()?.createdAt as string | undefined) ?? nowIso,
          updatedAt: now,
        });
      } else if (snap.exists) {
        // Como al borrar desde la app: con su apunte de borrado
        tx.delete(commissionRefs[i]);
        tx.set(bizRef.collection('deletedExpenses').doc(snap.id), {
          updatedAt: now,
          expireAt: Timestamp.fromMillis(Date.now() + DELETION_TTL_MS),
        });
      }
    });

    if (previous && !sameNumbers) {
      tx.set(bizRef.collection('changes').doc(), {
        kind: 'entry', action: 'edit', targetId: 'pos', day: close.day, before: previous,
        by: POS_ACTOR, byName: strings.posName, at: nowIso, serverAt: now,
      });
    }
    return 'saved';
  });
};

export const businessFunctions = ({ sendToUser, someone, formatAmount, langOf }: Deps) => ({
  // ── El cierre de caja del TPV de la pizzería ───────────────────
  // Solo POST, con la clave (sin cuenta de Google: la protege ella). 200 si
  // se ha guardado (o era antiguo o repetido), 400 si el mensaje está mal,
  // 401 si la clave no vale y 500 si algo falla (el TPV lo reintenta)
  businessPosClose: onRequest(
    { secrets: [POS_KEY], invoker: 'public', maxInstances: 2, timeoutSeconds: 30 },
    async (req, res) => {
      if (req.method !== 'POST') {
        res.set('Allow', 'POST').status(405).json({ ok: false, error: 'method' });
        return;
      }
      if (!keyMatches(req.get('authorization'), POS_KEY.value())) {
        logger.warn('cierre de caja: clave que no vale');
        res.status(401).json({ ok: false, error: 'key' });
        return;
      }
      const parsed = parsePosClose(req.body, Date.now());
      if (!parsed.ok) {
        logger.warn('cierre de caja: mensaje rechazado', { error: parsed.error });
        res.status(400).json({ ok: false, error: parsed.error });
        return;
      }
      const businessId = POS_BUSINESS_ID.value();
      try {
        if (!businessId) throw new Error('falta VESUVIO_BUSINESS_ID');
        const creator = (await getFirestore().collection('businesses').doc(businessId).get()).data()?.createdBy;
        const lang = typeof creator === 'string' ? await langOf(creator) : 'es';
        const result = await savePosClose(getFirestore(), businessId, parsed.close, lang);
        logger.info('cierre de caja', { day: parsed.close.day, result });
        res.status(200).json({ ok: true });
      } catch (e) {
        logger.error('cierre de caja: error al guardar', { day: parsed.close.day, error: (e as Error)?.message });
        res.status(500).json({ ok: false, error: 'server' });
      }
    },
  ),

  // ── Día cerrado → a los demás socios ───────────────────────────
  onBusinessDayWritten: onDocumentWritten(
    'businesses/{businessId}/days/{dayId}',
    async (event) => {
      const before = event.data?.before.data();
      const after = event.data?.after.data();
      if (!after || after.status !== 'closed' || before?.status === 'closed') return;
      const { businessId, dayId } = event.params;
      const closedBy: string | undefined = after.closedBy;

      const db = getFirestore();
      const [businessSnap, configSnap] = await Promise.all([
        db.collection('businesses').doc(businessId).get(),
        db.collection('businesses').doc(businessId).collection('config').doc('main').get(),
      ]);
      const business = businessSnap.data();
      if (!business) return;
      if (configSnap.data()?.notifyOnClose === false) return;

      const members: string[] = business.members ?? [];
      const names: Record<string, string> = business.memberNames ?? {};
      const businessName = typeof business.name === 'string' ? business.name : '';
      const amount = formatAmount(daySales(after.entries), typeof business.currencyCode === 'string' ? business.currencyCode : 'EUR');
      const rawName = closedBy ? (names[closedBy] ?? '').trim() : '';
      const byPos = closedBy === POS_ACTOR;

      // Si lo cierra la caja, a todos los socios; si no, a los demás
      await Promise.all(members.filter((uid) => uid !== closedBy).map((uid) =>
        sendToUser(uid, (lang) => ({
          title: STRINGS[lang].closedTitle(businessName),
          body: byPos
            ? STRINGS[lang].posClosedBody(dayLabel(dayId, lang), amount)
            : STRINGS[lang].closedBody(rawName || someone[lang], dayLabel(dayId, lang), amount),
          data: { type: 'business_day_closed', businessId, dayId },
        }))));
    },
  ),

  // ── Solicitud para entrar → a quien creó la empresa ────────────
  onBusinessJoinRequestCreated: onDocumentCreated(
    'businesses/{businessId}/joinRequests/{requesterId}',
    async (event) => {
      const data = event.data?.data();
      if (!data || data.status !== 'pending') return;
      const { businessId } = event.params;
      const snap = await getFirestore().collection('businesses').doc(businessId).get();
      const createdBy: string | undefined = snap.data()?.createdBy;
      if (!createdBy) return;
      const businessName: string = snap.data()?.name ?? '';
      const requester = typeof data.displayName === 'string' ? data.displayName.trim() : '';
      await sendToUser(createdBy, (lang) => ({
        title: STRINGS[lang].joinTitle,
        body: STRINGS[lang].joinBody(requester || someone[lang], businessName),
        data: { type: 'business_join_request', businessId },
      }));
    },
  ),

  // ── Solicitud rechazada → a quien la hizo ──────────────────────
  onBusinessJoinRequestUpdated: onDocumentUpdated(
    'businesses/{businessId}/joinRequests/{requesterId}',
    async (event) => {
      const before = event.data?.before.data();
      const after = event.data?.after.data();
      if (!before || !after || before.status === 'rejected' || after.status !== 'rejected') return;
      const { businessId, requesterId } = event.params;
      const snap = await getFirestore().collection('businesses').doc(businessId).get();
      const businessName: string = snap.data()?.name ?? '';
      await sendToUser(requesterId, (lang) => ({
        title: STRINGS[lang].rejectedTitle,
        body: STRINGS[lang].rejectedBody(businessName),
        data: { type: 'business_request_rejected', businessId },
      }));
    },
  ),

  // ── Socios nuevos (solicitud aceptada) ─────────────────────────
  onBusinessUpdated: onDocumentUpdated(
    'businesses/{businessId}',
    async (event) => {
      const before = event.data?.before.data();
      const after = event.data?.after.data();
      if (!before || !after) return;
      const beforeMembers: string[] = before.members ?? [];
      const added = ((after.members ?? []) as string[]).filter((uid) => !beforeMembers.includes(uid));
      if (!added.length) return;
      const { businessId } = event.params;
      const businessName: string = after.name ?? '';
      await Promise.all(added.map((uid) => sendToUser(uid, (lang) => ({
        title: STRINGS[lang].approvedTitle,
        body: STRINGS[lang].approvedBody(businessName),
        data: { type: 'business_request_approved', businessId },
      }))));
    },
  ),
});
