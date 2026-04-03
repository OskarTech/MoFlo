import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { usePinStore } from '../../store/pinStore';
import PinPad from '../../components/common/PinPad';
import { useTheme } from '../../hooks/useTheme';

interface Props {
  onUnlock: () => void;
}

const PinLockScreen = ({ onUnlock }: Props) => {
  const { verifyPin } = usePinStore();
  const { colors: dc } = useTheme();
  const { t } = useTranslation();
  const [attempts, setAttempts] = useState(0);

  const handlePinSuccess = (pin: string) => {
    if (verifyPin(pin)) {
      onUnlock();
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      if (newAttempts >= 3) {
        Alert.alert(
          t('settings.pinTooManyAttempts'),
          t('settings.pinTooManyAttemptsMessage')
        );
        setAttempts(0);
      } else {
        Alert.alert(
          t('settings.pinError'),
          t('settings.pinErrorMessage', { attempts: newAttempts })
        );
      }
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: dc.background }]}>
      <PinPad
        title={t('settings.pinLockTitle')}
        subtitle={t('settings.pinLockSubtitle')}
        onSuccess={handlePinSuccess}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
});

export default PinLockScreen;