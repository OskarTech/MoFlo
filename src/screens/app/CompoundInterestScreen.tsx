import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, StyleSheet, TextInput, TouchableOpacity, Pressable, TextInputProps,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import auth from '@react-native-firebase/auth';
import Icon from '../../components/common/Icon';
import { useTheme } from '../../hooks/useTheme';
import { HeroScrollScreen } from '../../components/layout/HeroScreen';
import { HeroTitleBar } from '../../components/layout/HeroBar';
import { SectionHeader } from '../../components/layout/SheetSection';
import CompoundChart from '../../components/compound/CompoundChart';
import { useSettingsStore } from '../../store/settingsStore';
import { useSharedAccountStore } from '../../store/sharedAccountStore';
import {
  formatAmount, formatMoney, parseAmountInput, symbolGoesBefore, withCurrency,
} from '../../utils/formatAmount';
import { mixHex } from '../../utils/color';
import { MAX_PERCENT, MAX_YEARS, projectCompound } from '../../utils/compoundInterest';
import {
  CompoundInputs, EMPTY_COMPOUND_INPUTS, loadCompoundInputs, saveCompoundInputs,
} from '../../store/compoundInputs';
import { reportError } from '../../services/crashReporting';

// ── LO QUE SE ESCRIBE EN LOS CAMPOS ───────────────────────────────

// Importes: como en el resto de la app (admite separador de miles). Vacío es 0
const amountOf = (text: string) => {
  const value = parseAmountInput(text);
  return Number.isFinite(value) && value > 0 ? value : 0;
};

// Porcentajes: cifras y un solo separador decimal, coma o punto. Más del 100 %
// se queda en 100 al escribirlo
const percentText = (text: string) => {
  const clean = text.replace(/[^0-9.,]/g, '');
  const sep = clean.search(/[.,]/);
  const single = sep === -1 ? clean : clean.slice(0, sep + 1) + clean.slice(sep + 1).replace(/[.,]/g, '');
  return Number(single.replace(',', '.')) > MAX_PERCENT ? String(MAX_PERCENT) : single;
};

// Vacío (o solo la coma) no es un número: sin rentabilidad no se calcula
const percentOf = (text: string) => (/\d/.test(text) ? Number(text.replace(',', '.')) : NaN);

// Años: enteros, hasta 60. Más se queda en 60 al escribirlo
const yearsText = (text: string) => {
  const digits = text.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
  return Number(digits) > MAX_YEARS ? String(MAX_YEARS) : digits;
};

// Hasta dos decimales, sin ceros de sobra: 2, 2,5, 1,25
const shortNumber = (value: number) => {
  const cents = Math.round(value * 100);
  return formatAmount(cents / 100, cents % 100 === 0 ? 0 : cents % 10 === 0 ? 1 : 2);
};

// ── PIEZAS ────────────────────────────────────────────────────────

type FieldProps = Pick<TextInputProps, 'value' | 'keyboardType' | 'maxLength' | 'returnKeyType' | 'onSubmitEditing'> & {
  label: string;
  onChangeText: (text: string) => void;
  inputRef: React.RefObject<TextInput | null>;
  /** El símbolo delante ($) o detrás (€, %) de la cifra */
  prefix?: string;
  suffix?: string;
};

// Un campo de la calculadora, con su nombre encima. Tocar cualquier parte del
// campo (también el símbolo) lleva a la cifra
const CalcField = ({ label, inputRef, prefix, suffix, ...input }: FieldProps) => {
  const { colors: dc, ui } = useTheme();
  const [focused, setFocused] = useState(false);
  const unitStyle = [styles.unit, { color: dc.textSecondary }];
  return (
    <View style={styles.cell}>
      <Text style={[styles.cellLabel, { color: dc.textSecondary }]} numberOfLines={2}>{label}</Text>
      <Pressable
        style={[styles.field, { backgroundColor: ui.field, borderColor: focused ? ui.accent : 'transparent' }]}
        onPress={() => inputRef.current?.focus()}
        accessible={false}
      >
        {prefix ? <Text style={unitStyle}>{prefix}</Text> : null}
        <TextInput
          ref={inputRef}
          style={[styles.fieldInput, { color: dc.textPrimary }]}
          placeholder="0"
          placeholderTextColor={dc.textSecondary}
          selectionColor={ui.accent}
          keyboardType="decimal-pad"
          submitBehavior="submit"
          accessibilityLabel={label}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...input}
        />
        {suffix ? <Text style={unitStyle}>{suffix}</Text> : null}
      </Pressable>
    </View>
  );
};

