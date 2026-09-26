import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import {
  View, StyleSheet, SectionList, TouchableOpacity, Alert, ScrollView, Animated,
  TextInput as RNTextInput,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useIsFocused } from '@react-navigation/native';
import { useMovementStore } from '../../store/movementStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useCategoryStore } from '../../store/categoryStore';
import { useSharedAccountStore } from '../../store/sharedAccountStore';
import { useSharedCategoryStore } from '../../store/sharedCategoryStore';
import { useSavingsStore } from '../../store/savingsStore';
import { useTheme } from '../../hooks/useTheme';
import { useCategoryInfo } from '../../hooks/useCategoryInfo';
import { Movement, MovementType, HuchaMovement, RecurringMovement } from '../../types';
import AddRecurringModal from '../../components/movements/AddRecurringModal';
import AddMovementModal from '../../components/movements/AddMovementModal';
import { formatAmount } from '../../utils/formatAmount';
import { withAlpha } from '../../utils/color';
import { groupByDay, dayLabel, dayTotalLabel } from '../../utils/groupByDay';
import SwipeableRow, { closeOpenSwipeable } from '../../components/common/SwipeableRow';
import MovementItem from '../../components/common/MovementItem';
import StrikeText from '../../components/common/StrikeText';
import { HeroTop, HeroSheetCap, HeroStatusBar, useHeroScroll } from '../../components/layout/HeroScreen';
import { HeroTitleBar, MonthSelector } from '../../components/layout/HeroBar';
import { GroupHeader } from '../../components/layout/SheetSection';
import { useTabBarSpace } from '../../components/navigation/GlassTabBar';
import { lightHaptic, warningHaptic } from '../../utils/haptics';

type FilterType = MovementType | 'hucha' | 'recurring';

const AnimatedSectionList = Animated.createAnimatedComponent(SectionList) as unknown as typeof SectionList;

// Índice absoluto del mes (año * 12 + mes): permite moverse entre meses sin líos de fechas
const monthIndexOf = (d: Date) => d.getFullYear() * 12 + d.getMonth();

