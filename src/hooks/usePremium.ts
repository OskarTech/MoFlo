import { useState } from 'react';
import { usePremiumStore } from '../store/premiumStore';

export const usePremium = () => {
  const { isPremium } = usePremiumStore();
  const [showModal, setShowModal] = useState(false);

  const requirePremium = (action: () => void) => {
    if (isPremium) {
      action();
    } else {
      setShowModal(true);
    }
  };

  return { isPremium, showModal, setShowModal, requirePremium };
};