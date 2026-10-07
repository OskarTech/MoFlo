/**
 * La cuenta de empresa. Con `__DEV__` solo aparece en las builds de
 * desarrollo, y sin ella la app es exactamente la de siempre: el selector no
 * enseña la opción, no se lee nada de la empresa al arrancar y la navegación
 * es la de la cuenta individual y la compartida.
 *
 * Activada en la 2.0.6 para probarla en TestFlight (solo la ve Oskar). Antes
 * de mandar una versión a la App Store o a Google Play, volver a `__DEV__`, o
 * dejarla así para lanzarla.
 */
export const BUSINESS_ENABLED: boolean = true;