const MovementRowBase = ({
  movement, onDelete, onEdit,
}: {
  movement: Movement;
  onDelete: (id: string) => void;
  onEdit: (movement: Movement) => void;
}) => {
  const { t } = useTranslation();
  const { colors: dc, ui } = useTheme();
  const cat = useCategoryInfo();
  const isSharedMode = useSharedAccountStore((s) => s.isSharedMode);
  const personalCurrencySymbol = useSettingsStore((s) => s.getCurrencySymbol());
  const sharedCurrencySymbol = useSharedAccountStore((s) => s.getSharedCurrencySymbol());
  const currencySymbol = isSharedMode ? sharedCurrencySymbol : personalCurrencySymbol;

  const d = new Date(movement.date);
  // Los fijos se generan a las 00:00: la hora no dice nada, ya llevan su etiqueta
  const time = movement.isRecurring
    ? undefined
    : `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;

  // Deslizar hasta la papelera no borra directamente: se confirma antes, por si
  // el gesto ha sido accidental
  const handleDelete = () => {
    warningHaptic();
    const title = movement.note || cat.name(movement.category, movement.type);
    Alert.alert(
      t('movementsList.deleteConfirm'),
      `${title} · ${formatAmount(movement.amount)} ${currencySymbol}`,
      [
        { text: t('movements.cancel'), style: 'cancel' },
        {
          text: t('movementsList.delete'),
          style: 'destructive',
          onPress: () => onDelete(movement.id),
        },
      ],
    );
  };

  return (
    <SwipeableRow
      borderRadius={14}
      actions={[
        { icon: 'pencil', background: dc.primary, onPress: () => onEdit(movement) },
        { icon: 'trash', background: ui.expenseText, onPress: handleDelete },
      ]}
    >
      {/* Con fondo propio: si no, los botones de detrás se verían sin deslizar */}
      <View style={[styles.rowWrap, { backgroundColor: ui.sheet }]}>
        <MovementItem movement={movement} currencySymbol={currencySymbol} detail={time} />
      </View>
    </SwipeableRow>
  );
};

// Cada fila monta un Swipeable con dos gestos nativos y dos botones ocultos, así
// que re-renderizarlas todas a la vez es caro. Con memo solo se vuelve a
// renderizar la fila cuyo movimiento ha cambiado.
const MovementRow = memo(MovementRowBase);

const HuchaMovementRowBase = ({ movement }: { movement: HuchaMovement }) => {
  const { t } = useTranslation();
  const { colors: dc, ui } = useTheme();
  const isSharedMode = useSharedAccountStore((s) => s.isSharedMode);
  const personalCurrencySymbol = useSettingsStore((s) => s.getCurrencySymbol());
  const sharedCurrencySymbol = useSharedAccountStore((s) => s.getSharedCurrencySymbol());
  const currencySymbol = isSharedMode ? sharedCurrencySymbol : personalCurrencySymbol;

  const isDeposit = movement.type === 'deposit';
  const huchaColor = movement.huchaColor || dc.savings;

  return (
    <View style={styles.hRow}>
      <View style={[styles.hIcon, { backgroundColor: withAlpha(huchaColor, 0.16) }]}>
        <Ionicons name={isDeposit ? 'arrow-down' : 'arrow-up'} size={20} color={huchaColor} />
      </View>
      <View style={styles.hInfo}>
        <Text style={[styles.hTitle, { color: dc.textPrimary }]} numberOfLines={1}>{movement.huchaName}</Text>
        <Text style={[styles.hSub, { color: dc.textSecondary }]} numberOfLines={1}>
          {t(isDeposit ? 'hucha.depositLabel' : 'hucha.withdrawalLabel')}
        </Text>
      </View>
      <Text style={[styles.hAmount, { color: isDeposit ? ui.savingsText : dc.textPrimary }]}>
        {isDeposit ? '+' : '-'}{formatAmount(movement.amount)} {currencySymbol}
      </Text>
    </View>
  );
};

const HuchaMovementRow = memo(HuchaMovementRowBase);

const RecurringRowBase = ({
  item, onDelete, onEdit,
}: {
  item: RecurringMovement;
  onDelete: (id: string) => void;
  onEdit: (item: RecurringMovement) => void;
}) => {
  const { t } = useTranslation();
  const { colors: dc, ui } = useTheme();
  const cat = useCategoryInfo();
  const isSharedMode = useSharedAccountStore((s) => s.isSharedMode);
  const personalCurrencySymbol = useSettingsStore((s) => s.getCurrencySymbol());
  const sharedCurrencySymbol = useSharedAccountStore((s) => s.getSharedCurrencySymbol());
  const currencySymbol = isSharedMode ? sharedCurrencySymbol : personalCurrencySymbol;

  const type = item.type as MovementType;
  const isIncome = type === 'income';
  const color = cat.color(item.category, type);
  const catName = (
    <StrikeText struck={cat.deleted(item.category, type)}>{cat.name(item.category, type)}</StrikeText>
  );

  const handleDelete = () => {
    warningHaptic();
    Alert.alert(
      t('recurring.deleteConfirm'),
      item.note || item.description,
      [
        { text: t('movements.cancel'), style: 'cancel' },
        { text: 'OK', style: 'destructive', onPress: () => onDelete(item.id) },
      ],
    );
  };

  return (
    <SwipeableRow
      borderRadius={14}
      actions={[
        { icon: 'pencil', background: dc.primary, onPress: () => onEdit(item) },
        { icon: 'trash', background: ui.expenseText, onPress: handleDelete },
      ]}
    >
      <View style={[styles.rowWrap, styles.hRow, { backgroundColor: ui.sheet }]}>
        <View style={[styles.hIcon, { backgroundColor: withAlpha(color, 0.15) }]}>
          <Ionicons name={cat.icon(item.category, type)} size={20} color={color} />
        </View>
        <View style={styles.hInfo}>
          <Text style={[styles.hTitle, { color: dc.textPrimary }]} numberOfLines={1}>
            {item.note || catName}
          </Text>
          <Text style={[styles.hSub, { color: dc.textSecondary }]} numberOfLines={1}>
            {item.note ? <>{catName}{' · '}</> : null}
            {t('recurring.dayOfMonth', { day: item.recurringDay })}
          </Text>
        </View>
        <Text style={[styles.hAmount, { color: isIncome ? ui.incomeText : dc.textPrimary }]}>
          {isIncome ? '+' : '-'}{formatAmount(item.amount)} {currencySymbol}
        </Text>
      </View>
    </SwipeableRow>
  );
};

const RecurringRow = memo(RecurringRowBase);

type Section = { key: string; title?: string; total?: string; data: any[] };

const MovementsScreen = () => {
  const { t } = useTranslation();
  // Un selector por campo en vez de `useMovementStore()` entero: al cambiar de
  // filtro se escribe `activeHistorialFilter` en este mismo store y, suscritos
  // al store completo, eso provocaba un segundo render de toda la pantalla
  const movements = useMovementStore((s) => s.movements);
  const deleteMovement = useMovementStore((s) => s.deleteMovement);
  const setShowMovementModal = useMovementStore((s) => s.setShowMovementModal);
  const recurringMovements = useMovementStore((s) => s.recurringMovements);
  const deleteRecurringMovement = useMovementStore((s) => s.deleteRecurringMovement);
  const showRecurringModal = useMovementStore((s) => s.showRecurringModal);
  const setShowRecurringModal = useMovementStore((s) => s.setShowRecurringModal);
  const setActiveHistorialFilter = useMovementStore((s) => s.setActiveHistorialFilter);
  const huchaMovements = useSavingsStore((s) => s.huchaMovements);
  const isSharedMode = useSharedAccountStore((s) => s.isSharedMode);
  // El selector devuelve el símbolo ya resuelto y no la función: getCurrencySymbol
  // lee de get() por dentro, así que su identidad nunca cambia y suscribirse a
  // ella dejaría el símbolo obsoleto al cambiar de moneda en Ajustes. Devolviendo
  // la cadena, Zustand la compara y re-renderiza solo si el símbolo cambia.
  const personalCurrencySymbol = useSettingsStore((s) => s.getCurrencySymbol());
  const sharedCurrencySymbol = useSharedAccountStore((s) => s.getSharedCurrencySymbol());
  const language = useSettingsStore((s) => s.language);
  const { colors: dc, ui } = useTheme();
  const currencySymbol = isSharedMode ? sharedCurrencySymbol : personalCurrencySymbol;
  const recurringIncomeTotal = recurringMovements
    .filter((m) => m.type === 'income')
    .reduce((s, m) => s + m.amount, 0);
  const recurringExpenseTotal = recurringMovements
    .filter((m) => m.type === 'expense')
    .reduce((s, m) => s + m.amount, 0);
  const recurringNet = recurringIncomeTotal - recurringExpenseTotal;
  const getCategoryName = useCategoryStore((s) => s.getCategoryName);
  const getSharedCategoryName = useSharedCategoryStore((s) => s.getSharedCategoryName);
  const route = useRoute<any>();
  const tabSpace = useTabBarSpace();
  const { scrollY, onScroll } = useHeroScroll();
  const [heroHeight, setHeroHeight] = useState(0);
  // Los modales solo se montan en la pantalla que tiene el foco: AddRecurringModal
  // se abre con una bandera del store, y si otra pantalla montara uno igual se
  // dibujaría duplicado. El foco no cambia mientras hay un modal abierto, así que
  // la animación de salida se sigue viendo entera antes de desmontarse.
  const isFocused = useIsFocused();
  const [filter, setFilter] = useState<FilterType>(route.params?.initialFilter ?? 'income');
  const [editingRecurring, setEditingRecurring] = useState<RecurringMovement | null>(null);
  const [editingMovement, setEditingMovement] = useState<Movement | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  // Mes elegido; null = el mes actual (así, al cambiar de mes el calendario, sigue siendo el actual)
  const [pickedMonth, setPickedMonth] = useState<number | null>(null);

  const handleEditRecurring = useCallback((item: RecurringMovement) => {
    setEditingRecurring(item);
    setShowRecurringModal(true);
  }, [setShowRecurringModal]);

  useEffect(() => {
    if (route.params?.initialFilter) {
      setFilter(route.params.initialFilter);
      // Se llega desde el resumen del mes actual
      setPickedMonth(null);
    }
  }, [route.params?.initialFilter]);

  useEffect(() => {
    setActiveHistorialFilter(filter);
  }, [filter, setActiveHistorialFilter]);

  const currentMonth = monthIndexOf(new Date());
  const selectedMonth = pickedMonth ?? currentMonth;
  // Hasta el primer mes con algún movimiento
  const firstMonth = useMemo(() => {
    let first = currentMonth;
    movements.forEach((m) => { first = Math.min(first, monthIndexOf(new Date(m.date))); });
    huchaMovements.forEach((m) => { first = Math.min(first, monthIndexOf(new Date(m.date))); });
    return first;
  }, [movements, huchaMovements, currentMonth]);

  const goToMonth = (index: number) => {
    closeOpenSwipeable();
    lightHaptic();
    setSearchQuery('');
    setPickedMonth(index >= currentMonth ? null : index);
  };

  const monthLabel = (() => {
    const year = Math.floor(selectedMonth / 12);
    const name = t(`home.month_${selectedMonth % 12}`);
    return year === Math.floor(currentMonth / 12) ? name : `${name} ${year}`;
  })();

  const handleEditMovement = useCallback((movement: Movement) => {
    setEditingMovement(movement);
  }, []);

  const monthMovements = useMemo(
    () => movements
      .filter((m) => m.type === filter && monthIndexOf(new Date(m.date)) === selectedMonth)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [movements, filter, selectedMonth],
  );

  const filteredMovements = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return monthMovements;
    return monthMovements.filter((m) => {
      const note = (m.note || '').toLowerCase();
      const desc = (m.description || '').toLowerCase();
      const catName = (isSharedMode
        ? getSharedCategoryName(m.category, m.type as MovementType, t)
        : getCategoryName(m.category, m.type as MovementType, t)
      ).toLowerCase();
      // Se busca por el valor crudo (6555.00) y por el formateado que ve el
      // usuario (6.555,00), para que ambas formas de teclearlo funcionen
      const amountRaw = m.amount.toFixed(2);
      const amountShown = formatAmount(m.amount);
      return note.includes(q) || desc.includes(q) || catName.includes(q)
        || amountRaw.includes(q) || amountShown.includes(q);
    });
  }, [monthMovements, searchQuery, isSharedMode, getSharedCategoryName, getCategoryName, t]);

  const monthHuchaMovements = useMemo(
    () => huchaMovements
      .filter((m) => monthIndexOf(new Date(m.date)) === selectedMonth)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [huchaMovements, selectedMonth],
  );

  const sortedRecurring = useMemo(
    () => [...recurringMovements].sort((a, b) => a.recurringDay - b.recurringDay),
    [recurringMovements],
  );

  // Secciones: por día (movimientos y huchas) o una sola (fijos)
  const sections: Section[] = useMemo(() => {
    if (filter === 'recurring') {
      return sortedRecurring.length ? [{ key: 'recurring', data: sortedRecurring }] : [];
    }
    const list = filter === 'hucha'
      ? monthHuchaMovements.map((m) => ({ ...m, type: m.type === 'deposit' ? 'income' : 'expense', _hucha: m }))
      : filteredMovements;
    return groupByDay(list as any[]).map((g) => ({
      key: g.key,
      title: dayLabel(g.date, t, language),
      total: filter === 'hucha' ? undefined : dayTotalLabel(g, currencySymbol),
      data: g.items,
    }));
  }, [filter, sortedRecurring, monthHuchaMovements, filteredMovements, t, language, currencySymbol]);

  // Resumen de la cabecera
  const summary = (() => {
    if (filter === 'recurring') {
      return {
        label: `${t('recurring.net')} ${t('recurring.perMonth')}`,
        value: `${recurringNet >= 0 ? '+' : '-'}${formatAmount(Math.abs(recurringNet))} ${currencySymbol}`,
      };
    }
    if (filter === 'hucha') {
      const net = monthHuchaMovements.reduce((s, m) => s + (m.type === 'deposit' ? m.amount : -m.amount), 0);
      return {
        label: t('home.movementCount', { count: monthHuchaMovements.length }),
        value: `${net > 0 ? '+' : net < 0 ? '-' : ''}${formatAmount(Math.abs(net))} ${currencySymbol}`,
      };
    }
    const total = monthMovements.reduce((s, m) => s + m.amount, 0);
    const sign = total === 0 ? '' : filter === 'income' ? '+' : '-';
    return {
      label: t('home.movementCount', { count: monthMovements.length }),
      value: `${sign}${formatAmount(total)} ${currencySymbol}`,
    };
  })();

  const filters: { key: FilterType; label: string }[] = [
    { key: 'income', label: t('movementsList.income') },
    { key: 'expense', label: t('movementsList.expenses') },
    { key: 'hucha', label: t('movementsList.hucha') },
    { key: 'recurring', label: t('movementsList.fixed') },
  ];

  const handleFilterPress = (key: FilterType) => {
    lightHaptic();
    setFilter(key);
    setSearchQuery('');
  };

  const renderItem = useCallback(({ item }: { item: any }) => {
    if (filter === 'recurring') {
      return (
        <View style={styles.itemPad}>
          <RecurringRow item={item} onDelete={deleteRecurringMovement} onEdit={handleEditRecurring} />
        </View>
      );
    }
    if (filter === 'hucha') {
      return <View style={styles.itemPad}><HuchaMovementRow movement={item._hucha} /></View>;
    }
    return (
      <View style={styles.itemPad}>
        <MovementRow movement={item} onDelete={deleteMovement} onEdit={handleEditMovement} />
      </View>
    );
  }, [filter, deleteRecurringMovement, handleEditRecurring, deleteMovement, handleEditMovement]);

  const renderSectionHeader = useCallback(({ section }: { section: Section }) => (
    section.title ? (
      <View style={[styles.itemPad, { backgroundColor: ui.sheet }]}>
        <GroupHeader label={section.title} total={section.total} />
      </View>
    ) : null
  ), [ui.sheet]);

  const hero = (
    <>
      <HeroTitleBar
        title={t('header.historial')}
        right={filter !== 'recurring' ? (
          <MonthSelector
            label={monthLabel}
            onPrev={() => goToMonth(selectedMonth - 1)}
            onNext={() => goToMonth(selectedMonth + 1)}
            canPrev={selectedMonth > firstMonth}
            canNext={selectedMonth < currentMonth}
          />
        ) : undefined}
      />
      <View style={styles.summary}>
        <Text style={[styles.summaryLabel, { color: ui.onHeroSoft }]} numberOfLines={1}>{summary.label}</Text>
        <Text style={[styles.summaryValue, { color: ui.onHero }]} numberOfLines={1}>{summary.value}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {filters.map((f) => {
          const on = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.chip, { backgroundColor: on ? '#FFFFFF' : 'rgba(255,255,255,0.14)' }]}
              onPress={() => handleFilterPress(f.key)}
              activeOpacity={0.8}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.chipText, { color: on ? ui.hero : 'rgba(255,255,255,0.92)' }]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </>
  );

  // Arriba de la lista, en la hoja: el buscador o el resumen de los fijos
  const sheetTop = (filter === 'income' || filter === 'expense') ? (
    <View style={[styles.search, { backgroundColor: ui.field }]}>
      <Ionicons name="search-outline" size={17} color={dc.textSecondary} />
      <RNTextInput
        style={[styles.searchInput, { color: dc.textPrimary }]}
        placeholder={t('movementsList.searchPlaceholder')}
        placeholderTextColor={dc.textSecondary}
        selectionColor={ui.accent}
        value={searchQuery}
        onChangeText={setSearchQuery}
        returnKeyType="search"
        autoCorrect={false}
      />
      {searchQuery.length > 0 && (
        <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
          <Ionicons name="close-circle" size={17} color={dc.textSecondary} />
        </TouchableOpacity>
      )}
    </View>
  ) : filter === 'recurring' ? (
    // Se muestra siempre, también cuando no hay ninguno, igual que antes
    <View style={[styles.recSummary, { backgroundColor: ui.field }]}>
      <View style={styles.recCol}>
        <Text style={[styles.recLabel, { color: dc.textSecondary }]}>{t('recurring.income')}</Text>
        <Text style={[styles.recValue, { color: ui.incomeText }]} numberOfLines={1}>
          +{formatAmount(recurringIncomeTotal)} {currencySymbol}
        </Text>
      </View>
      <View style={[styles.recSep, { backgroundColor: ui.hair }]} />
      <View style={styles.recCol}>
        <Text style={[styles.recLabel, { color: dc.textSecondary }]}>{t('recurring.expense')}</Text>
        <Text style={[styles.recValue, { color: dc.textPrimary }]} numberOfLines={1}>
          -{formatAmount(recurringExpenseTotal)} {currencySymbol}
        </Text>
      </View>
    </View>
  ) : null;

  const emptyState = filter === 'recurring' ? (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: ui.accentSoft }]}>
        <Ionicons name="repeat" size={28} color={ui.accent} />
      </View>
      <Text style={[styles.emptyText, { color: dc.textPrimary }]}>{t('recurring.noRecurring')}</Text>
      <Text style={[styles.emptySubtext, { color: dc.textSecondary }]}>{t('recurring.noRecurringSubtitle')}</Text>
      <TouchableOpacity
        style={[styles.emptyAction, { backgroundColor: dc.primary }]}
        onPress={() => { lightHaptic(); setShowRecurringModal(true); }}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={16} color="#FFFFFF" />
        <Text style={styles.emptyActionText}>{t('recurring.addFirst')}</Text>
      </TouchableOpacity>
    </View>
  ) : (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: ui.accentSoft }]}>
        <Ionicons name={filter === 'hucha' ? 'cash-outline' : 'search-outline'} size={28} color={ui.accent} />
      </View>
      <Text style={[styles.emptyText, { color: dc.textPrimary }]}>{t('movementsList.noMovements')}</Text>
      {/* En el filtro de huchas, y en meses pasados, la acción no es añadir un movimiento suelto */}
      {filter !== 'hucha' && selectedMonth === currentMonth && (
        <TouchableOpacity
          style={[styles.emptyAction, { backgroundColor: dc.primary }]}
          onPress={() => { lightHaptic(); setShowMovementModal(true); }}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={16} color="#FFFFFF" />
          <Text style={styles.emptyActionText}>{t('movements.add')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View
      style={[styles.container, { backgroundColor: ui.sheet }]}
      // Cualquier toque de la pantalla cierra la fila deslizada. Devuelve false,
      // así que no se queda con el gesto y el toque llega igual a su destino.
      onStartShouldSetResponderCapture={closeOpenSwipeable}
    >
      <AnimatedSectionList
        sections={sections}
        keyExtractor={(item: any) => item.id}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader as any}
        stickySectionHeadersEnabled={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onScrollBeginDrag={closeOpenSwipeable}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={7}
        contentContainerStyle={{ paddingBottom: tabSpace }}
        ListHeaderComponent={
          <>
            <HeroTop onHeight={setHeroHeight}>{hero}</HeroTop>
            <HeroSheetCap />
            {sheetTop ? <View style={styles.sheetTop}>{sheetTop}</View> : null}
          </>
        }
        ListEmptyComponent={emptyState}
      />
      <HeroStatusBar scrollY={scrollY} heroHeight={heroHeight} />

      {isFocused && (
        <>
          <AddMovementModal
            visible={!!editingMovement}
            onDismiss={() => setEditingMovement(null)}
            editingMovement={editingMovement}
          />
          <AddRecurringModal
            visible={showRecurringModal}
            onDismiss={() => {
              setShowRecurringModal(false);
              setEditingRecurring(null);
            }}
            editingRecurring={editingRecurring}
          />
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Cabecera
  summary: { paddingHorizontal: 20, paddingTop: 14 },
  summaryLabel: { fontSize: 13, fontFamily: 'Poppins_400Regular' },
  summaryValue: { fontSize: 32, fontFamily: 'Poppins_700Bold', letterSpacing: -1 },
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 14 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 },
  chipText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },

  // Hoja
  sheetTop: { paddingHorizontal: 20, paddingBottom: 6 },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12, paddingHorizontal: 12, minHeight: 44,
  },
  searchInput: { flex: 1, fontSize: 14.5, fontFamily: 'Poppins_400Regular', paddingVertical: 10 },
  recSummary: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, padding: 14 },
  recCol: { flex: 1 },
  recLabel: { fontSize: 12, fontFamily: 'Poppins_500Medium' },
  recValue: { fontSize: 17, fontFamily: 'Poppins_700Bold', marginTop: 2 },
  recSep: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginHorizontal: 14 },

  itemPad: { paddingHorizontal: 20 },
  rowWrap: { borderRadius: 14 },
  hRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  hIcon: { width: 42, height: 42, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  hInfo: { flex: 1, minWidth: 0 },
  hTitle: { fontSize: 15, fontFamily: 'Poppins_500Medium' },
  hSub: { fontSize: 12.5, fontFamily: 'Poppins_400Regular', marginTop: 1 },
  hAmount: { fontSize: 15, fontFamily: 'Poppins_600SemiBold', flexShrink: 0 },

  emptyState: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyIcon: {
    width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginBottom: 14,
  },
  emptyText: { fontSize: 17, fontFamily: 'Poppins_600SemiBold', textAlign: 'center' },
  emptySubtext: {
    fontSize: 13, fontFamily: 'Poppins_400Regular',
    textAlign: 'center', paddingHorizontal: 12, marginTop: 6,
  },
  emptyAction: {
    marginTop: 16, paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  emptyActionText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: '#FFFFFF' },
});

export default MovementsScreen;
