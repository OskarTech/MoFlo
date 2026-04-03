import React from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { usePinStore } from '../../store/pinStore';
import PinPad from '../../components/common/PinPad';
import { useTheme } from '../../hooks/useTheme';
import AppHeader from '../../components/common/AppHeader';

const PinSetupScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { setPin } = usePinStore();
  const { colors: dc } = useTheme();
  const { t } = useTranslation();

  const handleSuccess = async (pin: string) => {
    await setPin(pin);
    Alert.alert('✅', t('settings.pinSetupSuccess'));
    navigation.goBack();
  };

  return (
    <View style={[styles.container, { backgroundColor: dc.background }]}>
      <AppHeader title={t('settings.pinSetup')} showBell={false} />
      <PinPad
        title={t('settings.pinSetup')}
        subtitle={t('settings.pinSetupSubtitle')}
        onSuccess={handleSuccess}
        onCancel={() => navigation.goBack()}
        confirmMode
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
});

export default PinSetupScreen;