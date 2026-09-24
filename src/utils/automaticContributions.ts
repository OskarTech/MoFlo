import type { Hucha, HuchaMovement } from '../types';

/**
 * Aportaciones automáticas de las huchas.
 *
 * Está aparte del store y sin dependencias de React Native para que se pueda
 * probar tal cual. El store se encarga de guardar lo que esto calcula.
 */

export const clampDayToMonth = (year: number, monthIdx: number, day: number): number => {
  const lastDay = new Date(year, monthIdx + 1, 0).getDate();
  return Math.min(day, lastDay);
};

const MIN_DAYS_BETWEEN_CONTRIBUTIONS = 20;

// Advance to the next month while respecting the original recurringDay
// (clamped to month length), instead of letting JS overflow Feb 31 -> Mar 3.
export const advanceToNextMonth = (isoDate: string, recurringDay?: number): string => {
  const d = new Date(isoDate);
  const day = recurringDay ?? d.getDate();
  let monthIdx = d.getMonth() + 1;
  const year = d.getFullYear();
  let next = new Date(year, monthIdx, clampDayToMonth(year, monthIdx, day), 12);
  // Old dates saved at 00:00 in another time zone can read as the previous day
  // (e.g. Oct 1 00:00 Spain = Sep 30 23:00 Portugal). Never schedule the same period again.
  if (next.getTime() - d.getTime() < MIN_DAYS_BETWEEN_CONTRIBUTIONS * 24 * 60 * 60 * 1000) {
    monthIdx += 1;
    next = new Date(year, monthIdx, clampDayToMonth(year, monthIdx, day), 12);
  }
  return next.toISOString();
};

// Meses que se recuperan como máximo en un arranque, igual que los recurrentes.
// Si faltan más, el resto se aplica en el siguiente: no se pierde ninguno.
export const MAX_CONTRIBUTION_CATCH_UP = 12;

// Por debajo de medio céntimo no queda nada por aportar: evita apuntes de
// 0,0000001 por los redondeos de coma flotante al acercarse al objetivo.
const MIN_REMAINING = 0.005;

export interface ContributionCandidate {
  huchaId: string;
  contribution: number;
  nextDate: string;
  movement: HuchaMovement;
}

/**
 * Aportaciones pendientes de cada hucha automática, en orden.
 *
 * Antes se calculaba una sola por hucha en cada arranque: quien pasaba tres
 * meses sin abrir la app tenía que abrirla tres veces para ponerse al día. Ahora
 * se recuperan todos los meses vencidos de una vez (hasta el tope), con las
 * mismas reglas que antes para cada uno.
 */
export const planAutomaticContributions = (
  huchas: Hucha[],
  existingMovementIds: Set<string>,
  now: Date,
): ContributionCandidate[] => {
  const candidates: ContributionCandidate[] = [];
  const nowIso = now.toISOString();

  for (const h of huchas) {
    if (h.closedAt) continue;
    if (!h.isAutomatic || !h.monthlyAmount || !h.nextContributionDate) continue;
    const hasTarget = h.targetAmount > 0;

    let current = h.currentAmount;
    let dueDate = h.nextContributionDate;

    for (let period = 0; period < MAX_CONTRIBUTION_CATCH_UP; period++) {
      // Compared by day: contributions saved at 12:00 still apply from 00:00 of that day
      const contributionDate = new Date(dueDate);
      const contributionDay = new Date(
        contributionDate.getFullYear(), contributionDate.getMonth(), contributionDate.getDate(),
      );
      if (contributionDay > now) break;
      if (hasTarget && h.targetAmount - current < MIN_REMAINING) break;

      const contribution = hasTarget
        ? Math.min(h.monthlyAmount, h.targetAmount - current)
        : h.monthlyAmount;
      if (contribution <= 0) break;

      // Deterministic id per (hucha, period) so two shared-account devices
      // running this at the same time collide on the same movement doc and
      // the transaction detects the duplicate instead of double-applying.
      const periodKey = dueDate.slice(0, 10);
      const movementId = `hm_auto_${h.id}_${periodKey}`;
      // Ya aplicada: se para aquí, como antes, y el servidor manda
      if (existingMovementIds.has(movementId)) break;

      const nextDate = advanceToNextMonth(dueDate, h.recurringDay);
      candidates.push({
        huchaId: h.id,
        contribution,
        nextDate,
        movement: {
          id: movementId,
          huchaId: h.id,
          huchaName: h.name,
          huchaColor: h.color,
          type: 'deposit',
          amount: contribution,
          date: dueDate,
          createdAt: nowIso,
        },
      });

      current += contribution;
      dueDate = nextDate;
    }
  }

  return candidates;
};
