import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Text } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import auth from '@react-native-firebase/auth';
import Icon from '../../components/common/Icon';
import { useTheme } from '../../hooks/useTheme';
import { HeroScrollScreen } from '../../components/layout/HeroScreen';
import { HeroTitleBar, HeroChip } from '../../components/layout/HeroBar';
import { SegmentedControl, SheetButton } from '../../components/common/BottomSheet';
import SudokuBoard from '../../components/sudoku/SudokuBoard';
import { SudokuGame, loadSudokuGame, saveSudokuGame } from '../../store/sudokuGame';
import {
  SUDOKU_LEVELS, SudokuLevel, conflictsOf, generateSudoku,
} from '../../utils/sudoku';
import { lightHaptic, selectionHaptic, successHaptic, warningHaptic } from '../../utils/haptics';
import { reportError } from '../../services/crashReporting';

const NO_ENTRIES = new Array<number>(81).fill(0);
// El teclado: del 1 al 5 arriba; del 6 al 9 y borrar (0) abajo
const KEY_ROWS = [[1, 2, 3, 4, 5], [6, 7, 8, 9, 0]];

/**
 * Sudoku en tres niveles. Se elige el nivel y Jugar genera uno nuevo;
 * Reiniciar borra lo puesto y deja el mismo sudoku. La partida se guarda en el
 * móvil (ver sudokuGame) y sigue al volver. No usa los datos de la cuenta.
 *
 * Es de premium: Ajustes solo deja entrar con premium.
 */
