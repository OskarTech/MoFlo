import React from 'react';
import { StyleSheet } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useTheme } from '../../hooks/useTheme';

interface Props {
  onPress: () => void;
}

const AppleSignInButton = ({ onPress }: Props) => {
  const { isDark } = useTheme();
  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
      buttonStyle={isDark
        ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
        : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={12}
      style={styles.button}
      onPress={onPress}
    />
  );
};

const styles = StyleSheet.create({
  button: { width: '100%', height: 50, marginTop: 12 },
});

export default AppleSignInButton;
