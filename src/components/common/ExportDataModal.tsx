import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { useSharedAccountStore } from '../../store/sharedAccountStore';
import { ExportFormat, prepareExport, shareExport } from '../../services/export.service';
import { reportError } from '../../services/crashReporting';
import BottomSheet from './BottomSheet';

const OPTIONS: { format: ExportFormat; icon: keyof typeof Ionicons.glyphMap; title: string; desc: string }[] = [
  { format: 'csv', icon: 'document-text-outline', title: 'export.csv', desc: 'export.csvDesc' },
  { format: 'xlsx', icon: 'grid-outline', title: 'export.excel', desc: 'export.excelDesc' },
  { format: 'pdf', icon: 'reader-outline', title: 'export.pdf', desc: 'export.pdfDesc' },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Después de compartir el fichero (p. ej. para seguir con el borrado de la cuenta) */
  onExported?: () => void;
}

// Elegir cómo exportar los datos de la cuenta activa. Una hoja propia y no un
// Alert: en Android un Alert admite como mucho 3 botones y aquí hacen falta 4.
const ExportDataModal = ({ visible, onClose, onExported }: Props) => {
  const { t } = useTranslation();
  const { colors: dc, ui } = useTheme();
  const isSharedMode = useSharedAccountStore((s) => s.isSharedMode);
  const sharedName = useSharedAccountStore((s) => s.sharedAccount?.name);
  const [busy, setBusy] = useState<ExportFormat | null>(null);

  // Lo que queda por hacer cuando la hoja termine de cerrarse: en iOS no se
  // puede abrir el menú de compartir (ni un Alert) mientras un Modal se cierra
  const afterClose = useRef<(() => void) | null>(null);
  const runAfterClose = useCallback(() => {
    const action = afterClose.current;
    afterClose.current = null;
    action?.();
  }, []);
  useEffect(() => {
    if (visible || !afterClose.current) return;
    // onDismiss solo llega en iOS; esto cubre Android y cualquier caso en que no llegue
    const id = setTimeout(runAfterClose, Platform.OS === 'ios' ? 700 : 300);
    return () => clearTimeout(id);
  }, [visible, runAfterClose]);

  const dismiss = () => { if (!busy) onClose(); };

  const handleSelect = async (format: ExportFormat) => {
    if (busy) return;
    setBusy(format);
    try {
      const file = await prepareExport(format);
      afterClose.current = async () => {
        try {
          await shareExport(file);
          onExported?.();
        } catch (e) {
          reportError(e, 'shareExport');
          Alert.alert(t('common.error'), t('export.error'));
        }
      };
    } catch (e) {
      reportError(e, `prepareExport:${format}`);
      afterClose.current = () => Alert.alert(t('common.error'), t('export.error'));
    }
    setBusy(null);
    onClose();
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={dismiss}
      onClosed={runAfterClose}
      title={t('export.chooseTitle')}
      subtitle={isSharedMode && sharedName ? t('export.chooseShared', { name: sharedName }) : t('export.choosePersonal')}
      bodyStyle={styles.body}
    >
      {OPTIONS.map((o) => (
        <TouchableOpacity
          key={o.format}
          style={[styles.option, { backgroundColor: ui.field }, !!busy && busy !== o.format && styles.dimmed]}
          onPress={() => handleSelect(o.format)}
          disabled={!!busy}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <View style={[styles.optionIcon, { backgroundColor: ui.accentSoft }]}>
            <Ionicons name={o.icon} size={22} color={ui.accent} />
          </View>
          <View style={styles.optionText}>
            <Text style={[styles.optionTitle, { color: dc.textPrimary }]}>{t(o.title)}</Text>
            <Text style={[styles.optionDesc, { color: dc.textSecondary }]}>{t(o.desc)}</Text>
          </View>
          {busy === o.format
            ? <ActivityIndicator color={ui.accent} />
            : <Ionicons name="chevron-forward" size={18} color={dc.textSecondary} />}
        </TouchableOpacity>
      ))}
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  body: { paddingBottom: 4 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 10,
  },
  optionIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  optionText: { flex: 1 },
  optionTitle: { fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  optionDesc: { fontSize: 12.5, fontFamily: 'Poppins_400Regular', lineHeight: 17, marginTop: 1 },
  dimmed: { opacity: 0.45 },
});

export default ExportDataModal;
