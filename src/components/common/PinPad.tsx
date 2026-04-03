import React, { useState } from 'react';
import {
  View, StyleSheet, TouchableOpacity, Alert,
} from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/useTheme';
import { colors } from '../../theme';

interface Props {
  title: string;
  subtitle?: string;
  onSuccess: (pin: string) => void;
  onCancel?: () => void;
  confirmMode?: boolean;
}

const PinPad = ({ title, subtitle, onSuccess, onCancel, confirmMode = false }: Props) => {
  const { colors: dc } = useTheme();
  const { t } = useTranslation();
  const [pin, setPin] = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);

  const handlePress = (digit: string) => {
    if (pin.length >= 4) return;
    const newPin = pin + digit;
    setPin(newPin);
    if (newPin.length === 4) {
      setTimeout(() => handleComplete(newPin), 150);
    }
  };

  const handleComplete = (completedPin: string) => {
    if (confirmMode && !isConfirming) {
      setFirstPin(completedPin);
      setPin('');
      setIsConfirming(true);
      return;
    }
    if (confirmMode && isConfirming) {
      if (completedPin !== firstPin) {
        Alert.alert('Error', t('settings.pinMismatch'));
        setPin('');
        setFirstPin('');
        setIsConfirming(false);
        return;
      }
    }
    onSuccess(completedPin);
  };

  const handleDelete = () => {
    setPin(pin.slice(0, -1));
  };

  const digits = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  return (
    <View style={[styles.container, { backgroundColor: dc.background }]}>
      <Text style={[styles.title, { color: dc.textPrimary }]}>
        {isConfirming ? t('settings.pinConfirmTitle') : title}
      </Text>
      <Text style={[styles.subtitle, { color: dc.textSecondary }]}>
        {isConfirming ? t('settings.pinConfirmSubtitle') : subtitle}
      </Text>

      {/* PUNTOS */}
      <View style={styles.dots}>
        {[0,1,2,3].map((i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: i < pin.length ? colors.primary : 'transparent',
                borderColor: i < pin.length ? colors.primary : dc.border,
              }
            ]}
          />
        ))}
      </View>

      {/* TECLADO */}
      <View style={styles.grid}>
        {digits.map((digit, index) => (
          <TouchableOpacity
            key={index}
            style={[
              styles.key,
              {
                backgroundColor: digit === '' ? 'transparent' : dc.surface,
                borderColor: digit === '' ? 'transparent' : dc.border,
              }
            ]}
            onPress={() => {
              if (digit === '⌫') handleDelete();
              else if (digit !== '') handlePress(digit);
            }}
            disabled={digit === ''}
            activeOpacity={0.7}
          >
            {digit === '⌫' ? (
              <Ionicons name="backspace-outline" size={22} color={dc.textPrimary} />
            ) : (
              <Text style={[styles.keyText, { color: dc.textPrimary }]}>{digit}</Text>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {onCancel && (
        <TouchableOpacity onPress={onCancel} style={styles.cancelButton}>
          <Text style={[styles.cancelText, { color: dc.textSecondary }]}>
            {t('movements.cancel')}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 22,
    fontFamily: 'Poppins_700Bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    marginBottom: 40,
    textAlign: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 48,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 280,
    gap: 16,
    justifyContent: 'center',
  },
  key: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 0.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyText: {
    fontSize: 24,
    fontFamily: 'Poppins_500Medium',
  },
  cancelButton: {
    marginTop: 32,
    padding: 12,
  },
  cancelText: {
    fontSize: 16,
    fontFamily: 'Poppins_500Medium',
  },
});

export default PinPad;