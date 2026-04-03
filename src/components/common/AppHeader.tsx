import React from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Platform,
} from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { colors } from '../../theme';

interface Props {
  title: string;
  onBellPress?: () => void;
  showBell?: boolean;
}

const AppHeader = ({
  title,
  onBellPress,
  showBell = true,
}: Props) => {
  const { colors: dc, isDark } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const route = useRoute();

  const isInSettings = route.name === 'Settings';
  const isInReminders = route.name === 'Reminders';

  // ── COLORES BASE ───────────────────────────────────────────────
  const headerBg = isDark ? dc.surface : colors.secondary;
  const iconColor = isDark ? dc.textPrimary : '#FFFFFF';
  const titleColor = isDark ? dc.textPrimary : '#FFFFFF';
  const iconBg = isDark ? dc.border + '80' : 'rgba(255,255,255,0.15)';

  // ── CAMPANA — verde si estamos en Recordatorios ────────────────
  const bellIconColor = isInReminders ? colors.primaryLight : iconColor;
  const bellIconBg = isInReminders
    ? colors.primaryLight + '30'
    : iconBg;

  // ── TUERCA — verde si estamos en Ajustes ───────────────────────
  const settingsIconColor = isInSettings ? colors.primaryLight : iconColor;
  const settingsIconBg = isInSettings
    ? colors.primaryLight + '30'
    : iconBg;

  const handleBellPress = () => {
    if (!isInReminders) {
      navigation.navigate('Reminders');
    }
    if (onBellPress) onBellPress();
  };

  const handleSettingsPress = () => {
    if (!isInSettings) {
      navigation.navigate('Settings');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: headerBg }]}>
      {/* CAMPANA — izquierda */}
      {showBell ? (
        <TouchableOpacity
          style={[styles.iconButton, { backgroundColor: bellIconBg }]}
          onPress={handleBellPress}
          activeOpacity={0.7}
        >
          <Ionicons
            name="notifications-outline"
            size={20}
            color={bellIconColor}
          />
        </TouchableOpacity>
      ) : (
        <View style={styles.iconPlaceholder} />
      )}

      {/* TÍTULO — centro */}
      <Text style={[styles.title, { color: titleColor }]}>{title}</Text>

      {/* TUERCA — siempre visible, verde en Settings */}
      <TouchableOpacity
        style={[styles.iconButton, { backgroundColor: settingsIconBg }]}
        onPress={handleSettingsPress}
        activeOpacity={0.7}
      >
        <Ionicons
          name="settings-outline"
          size={20}
          color={settingsIconColor}
        />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android'
      ? (StatusBar.currentHeight ?? 0) + 12
      : 12,
    paddingBottom: 12,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconPlaceholder: {
    width: 38,
    height: 38,
  },
  title: {
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
    flex: 1,
    textAlign: 'center',
  },
});

export default AppHeader;