/**
 * Interés compuesto con aportaciones cada mes (DCA), calculado mes a mes.
 *
 * - La rentabilidad anual se reparte entre los 12 meses (un 10 % al año es un
 *   0,833 % al mes) y cada mes se aplica sobre todo lo que hay, también sobre
 *   lo ganado antes: el dinero genera todo el año, no solo al final.
 * - La aportación del mes entra al principio del mes, así que ya genera ese
 *   mismo mes: 200 € al mes al 10 % son 2.534 € al acabar el primer año
 *   (2.400 € puestos y 134 € ganados), no 2.400.
 */

export interface CompoundInput {
  initial: number;
  monthly: number;
  /** Rentabilidad anual, en porcentaje (10 es un 10 %) */
  annualRate: number;
  years: number;
}

export interface CompoundYear {
  /** 1 es el primer año */
  year: number;
  /** Lo puesto hasta el final de ese año: el importe inicial y las aportaciones */
  contributed: number;
  /** Lo generado hasta el final de ese año */
  interest: number;
  total: number;
}

/** Hasta dónde se puede pedir en la pantalla */
export const MAX_YEARS = 60;
export const MAX_PERCENT = 100;

// Lo que se queda en restos de coma flotante (menos de medio céntimo) es cero:
// si no, sin rentabilidad podía salir "-0 €" de intereses
const tidy = (value: number) => (Math.abs(value) < 0.005 ? 0 : value);

export const projectCompound = ({
  initial, monthly, annualRate, years,
}: CompoundInput): CompoundYear[] => {
  const monthlyRate = annualRate / 100 / 12;
  const result: CompoundYear[] = [];
  let total = initial;
  let contributed = initial;
  for (let year = 1; year <= years; year++) {
    for (let month = 0; month < 12; month++) {
      // Primero entra la aportación y luego genera el mes entero
      total = (total + monthly) * (1 + monthlyRate);
      contributed += monthly;
    }
    result.push({ year, contributed, interest: tidy(total - contributed), total });
  }
  return result;
};

// Pasos del tope del eje: con todos, la mitad también sale redonda (75 mil, 1,25 M)
const NICE_STEPS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

/** El tope del eje del gráfico: el primer número redondo que llega al valor */
export const niceCeil = (value: number): number => {
  if (!(value > 0) || !Number.isFinite(value)) return 1;
  const power = Math.pow(10, Math.floor(Math.log10(value)));
  // Con un margen mínimo: 150000 / 100000 puede dar 1,5000000000000002
  const step = NICE_STEPS.find((s) => s * power >= value * (1 - 1e-9)) ?? 10;
  return step * power;
};
