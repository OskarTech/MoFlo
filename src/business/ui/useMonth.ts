import { useEffect, useMemo, useState } from 'react';
import { businessToday, useBusinessStore } from '../store/businessStore';
import { dateOfDayId } from '../logic/basics';
import { monthSummary } from '../logic/summary';

/**
 * El mes que se está viendo (con ‹ › para cambiar) y su resumen. Al ir a un
 * año que aún no está cargado, se lee de la copia del móvil.
 */
export const useMonth = () => {
  const todayId = businessToday();
  const today = dateOfDayId(todayId);
  const [offset, setOffset] = useState(0);
  const index = today.getFullYear() * 12 + today.getMonth() + offset;
  const year = Math.floor(index / 12);
  const month0 = index - year * 12;

  const config = useBusinessStore((s) => s.config);
  const days = useBusinessStore((s) => s.days);
  const orders = useBusinessStore((s) => s.orders);
  const expenses = useBusinessStore((s) => s.expenses);
  const recurring = useBusinessStore((s) => s.recurring);

  useEffect(() => {
    useBusinessStore.getState().ensureYear(year).catch(() => {});
  }, [year]);

  const summary = useMemo(() => (config
    ? monthSummary({
      year, month0, todayId, config, days,
      orders: Object.values(orders), expenses: Object.values(expenses), recurring: Object.values(recurring),
    })
    : null), [year, month0, todayId, config, days, orders, expenses, recurring]);

  return {
    year,
    month0,
    todayId,
    summary,
    isCurrent: offset === 0,
    prev: () => setOffset((o) => o - 1),
    next: () => setOffset((o) => Math.min(0, o + 1)),
    canNext: offset < 0,
  };
};
