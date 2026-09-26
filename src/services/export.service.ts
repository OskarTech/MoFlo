import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import i18n from '../i18n';
import { useSettingsStore, CURRENCIES } from '../store/settingsStore';
import { useSharedAccountStore } from '../store/sharedAccountStore';
import { useMovementStore } from '../store/movementStore';
import { useSavingsStore } from '../store/savingsStore';
import { useCategoryStore } from '../store/categoryStore';
import { useSharedCategoryStore } from '../store/sharedCategoryStore';
import { COLOR_PALETTES, ColorPaletteId } from '../theme';
import { CATEGORY_COLORS } from '../theme/categoryColors';
import { makeCategoryColors } from '../utils/categoryColors';
import { getMemberLabel } from '../utils/memberLabel';
import { getSeparators } from '../utils/formatAmount';
import { ExportDateFormat, ExportInput, fileBaseName, summarize } from './export/data';
import { buildCsv } from './export/csv';
import { buildXlsx } from './export/xlsx';
import { buildReportHtml } from './export/pdf';

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

export interface PreparedExport {
  uri: string;
  mimeType: string;
  UTI: string;
}

/**
 * Los datos de la cuenta activa: en una cuenta compartida, los de la cuenta
 * (movimientos, recurrentes, metas, categorías, moneda, formato de fecha y
 * paleta de la cuenta); en la individual, los propios. Los stores ya tienen
 * cargada la cuenta activa, igual que lo que se ve en pantalla.
 */
const collectInput = (): ExportInput => {
  const settings = useSettingsStore.getState();
  const shared = useSharedAccountStore.getState();
  const isShared = shared.isSharedMode && !!shared.sharedAccount;
  const account = isShared ? shared.sharedAccount : null;
  const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, options);

  const currencyCode = isShared ? shared.sharedCurrencyCode : settings.currencyCode;
  const rawPalette = isShared ? shared.sharedColorPalette : settings.colorPalette;
  const palette: ColorPaletteId = rawPalette && rawPalette in COLOR_PALETTES ? rawPalette : isShared ? 'navy' : 'green';
  const categoryStore = useCategoryStore.getState();
  const sharedCategoryStore = useSharedCategoryStore.getState();
  const colors = makeCategoryColors(
    CATEGORY_COLORS[palette].light,
    isShared ? sharedCategoryStore.sharedCustomCategories : categoryStore.customCategories,
  );
  const formerLabel = t('sharedAccount.formerMember');

  return {
    accountName: account?.name || settings.displayName || t('export.personalAccountLabel'),
    isShared,
    memberCount: account?.members?.length ?? 1,
    currencySymbol: CURRENCIES.find((c) => c.code === currencyCode)?.symbol ?? '€',
    dateFormat: ((isShared ? shared.sharedDateFormat : settings.dateFormat) === 'MM/DD/YYYY' ? 'MM/DD/YYYY' : 'DD/MM/YYYY') as ExportDateFormat,
    separators: getSeparators(),
    exportedAt: new Date(),
    accent: COLOR_PALETTES[palette].primary,
    movements: useMovementStore.getState().movements,
    recurring: useMovementStore.getState().recurringMovements,
    huchas: useSavingsStore.getState().huchas,
    huchaMovements: useSavingsStore.getState().huchaMovements,
    category: (id, type) => (isShared
      ? {
        name: sharedCategoryStore.getSharedCategoryName(id, type, t),
        color: colors.expense(id),
        deleted: sharedCategoryStore.isSharedCategoryDeleted(id, type),
      }
      : {
        name: categoryStore.getCategoryName(id, type, t),
        color: colors.expense(id),
        deleted: categoryStore.isCategoryDeleted(id, type),
      }),
    incomeColor: colors.income,
    member: (uid) => (isShared ? getMemberLabel(account, uid, formerLabel) : undefined),
    t,
  };
};

// Se carga al usarlo: con una build anterior a expo-print el módulo nativo no
// existe, y un import arriba cerraría la app al abrir Ajustes
type PrintModule = typeof import('expo-print');
const loadPrint = (): PrintModule => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- diferido: el módulo nativo puede no estar en la build instalada
  return require('expo-print') as PrintModule;
};

const writeCacheFile = (name: string, content: string | Uint8Array) => {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(content);
  return file.uri;
};

/** Genera el fichero de la cuenta activa en la caché, listo para compartir */
export const prepareExport = async (format: ExportFormat): Promise<PreparedExport> => {
  const input = collectInput();
  const name = fileBaseName(input);

  if (format === 'csv') {
    return {
      uri: writeCacheFile(`${name}.csv`, buildCsv(input)),
      mimeType: 'text/csv',
      UTI: 'public.comma-separated-values-text',
    };
  }

  const summary = summarize(input);
  if (format === 'xlsx') {
    return {
      uri: writeCacheFile(`${name}.xlsx`, buildXlsx(input, summary)),
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      UTI: 'org.openxmlformats.spreadsheetml.sheet',
    };
  }

  // PDF en A4 (595 × 842 puntos). En iOS los márgenes los pone expo-print y
  // no el CSS; en Android es al revés
  const Print = loadPrint();
  const isIOS = Platform.OS === 'ios';
  const html = buildReportHtml(input, summary, { pageMargin: isIOS ? '0' : '14mm 12mm' });
  const { uri } = await Print.printToFileAsync({
    html,
    width: 595,
    height: 842,
    ...(isIOS ? { margins: { left: 34, right: 34, top: 40, bottom: 40 } } : {}),
  });
  // Con un nombre legible en vez del aleatorio que le da expo-print
  const printed = new File(uri);
  const target = new File(Paths.cache, `${name}.pdf`);
  if (target.exists) target.delete();
  printed.move(target);
  return { uri: target.uri, mimeType: 'application/pdf', UTI: 'com.adobe.pdf' };
};

export const shareExport = async (file: PreparedExport): Promise<void> => {
  await Sharing.shareAsync(file.uri, {
    mimeType: file.mimeType,
    UTI: file.UTI,
    dialogTitle: 'MoFlo',
  });
};
