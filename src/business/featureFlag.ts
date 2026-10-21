/**
 * La cuenta de empresa, para toda la app. Apagada, la app es exactamente la de
 * siempre: el selector no enseña la opción, no se lee nada de la empresa al
 * arrancar y la navegación es la de la cuenta individual y la compartida.
 *
 * Encendida, solo la ven las cuentas de la lista (ver access.ts): para todas
 * las demás sigue como si estuviera apagada.
 */
export const BUSINESS_ENABLED: boolean = true;
