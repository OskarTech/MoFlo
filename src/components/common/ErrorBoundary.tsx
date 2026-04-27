import React, { Component, ReactNode, ErrorInfo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import crashlytics from '@react-native-firebase/crashlytics';
import i18n from '../../i18n';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

const safeT = (key: string, fallback: string): string => {
  try {
    const v = i18n.t(key);
    return !v || v === key ? fallback : (v as string);
  } catch {
    return fallback;
  }
};

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    try {
      if (info?.componentStack) {
        crashlytics().log(`componentStack: ${info.componentStack}`);
      }
      crashlytics().recordError(error);
    } catch {
      // Crashlytics no disponible (dev sin config nativo) — silencioso
    }
  }

  reset = () => this.setState({ hasError: false });

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.container}>
        <Text style={styles.emoji}>😕</Text>
        <Text style={styles.title}>
          {safeT('errors.boundaryTitle', 'Algo ha fallado')}
        </Text>
        <Text style={styles.subtitle}>
          {safeT('errors.boundarySubtitle', 'Hemos guardado el error. Pulsa para reintentarlo.')}
        </Text>
        <TouchableOpacity onPress={this.reset} style={styles.button} activeOpacity={0.8}>
          <Text style={styles.buttonText}>
            {safeT('errors.boundaryRetry', 'Reintentar')}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#FFFFFF',
  },
  emoji: { fontSize: 56, marginBottom: 24 },
  title: {
    fontSize: 22,
    fontFamily: Platform.select({ ios: 'Poppins_700Bold', android: 'Poppins_700Bold' }),
    color: '#1F2937',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    fontFamily: Platform.select({ ios: 'Poppins_400Regular', android: 'Poppins_400Regular' }),
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  button: {
    backgroundColor: '#166634',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: Platform.select({ ios: 'Poppins_600SemiBold', android: 'Poppins_600SemiBold' }),
  },
});
