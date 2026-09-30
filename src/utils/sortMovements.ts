interface Sortable {
  date: string;
  createdAt?: string;
}

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

// Dentro de su día: el momento en que se añadió, si fue ese mismo día. Si no
// (un fijo aplicado días después, al abrir la app), la hora de su fecha
const momentInDay = (item: Sortable) => {
  const date = new Date(item.date);
  const added = item.createdAt ? new Date(item.createdAt) : null;
  return added && !Number.isNaN(added.getTime()) && dayStart(added) === dayStart(date)
    ? added.getTime()
    : date.getTime();
};

/**
 * Para sort(): del más reciente al más antiguo, por día y, dentro del mismo
 * día, por el momento en que se añadió. Los fijos se guardan a las 12:00 de
 * su día (así un cambio de zona horaria no los mueve de día) y, ordenando por
 * la hora de la fecha, lo que se añadía esa mañana quedaba debajo de ellos.
 */
export const byMostRecent = (a: Sortable, b: Sortable): number => {
  const dayA = dayStart(new Date(a.date));
  const dayB = dayStart(new Date(b.date));
  if (dayA !== dayB) return dayB - dayA;
  return momentInDay(b) - momentInDay(a);
};
