import { byMostRecent } from '../sortMovements';

// Fechas en la hora local del móvil, como las guarda la app
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString();

describe('byMostRecent', () => {
  it('lo añadido la mañana del día del cargo sale encima del fijo de ese día', () => {
    // El fijo se aplica a las 00:05 y se guarda a las 12:00 de su día
    const fixed = { id: 'fijo', date: at(1, 12), createdAt: at(1, 0, 5) };
    const manual = { id: 'manual', date: at(1, 1, 40), createdAt: at(1, 1, 40) };
    expect([fixed, manual].sort(byMostRecent).map(m => m.id)).toEqual(['manual', 'fijo']);
  });

  it('lo añadido antes que el fijo, ese mismo día, queda debajo', () => {
    const manual = { id: 'manual', date: at(1, 0, 1), createdAt: at(1, 0, 1) };
    const fixed = { id: 'fijo', date: at(1, 12), createdAt: at(1, 0, 5) };
    expect([manual, fixed].sort(byMostRecent).map(m => m.id)).toEqual(['fijo', 'manual']);
  });

  it('los días van del más reciente al más antiguo, sea cual sea la hora', () => {
    const yesterdayLate = { id: 'ayer', date: at(1, 23), createdAt: at(1, 23) };
    const todayEarly = { id: 'hoy', date: at(2, 0, 30), createdAt: at(2, 0, 30) };
    expect([yesterdayLate, todayEarly].sort(byMostRecent).map(m => m.id)).toEqual(['hoy', 'ayer']);
  });

  it('un fijo aplicado días después se ordena en su día por la hora de su fecha', () => {
    // Del día 1, aplicado el 3 al abrir la app
    const lateFixed = { id: 'fijo', date: at(1, 12), createdAt: at(3, 9) };
    const morning = { id: 'mañana', date: at(1, 10), createdAt: at(1, 10) };
    const evening = { id: 'tarde', date: at(1, 18), createdAt: at(1, 18) };
    expect([lateFixed, morning, evening].sort(byMostRecent).map(m => m.id))
      .toEqual(['tarde', 'fijo', 'mañana']);
  });

  it('sin fecha de creación usa la de la fecha', () => {
    const a = { id: 'a', date: at(1, 9) };
    const b = { id: 'b', date: at(1, 15), createdAt: 'no es una fecha' };
    expect([a, b].sort(byMostRecent).map(m => m.id)).toEqual(['b', 'a']);
  });
});