const SudokuScreen = () => {
  const { t } = useTranslation();
  const { colors: dc, ui } = useTheme();
  const navigation = useNavigation();
  const uid = auth().currentUser?.uid;

  const [game, setGame] = useState<SudokuGame | null>(null);
  const [loaded, setLoaded] = useState(false);
  // El nivel del siguiente sudoku; al entrar, el de la partida guardada
  const [level, setLevel] = useState<SudokuLevel>('easy');
  const [selected, setSelected] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);

  // La partida guardada. Hasta tenerla no se enseña el tablero
  useEffect(() => {
    let alive = true;
    (uid ? loadSudokuGame(uid) : Promise.resolve(null)).then((saved) => {
      if (!alive) return;
      setGame(saved);
      if (saved) setLevel(saved.level);
      setLoaded(true);
    });
    return () => { alive = false; };
  }, [uid]);

  // Cada número puesto se guarda al momento: al salir no se pierde nada
  useEffect(() => {
    if (!loaded || !uid || !game) return;
    saveSudokuGame(uid, game).catch((e) => reportError(e, 'guardar sudoku'));
  }, [game, loaded, uid]);

  const board = useMemo(() => (game ? game.puzzle.map((digit, i) => digit || game.entries[i]) : null), [game]);
  const conflicts = useMemo(() => (board ? conflictsOf(board) : null), [board]);
  const givens = useMemo(() => (game ? game.puzzle.map(Boolean) : null), [game]);
  const solved = !!game && !!board && board.every((digit, i) => digit === game.solution[i]);
  const hasEntries = !!game && game.entries.some(Boolean);
  // Cuántas veces está ya cada número: con las 9, su tecla se apaga
  const placed = useMemo(() => {
    const counts = new Array<number>(10).fill(0);
    board?.forEach((digit) => { counts[digit]++; });
    return counts;
  }, [board]);

  // Al completarlo, una vibración de éxito. No al entrar con uno ya resuelto
  const wasSolved = useRef<boolean | null>(null);
  useEffect(() => {
    if (!loaded) return;
    if (wasSolved.current === false && solved) successHaptic();
    wasSolved.current = solved;
  }, [solved, loaded]);

  // Se genera un instante después de pulsar, para que dé tiempo a ver la
  // ruedita: en móviles lentos, uno difícil puede tardar un poco
  const newGame = () => {
    setGenerating(true);
    setSelected(null);
    setTimeout(() => {
      try {
        setGame({ ...generateSudoku(level), entries: NO_ENTRIES.slice() });
      } catch (e) {
        reportError(e, 'generar sudoku');
      } finally {
        setGenerating(false);
      }
    }, 30);
  };

  // Con uno a medias, antes se pregunta: se perdería
  const handlePlay = () => {
    if (generating) return;
    if (hasEntries && !solved) {
      warningHaptic();
      Alert.alert(t('sudoku.newGameTitle'), t('sudoku.newGameMessage'), [
        { text: t('settings.cancel'), style: 'cancel' },
        { text: t('sudoku.play'), onPress: newGame },
      ]);
      return;
    }
    lightHaptic();
    newGame();
  };

  const handleReset = () => {
    if (!hasEntries) return;
    warningHaptic();
    Alert.alert(t('sudoku.resetTitle'), t('sudoku.resetMessage'), [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('sudoku.reset'),
        style: 'destructive',
        onPress: () => {
          setGame((current) => current && { ...current, entries: NO_ENTRIES.slice() });
          setSelected(null);
        },
      },
    ]);
  };

  // Pone el número en la casilla elegida; el mismo otra vez, o borrar (0), la vacía
  const place = (digit: number) => {
    if (!game || selected == null || solved || game.puzzle[selected]) return;
    const current = game.entries[selected];
    const next = digit === 0 || digit === current ? 0 : digit;
    if (next === current) return;
    const entries = game.entries.slice();
    entries[selected] = next;
    selectionHaptic();
    setGame({ ...game, entries });
  };

  const keypadOff = !game || solved || generating;

  const hero = (
    <HeroTitleBar
      title={t('sudoku.title')}
      onBack={() => navigation.goBack()}
      right={game ? <HeroChip label={t(`sudoku.${game.level}`)} /> : undefined}
    />
  );

  // Un instante, mientras se lee la partida guardada
  if (!loaded) return <HeroScrollScreen hero={hero}>{null}</HeroScrollScreen>;

  return (
    <HeroScrollScreen hero={hero}>
      <View style={styles.pad}>
        <SegmentedControl
          options={SUDOKU_LEVELS.map((key) => ({ key, label: t(`sudoku.${key}`) }))}
          value={level}
          onChange={(key) => { lightHaptic(); setLevel(key); }}
        />
        <View style={styles.actions}>
          <SheetButton
            label={t('sudoku.play')}
            onPress={handlePlay}
            loading={generating}
            style={styles.action}
          />
          <TouchableOpacity
            style={[styles.action, styles.secondary, { backgroundColor: ui.field }, !hasEntries && styles.off]}
            onPress={handleReset}
            disabled={!hasEntries || generating}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ disabled: !hasEntries || generating }}
          >
            <Icon name="repeat-outline" size={18} color={ui.accent} />
            <Text style={[styles.secondaryText, { color: ui.accent }]} numberOfLines={1}>{t('sudoku.reset')}</Text>
          </TouchableOpacity>
        </View>

        {game && board && conflicts && givens ? (
          <>
            {solved && (
              <View style={[styles.banner, { backgroundColor: ui.accentSoft }]}>
                <Icon name="trophy-outline" size={22} color={ui.accent} />
                <View style={styles.bannerText}>
                  <Text style={[styles.bannerTitle, { color: dc.textPrimary }]}>{t('sudoku.solved')}</Text>
                  <Text style={[styles.bannerHint, { color: dc.textSecondary }]}>{t('sudoku.solvedHint')}</Text>
                </View>
              </View>
            )}

            <SudokuBoard
              board={board}
              givens={givens}
              conflicts={conflicts}
              selected={solved ? null : selected}
              onSelect={setSelected}
              locked={solved}
            />

            <View style={styles.keypad}>
              {KEY_ROWS.map((row) => (
                <View key={row.join()} style={styles.keyRow}>
                  {row.map((digit) => (
                    <TouchableOpacity
                      key={digit}
                      style={[styles.key, { backgroundColor: ui.field }, keypadOff && styles.off]}
                      onPress={() => place(digit)}
                      disabled={keypadOff}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={digit ? String(digit) : t('sudoku.erase')}
                    >
                      {digit ? (
                        <Text
                          style={[
                            styles.keyDigit,
                            { color: ui.accent },
                            // Ya están los nueve: se apaga, pero se puede seguir usando
                            placed[digit] >= 9 && styles.keyDone,
                          ]}
                        >
                          {digit}
                        </Text>
                      ) : (
                        <>
                          <Icon name="close" size={18} color={dc.textSecondary} />
                          <Text style={[styles.keyLabel, { color: dc.textSecondary }]} numberOfLines={1}>
                            {t('sudoku.erase')}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </View>
          </>
        ) : (
          // Sin partida: las reglas y cómo empezar
          <View style={[styles.empty, { backgroundColor: ui.field }]}>
            <View style={[styles.emptyIcon, { backgroundColor: ui.accentSoft }]}>
              <Icon name="grid-outline" size={22} color={ui.accent} />
            </View>
            <Text style={[styles.emptyRules, { color: dc.textPrimary }]}>{t('sudoku.rules')}</Text>
            <Text style={[styles.emptyHint, { color: dc.textSecondary }]}>{t('sudoku.empty')}</Text>
          </View>
        )}
      </View>
    </HeroScrollScreen>
  );
};

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 20 },

  // Nivel, Jugar y Reiniciar
  actions: { flexDirection: 'row', gap: 10, marginTop: 12, marginBottom: 16 },
  action: { flex: 1 },
  secondary: {
    height: 52, borderRadius: 16, flexDirection: 'row', gap: 8,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12,
  },
  secondaryText: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', flexShrink: 1 },
  off: { opacity: 0.45 },

  // Resuelto
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 16, padding: 14, marginBottom: 14,
  },
  bannerText: { flex: 1 },
  bannerTitle: { fontSize: 15, fontFamily: 'Poppins_700Bold' },
  bannerHint: { fontSize: 12.5, fontFamily: 'Poppins_400Regular', marginTop: 1 },

  // Teclado
  keypad: { gap: 8, marginTop: 16 },
  keyRow: { flexDirection: 'row', gap: 8 },
  key: { flex: 1, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  keyDigit: { fontSize: 22, fontFamily: 'Poppins_600SemiBold' },
  keyDone: { opacity: 0.3 },
  keyLabel: { fontSize: 10.5, fontFamily: 'Poppins_500Medium' },

  // Sin partida
  empty: { borderRadius: 20, padding: 18, alignItems: 'center' },
  emptyIcon: { width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  emptyRules: { fontSize: 14, fontFamily: 'Poppins_500Medium', lineHeight: 21, textAlign: 'center' },
  emptyHint: { fontSize: 13, fontFamily: 'Poppins_400Regular', marginTop: 8, textAlign: 'center' },
});

export default SudokuScreen;