// El color de cada parte, como en las barras: un cuadradito en el resumen y la
// leyenda, una rayita en la lectura del año elegido
const Swatch = ({ color }: { color: string }) => <View style={[styles.swatch, { backgroundColor: color }]} />;
const LineKey = ({ color }: { color: string }) => <View style={[styles.lineKey, { backgroundColor: color }]} />;

// ── PANTALLA ──────────────────────────────────────────────────────

/**
 * Calculadora de interés compuesto: importe inicial, aportación de cada mes
 * (DCA), rentabilidad anual y años. Con los datos puestos sale lo que se
 * tendría al final y un gráfico año a año (lo aportado y lo generado), con su
 * tabla. Cómo se calcula, en utils/compoundInterest.
 *
 * Es de premium: Ajustes solo deja entrar con premium. Lo escrito se guarda en
 * el móvil (ver compoundInputs) y se queda hasta que se borra a mano; no toca
 * los datos de la cuenta.
 */
const CompoundInterestScreen = () => {
  const { t } = useTranslation();
  const { colors: dc, ui } = useTheme();
  const navigation = useNavigation();

  // La moneda de la cuenta activa, ya resuelta (ver AnnualScreen): con la
  // función, el símbolo no cambiaría al cambiar de moneda
  const isSharedMode = useSharedAccountStore((s) => s.isSharedMode);
  const personalSymbol = useSettingsStore((s) => s.getCurrencySymbol());
  const sharedSymbol = useSharedAccountStore((s) => s.getSharedCurrencySymbol());
  const symbol = isSharedMode ? sharedSymbol : personalSymbol;
  const moneyUnit = symbolGoesBefore(symbol) ? { prefix: symbol } : { suffix: symbol };

  // Lo escrito, tal cual. Se guarda en el móvil con el id de quien lo escribe y
  // vuelve al entrar otra vez. Hasta leerlo no se enseñan los campos: lo
  // escrito en ese instante se perdería al llegar lo guardado
  const uid = auth().currentUser?.uid;
  const [inputs, setInputs] = useState<CompoundInputs>(EMPTY_COMPOUND_INPUTS);
  const [loaded, setLoaded] = useState(false);
  const setField = (field: keyof CompoundInputs, text: string) =>
    setInputs((current) => ({ ...current, [field]: text }));

  useEffect(() => {
    let alive = true;
    (uid ? loadCompoundInputs(uid) : Promise.resolve(EMPTY_COMPOUND_INPUTS)).then((saved) => {
      if (!alive) return;
      // Por los mismos filtros que al escribirlo
      setInputs({
        initial: saved.initial.slice(0, 12),
        monthly: saved.monthly.slice(0, 12),
        rate: percentText(saved.rate),
        years: yearsText(saved.years),
      });
      setLoaded(true);
    });
    return () => { alive = false; };
  }, [uid]);

  // Cada cambio se guarda al momento, así al salir no se pierde nada. Vaciar
  // todos los campos a mano es la forma de borrarlo
  useEffect(() => {
    if (!loaded || !uid) return;
    saveCompoundInputs(uid, inputs).catch((e) => reportError(e, 'guardar interés compuesto'));
  }, [inputs, loaded, uid]);

  // El año elegido en el gráfico; sin elegir, el último
  const [picked, setPicked] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const initialRef = useRef<TextInput>(null);
  const monthlyRef = useRef<TextInput>(null);
  const rateRef = useRef<TextInput>(null);
  const yearsRef = useRef<TextInput>(null);

  const initial = amountOf(inputs.initial);
  const monthly = amountOf(inputs.monthly);
  const rate = percentOf(inputs.rate);
  const years = Number(inputs.years) || 0;
  // Hace falta algo que invertir (al empezar o cada mes), la rentabilidad
  // (puede ser 0) y al menos un año
  const ready = Number.isFinite(rate) && years >= 1 && (initial > 0 || monthly > 0);

  const data = useMemo(
    () => (ready ? projectCompound({ initial, monthly, annualRate: rate, years }) : []),
    [ready, initial, monthly, rate, years],
  );
  const final = data[data.length - 1];
  const selectedIndex = data.length ? Math.min(picked ?? data.length - 1, data.length - 1) : -1;
  const point = data[selectedIndex];

  // Los intereses, en el color de la app; lo aportado, ese mismo color mezclado
  // a medias con la hoja. Se distinguen en todas las paletas, en claro y en
  // oscuro, también con daltonismo
  const interestColor = ui.accent;
  const contributedColor = mixHex(ui.accent, ui.sheet, 0.5);

  const money = (value: number) => formatMoney(value, symbol, { decimals: 0 });

  // Cifras del eje: enteras si no llega a 10.000; si llega, en corto
  const axisLabel = (value: number, compact: boolean) => {
    const text = !compact ? formatAmount(value, 0)
      : value >= 1e9 ? t('compound.billions', { value: shortNumber(value / 1e9) })
        : value >= 1e6 ? t('compound.millions', { value: shortNumber(value / 1e6) })
          : t('compound.thousands', { value: shortNumber(value / 1e3) });
    return withCurrency(text, symbol);
  };

  const pointSummary = point
    ? `${t('compound.year', { year: point.year })}: ${money(point.total)}. `
      + `${t('compound.contributed')} ${money(point.contributed)}, ${t('compound.interest')} ${money(point.interest)}`
    : '';

  const hero = (
    <>
      <HeroTitleBar title={t('compound.title')} onBack={() => navigation.goBack()} />
      <Text style={[styles.heroText, { color: ui.onHeroSoft }]}>{t('compound.intro')}</Text>
    </>
  );

  // Un instante, mientras se lee lo guardado: dura menos que la animación de entrada
  if (!loaded) return <HeroScrollScreen hero={hero}>{null}</HeroScrollScreen>;

  return (
    <HeroScrollScreen
      hero={hero}
      keyboardShouldPersistTaps="handled"
      // Al bajar a ver el gráfico, el teclado se va
      keyboardDismissMode="on-drag"
      // iOS: deja debajo el hueco del teclado, para poder desplazar hasta el final
      automaticallyAdjustKeyboardInsets
    >
      {/* ── DATOS ─────────────────────────────────────────────── */}
      <View style={styles.pad}>
        <View style={styles.row}>
          <CalcField
            label={t('compound.initial')}
            inputRef={initialRef}
            value={inputs.initial}
            onChangeText={(text) => setField('initial', text)}
            maxLength={12}
            {...moneyUnit}
            returnKeyType="next"
            onSubmitEditing={() => monthlyRef.current?.focus()}
          />
          <CalcField
            label={t('compound.monthly')}
            inputRef={monthlyRef}
            value={inputs.monthly}
            onChangeText={(text) => setField('monthly', text)}
            maxLength={12}
            {...moneyUnit}
            returnKeyType="next"
            onSubmitEditing={() => rateRef.current?.focus()}
          />
        </View>
        <View style={styles.row}>
          <CalcField
            label={t('compound.rate')}
            inputRef={rateRef}
            value={inputs.rate}
            onChangeText={(text) => setField('rate', percentText(text))}
            maxLength={6}
            suffix="%"
            returnKeyType="next"
            onSubmitEditing={() => yearsRef.current?.focus()}
          />
          <CalcField
            label={t('compound.years')}
            inputRef={yearsRef}
            value={inputs.years}
            onChangeText={(text) => {
              setField('years', yearsText(text));
              // Con otros años, se vuelve a ver el último
              setPicked(null);
            }}
            keyboardType="number-pad"
            maxLength={2}
            returnKeyType="done"
            onSubmitEditing={() => yearsRef.current?.blur()}
          />
        </View>
      </View>

      {!final || !point ? (
        // ── FALTAN DATOS ────────────────────────────────────────
        <View style={[styles.empty, { backgroundColor: ui.field }]}>
          <View style={[styles.emptyIcon, { backgroundColor: ui.accentSoft }]}>
            <Icon name="trending-up-outline" size={20} color={ui.accent} />
          </View>
          <Text style={[styles.emptyText, { color: dc.textSecondary }]}>{t('compound.empty')}</Text>
        </View>
      ) : (
        <>
          {/* ── RESULTADO ─────────────────────────────────────── */}
          <View style={[styles.summary, { backgroundColor: ui.field }]}>
            <Text style={[styles.summaryLabel, { color: dc.textSecondary }]}>
              {t('compound.finalIn', { count: final.year })}
            </Text>
            <Text
              style={[styles.summaryTotal, { color: dc.textPrimary }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.5}
            >
              {money(final.total)}
            </Text>
            <View style={styles.parts}>
              {[
                { key: 'contributed', color: contributedColor, value: final.contributed },
                { key: 'interest', color: interestColor, value: final.interest },
              ].map((part) => (
                <View key={part.key} style={styles.part}>
                  <View style={styles.partHead}>
                    <Swatch color={part.color} />
                    <Text style={[styles.partLabel, { color: dc.textSecondary }]} numberOfLines={1}>
                      {t(`compound.${part.key}`)}
                    </Text>
                  </View>
                  <Text
                    style={[styles.partValue, { color: dc.textPrimary }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.6}
                  >
                    {money(part.value)}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* ── AÑO A AÑO ─────────────────────────────────────── */}
          <SectionHeader title={t('compound.byYear')} style={styles.sectionHeader} />
          <View style={styles.pad}>
            {/* El año elegido en el gráfico, con sus cifras */}
            <View style={styles.readoutHead}>
              <Text style={[styles.readoutYear, { color: dc.textSecondary }]} numberOfLines={1}>
                {t('compound.year', { year: point.year })}
              </Text>
              <Text
                style={[styles.readoutTotal, { color: dc.textPrimary }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                {money(point.total)}
              </Text>
            </View>
            <View style={styles.parts}>
              {[
                { key: 'contributed', color: contributedColor, value: point.contributed },
                { key: 'interest', color: interestColor, value: point.interest },
              ].map((part) => (
                <View key={part.key} style={styles.part}>
                  <View style={styles.partHead}>
                    <LineKey color={part.color} />
                    <Text
                      style={[styles.readoutValue, { color: dc.textPrimary }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.6}
                    >
                      {money(part.value)}
                    </Text>
                  </View>
                  <Text style={[styles.readoutName, { color: dc.textSecondary }]} numberOfLines={1}>
                    {t(`compound.${part.key}`)}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.chart}>
              <CompoundChart
                data={data}
                selected={selectedIndex}
                onSelect={setPicked}
                contributedColor={contributedColor}
                interestColor={interestColor}
                axisLabel={axisLabel}
                accessibilityLabel={t('compound.chartLabel')}
                accessibilityValue={pointSummary}
              />
            </View>
            <View style={styles.legend}>
              {[
                { key: 'contributed', color: contributedColor },
                { key: 'interest', color: interestColor },
              ].map((part) => (
                <View key={part.key} style={styles.legendItem}>
                  <Swatch color={part.color} />
                  <Text style={[styles.legendText, { color: dc.textSecondary }]}>{t(`compound.${part.key}`)}</Text>
                </View>
              ))}
            </View>

            {/* Lo mismo en tabla, año por año */}
            <TouchableOpacity
              style={styles.tableToggle}
              onPress={() => setShowTable((v) => !v)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ expanded: showTable }}
            >
              <Text style={[styles.tableToggleText, { color: ui.accent }]}>
                {t(showTable ? 'compound.hideTable' : 'compound.showTable')}
              </Text>
              <Icon name={showTable ? 'chevron-up' : 'chevron-down'} size={15} color={ui.accent} />
            </TouchableOpacity>
            {showTable && (
              <View style={styles.table}>
                <View style={styles.tableRow}>
                  <Text style={[styles.th, styles.colYear, { color: dc.textSecondary }]} numberOfLines={1}>
                    {t('compound.yearShort')}
                  </Text>
                  {(['contributed', 'interest', 'total'] as const).map((key) => (
                    <Text key={key} style={[styles.th, styles.colNum, { color: dc.textSecondary }]} numberOfLines={1}>
                      {t(`compound.${key}`)}
                    </Text>
                  ))}
                </View>
                {data.map((row) => (
                  <View key={row.year} style={[styles.tableRow, styles.tableLine, { borderTopColor: ui.hair }]}>
                    <Text style={[styles.td, styles.colYear, { color: dc.textSecondary }]}>{row.year}</Text>
                    {[row.contributed, row.interest, row.total].map((value, i) => (
                      <Text
                        key={i}
                        style={[styles.td, styles.colNum, { color: dc.textPrimary }, i === 2 && styles.tdStrong]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.6}
                      >
                        {money(value)}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            )}

            <Text style={[styles.disclaimer, { color: dc.textSecondary }]}>{t('compound.disclaimer')}</Text>
          </View>
        </>
      )}
    </HeroScrollScreen>
  );
};

const styles = StyleSheet.create({
  heroText: { fontSize: 13.5, fontFamily: 'Poppins_400Regular', lineHeight: 20, paddingHorizontal: 20, paddingTop: 10 },
  pad: { paddingHorizontal: 20 },

  // Campos, de dos en dos. Pegados abajo: si un nombre ocupa dos líneas, los
  // campos siguen a la misma altura
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginBottom: 14 },
  cell: { flex: 1, minWidth: 0 },
  cellLabel: { fontSize: 12.5, fontFamily: 'Poppins_500Medium', marginBottom: 6, marginLeft: 2 },
  field: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 14, minHeight: 50,
  },
  fieldInput: { flex: 1, minWidth: 0, fontSize: 16, fontFamily: 'Poppins_500Medium', paddingVertical: 12 },
  unit: { fontSize: 15, fontFamily: 'Poppins_500Medium' },

  // Faltan datos
  empty: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 20, marginTop: 8, borderRadius: 20, padding: 16,
  },
  emptyIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  emptyText: { flex: 1, fontSize: 13, fontFamily: 'Poppins_400Regular', lineHeight: 19 },

  // Resultado
  summary: { marginHorizontal: 20, marginTop: 8, borderRadius: 20, padding: 16 },
  summaryLabel: { fontSize: 13, fontFamily: 'Poppins_500Medium' },
  summaryTotal: { fontSize: 32, fontFamily: 'Poppins_700Bold', letterSpacing: -0.8, marginTop: 2 },
  parts: { flexDirection: 'row', gap: 12, marginTop: 10 },
  part: { flex: 1, minWidth: 0 },
  partHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  partLabel: { fontSize: 12, fontFamily: 'Poppins_500Medium', flexShrink: 1 },
  partValue: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', marginTop: 2 },
  swatch: { width: 10, height: 10, borderRadius: 3 },

  // Año a año
  sectionHeader: { marginTop: 26 },
  readoutHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  readoutYear: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
  readoutTotal: { fontSize: 20, fontFamily: 'Poppins_700Bold', letterSpacing: -0.4, flexShrink: 1 },
  lineKey: { width: 12, height: 3, borderRadius: 2 },
  readoutValue: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', flexShrink: 1 },
  readoutName: { fontSize: 11.5, fontFamily: 'Poppins_400Regular', marginLeft: 18 },
  chart: { marginTop: 14 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontSize: 11.5, fontFamily: 'Poppins_400Regular' },

  // Tabla
  tableToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 14 },
  tableToggleText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
  table: { marginBottom: 4 },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  tableLine: { borderTopWidth: StyleSheet.hairlineWidth },
  th: { fontSize: 11.5, fontFamily: 'Poppins_600SemiBold' },
  td: { fontSize: 12.5, fontFamily: 'Poppins_400Regular', fontVariant: ['tabular-nums'] },
  tdStrong: { fontFamily: 'Poppins_600SemiBold' },
  colYear: { width: 40 },
  colNum: { flex: 1, minWidth: 0, textAlign: 'right' },

  disclaimer: { fontSize: 11.5, fontFamily: 'Poppins_400Regular', lineHeight: 17, marginTop: 10 },
});

export default CompoundInterestScreen;
