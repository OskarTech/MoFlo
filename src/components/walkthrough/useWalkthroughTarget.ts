import { useRef, useEffect } from 'react';
import { View } from 'react-native';
import { useWalkthroughStore } from '../../store/walkthroughStore';

/**
 * Registra una vista como target del walkthrough.
 * Devuelve un ref que se debe asignar a la View que quiere destacarse.
 *
 * Mide en varios instantes (100ms, 400ms, 900ms) tras cambiar de paso para
 * cubrir cambios de layout debidos a navegación, scroll, datos asíncronos, etc.
 * La última medición válida es la que queda registrada.
 */
export const useWalkthroughTarget = (id: string) => {
  const ref = useRef<View>(null);
  const isActive = useWalkthroughStore(s => s.isActive);
  const currentStep = useWalkthroughStore(s => s.currentStep);
  const registerTarget = useWalkthroughStore(s => s.registerTarget);

  useEffect(() => {
    if (!isActive) return;
    const doMeasure = () => {
      // measure() entrega (x, y, w, h, pageX, pageY) — pageX/pageY son coords absolutas
      // de la página, más fiables que measureInWindow cuando hay Modals u offsets de window.
      ref.current?.measure((_x, _y, width, height, pageX, pageY) => {
        if (width > 0 && height > 0) {
          registerTarget(id, { x: pageX, y: pageY, width, height });
        }
      });
    };
    const t1 = setTimeout(doMeasure, 100);
    const t2 = setTimeout(doMeasure, 400);
    const t3 = setTimeout(doMeasure, 900);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [isActive, currentStep, id, registerTarget]);

  return ref;
};
