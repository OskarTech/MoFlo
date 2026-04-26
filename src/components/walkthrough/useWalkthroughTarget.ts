import { useRef, useEffect } from 'react';
import { View } from 'react-native';
import { useWalkthroughStore } from '../../store/walkthroughStore';

/**
 * Registra una vista como target del walkthrough.
 * Devuelve un ref que se debe asignar a la View que quiere destacarse.
 * Se mide automáticamente cuando el walkthrough llega al paso correspondiente.
 */
export const useWalkthroughTarget = (id: string) => {
  const ref = useRef<View>(null);
  const isActive = useWalkthroughStore(s => s.isActive);
  const currentStep = useWalkthroughStore(s => s.currentStep);
  const registerTarget = useWalkthroughStore(s => s.registerTarget);

  useEffect(() => {
    if (!isActive) return;
    // Re-mide cada vez que cambia el paso, ya que puede haber cambios de layout
    const measure = () => {
      ref.current?.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) {
          registerTarget(id, { x, y, width, height });
        }
      });
    };
    // Pequeño delay para asegurar que el layout está estable tras cambios de pantalla
    const timer = setTimeout(measure, 350);
    return () => clearTimeout(timer);
  }, [isActive, currentStep, id, registerTarget]);

  return ref;
};
