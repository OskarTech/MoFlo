import { onDocumentCreated, onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * Avisos de la cuenta de empresa (businesses/{id}), como los de la cuenta
 * compartida:
 * - Al cerrar un día, a los demás socios: uno por cierre, no uno por pedido.
 * - Una solicitud para entrar, a quien creó la empresa.
 * - La solicitud aceptada o rechazada, a quien la hizo.
 *
 * Se crean desde index.ts con su envío, después de setGlobalOptions: así van
 * en la misma región que las demás.
 */

type Lang = 'en' | 'es' | 'pl' | 'fr' | 'pt' | 'it' | 'de';

interface Deps {
  sendToUser: (
    uid: string,
    buildPayload: (lang: Lang) => { title: string; body: string; data?: Record<string, string> },
  ) => Promise<void>;
  someone: Record<Lang, string>;
  formatAmount: (amount: number, currency: string) => string;
}

interface Strings {
  closedTitle: (business: string) => string;
  closedBody: (name: string, day: string, amount: string) => string;
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

/** Lo vendido en un día: lo de cada caja o turno, y el cierre de los pedidos */
const daySales = (entries: unknown): number => {
  let total = 0;
  if (!entries || typeof entries !== 'object') return 0;
  for (const entry of Object.values(entries as Record<string, Record<string, unknown>>)) {
    for (const v of Object.values((entry?.amounts as Record<string, unknown>) ?? {})) total += num(v);
    for (const m of (entry?.manual as { amount?: unknown }[]) ?? []) total += num(m?.amount);
  }
  return Math.round(total * 100) / 100;
};

export const businessFunctions = ({ sendToUser, someone, formatAmount }: Deps) => ({
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

      await Promise.all(members.filter((uid) => uid !== closedBy).map((uid) =>
        sendToUser(uid, (lang) => ({
          title: STRINGS[lang].closedTitle(businessName),
          body: STRINGS[lang].closedBody(rawName || someone[lang], dayLabel(dayId, lang), amount),
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
