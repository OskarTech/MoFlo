import { useEffect, useState } from 'react';
import { getCachedPremiumPrice, getPremiumPrice } from '../services/revenuecat';

// El de siempre: mientras llega el de la tienda o si no se puede consultar
const FALLBACK_PRICE = '2,99€';

/**
 * Precio de premium para enseñarlo: el de la tienda, con la moneda y el formato
 * del país de la cuenta (antes salía siempre 2,99€, también en otros países).
 * Solo lo consulta cuando `enabled`, es decir, cuando se va a ver.
 */
export const usePremiumPrice = (enabled = true): string => {
  const [price, setPrice] = useState(() => getCachedPremiumPrice() ?? FALLBACK_PRICE);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    getPremiumPrice().then((storePrice) => {
      if (active && storePrice) setPrice(storePrice);
    });
    return () => { active = false; };
  }, [enabled]);

  return price;
};
