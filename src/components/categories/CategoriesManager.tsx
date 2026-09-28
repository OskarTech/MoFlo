import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import Icon, { IoniconName } from '../common/Icon';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { useCategoryColors } from '../../hooks/useCategoryColors';
import { useMovementStore } from '../../store/movementStore';
import { MovementType } from '../../types';
import { CATEGORY_ICONS } from '../../constants/categoryIcons';
import { CategoryColorChoice, CategoryColorChoices, categoryColorKey } from '../../utils/categoryColors';
import { withAlpha, isHexColor } from '../../utils/color';
import { warningHaptic, lightHaptic } from '../../utils/haptics';
import SwipeableRow, { closeOpenSwipeable } from '../common/SwipeableRow';
import BottomSheet, { SheetButton, SegmentedControl, FilledInput, SheetLabel } from '../common/BottomSheet';
import { ColorPickerPanel, RainbowSwatch } from '../common/ColorPicker';
import { HeroScrollScreen } from '../layout/HeroScreen';
import { HeroTitleBar } from '../layout/HeroBar';
import { GroupHeader } from '../layout/SheetSection';
import AddHint from '../navigation/AddHint';

const outline = (icon: string) => `${icon}-outline` as IoniconName;

// Una categoría tal como la dan los stores para elegirla
export type CategoryItem = { id: string; name: string; icon: string; isCustom: boolean };

/** Lo que cada pantalla (cuenta individual o compartida) hace con sus categorías */
export interface CategoriesApi {
  getForType: (type: MovementType) => CategoryItem[];
  add: (data: { name: string; icon: string; type: MovementType }) => Promise<string | undefined>;
  update: (id: string, updates: { name: string; icon: string }) => Promise<void>;
  remove: (id: string) => Promise<void>;
  hideBase: (id: string, type: MovementType) => Promise<void>;
  setColor: (id: string, type: MovementType, choice: CategoryColorChoice | null) => Promise<void>;
  choices: CategoryColorChoices;
}

type Editing =
  | { kind: 'create'; type: MovementType }
  | { kind: 'edit'; category: CategoryItem; type: MovementType; isBase: boolean };

// Iconos en tres filas que se deslizan en horizontal
const ICON_SIZE = 48;
const ICON_GAP = 8;

// Lo guardado, solo si es válido: la posición de un color de la paleta o un color libre
const validChoice = (value: unknown): CategoryColorChoice | null =>
  (typeof value === 'number' && value >= 0) || isHexColor(value) ? value : null;

const CategorySheet = ({
  editing, visible, onDismiss, api,
}: {
  editing: Editing | null;
  visible: boolean;
  onDismiss: () => void;
  api: CategoriesApi;
}) => {
  const { t } = useTranslation();
  const { colors: dc, ui, categoryColors: palette } = useTheme();
  const catColors = useCategoryColors();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('ellipsis-horizontal');
  const [type, setType] = useState<MovementType>('expense');
  // null = automático; un número = un color de la paleta; #RRGGBB = color libre
  const [choice, setChoice] = useState<CategoryColorChoice | null>(null);
  // Con el selector libre abierto en la misma ventana
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState('#E8735A');
  const isSavingRef = useRef(false);
  const iconsRef = useRef<ScrollView>(null);

  // La fila de iconos va en columnas de tres: se desplaza hasta la del elegido
  const scrollToIcon = (name: string) => {
    const index = CATEGORY_ICONS.indexOf(name as IoniconName);
    if (index < 0) return;
    setTimeout(() => {
      iconsRef.current?.scrollTo({ x: Math.max(0, Math.floor(index / 3) * (ICON_SIZE + ICON_GAP) - 40), animated: false });
    }, 50);
  };

  useEffect(() => {
    if (!visible || !editing) return;
    isSavingRef.current = false;
    setPicking(false);
    if (editing.kind === 'edit') {
      const c = editing.category;
      setName(editing.isBase ? t(`movements.categories.${c.id}`) : c.name);
      setIcon(c.icon);
      setType(editing.type);
      setChoice(validChoice(api.choices[categoryColorKey(c.id, editing.type)]));
      scrollToIcon(c.icon);
    } else {
      setName('');
      setIcon('ellipsis-horizontal');
      setType(editing.type);
      setChoice(null);
      setTimeout(() => iconsRef.current?.scrollTo({ x: 0, animated: false }), 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir
  }, [visible, editing]);

  // Al volver del selector de color la fila de iconos se vuelve a dibujar:
  // otra vez con el elegido a la vista
  useEffect(() => {
    if (visible && !picking) scrollToIcon(icon);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al volver
  }, [picking]);

  if (!editing) return null;

  const isBase = editing.kind === 'edit' && editing.isBase;
  const existingId = editing.kind === 'edit' ? editing.category.id : null;
  const options = type === 'income' ? palette.income : palette.expense;
  const autoColor = catColors.autoColor(existingId, type);
  const color = choice === null
    ? autoColor
    : typeof choice === 'string' ? choice : options[choice % options.length];
  const isCustom = typeof choice === 'string';

  const handleTypeChange = (tp: MovementType) => {
    lightHaptic();
    setType(tp);
    // Los colores de gasto y de ingreso son distintos
    if (typeof choice === 'number') setChoice(null);
  };

  const openPicker = () => {
    setDraft(color);
    setPicking(true);
  };

  const handleSave = () => {
    if (isSavingRef.current) return;
    if (!isBase && !name.trim()) return;
    isSavingRef.current = true;
    lightHaptic();

    let promise: Promise<unknown>;
    if (editing.kind === 'create') {
      promise = api.add({ name: name.trim(), icon, type }).then((id) => {
        if (id && choice !== null) return api.setColor(id, type, choice);
      });
    } else {
      const c = editing.category;
      const tasks: Promise<unknown>[] = [];
      if (!isBase && (name.trim() !== c.name || icon !== c.icon)) {
        tasks.push(api.update(c.id, { name: name.trim(), icon }));
      }
      const before = validChoice(api.choices[categoryColorKey(c.id, editing.type)]);
      if (before !== choice) {
        tasks.push(api.setColor(c.id, editing.type, choice));
      }
      promise = Promise.all(tasks);
    }
    promise
      .catch((e) => console.error('Error saving category:', e))
      .finally(() => { isSavingRef.current = false; });
    onDismiss();
  };

  if (picking) {
    return (
      <BottomSheet
        visible={visible}
        onClose={onDismiss}
        onBack={() => setPicking(false)}
        title={t('common.colorPickerTitle')}
        subtitle={t('common.colorPickerHint')}
        scrollable={false}
        footer={(
          <SheetButton
            label={t('common.colorPickerUse')}
            onPress={() => { setChoice(draft); setPicking(false); }}
          />
        )}
      >
        <ColorPickerPanel value={draft} onChange={setDraft} />
      </BottomSheet>
    );
  }

  const title = editing.kind === 'edit' ? t('categories.editCategory') : t('categories.addCategory');

  return (
    <BottomSheet
      visible={visible}
      onClose={onDismiss}
      title={title}
      footer={(
        <SheetButton
          label={t('movements.save')}
          onPress={handleSave}
          disabled={!isBase && !name.trim()}
        />
      )}
    >
      {/* Así se verá */}
      <View style={styles.preview}>
        <View style={[styles.previewIcon, { backgroundColor: withAlpha(color, 0.16) }]}>
          <Icon name={outline(icon)} size={32} color={color} />
        </View>
        <Text style={[styles.previewName, { color: name.trim() ? dc.textPrimary : dc.textSecondary }]} numberOfLines={1}>
          {name.trim() || t('categories.namePlaceholder')}
        </Text>
      </View>

      {editing.kind === 'create' && (
        <SegmentedControl
          options={[
            { key: 'expense', label: t('movements.expense'), icon: 'arrow-up', activeColor: ui.expenseText },
            { key: 'income', label: t('movements.income'), icon: 'arrow-down', activeColor: ui.incomeText },
          ]}
          value={type}
          onChange={handleTypeChange}
          style={styles.segment}
        />
      )}

      {!isBase && (
        <>
          <SheetLabel>{t('categories.name')}</SheetLabel>
          <FilledInput
            icon="create-outline"
            value={name}
            onChangeText={setName}
            placeholder={t('categories.namePlaceholder')}
            maxLength={30}
          />

          <SheetLabel>{t('categories.icon')}</SheetLabel>
          <ScrollView
            ref={iconsRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={styles.bleed}
            contentContainerStyle={styles.bleedContent}
          >
            <View style={styles.iconsGrid}>
              {CATEGORY_ICONS.map((ic) => {
                const on = ic === icon;
                return (
                  <TouchableOpacity
                    key={ic}
                    style={[styles.iconOption, { backgroundColor: on ? color : ui.field }]}
                    onPress={() => setIcon(ic)}
                    activeOpacity={0.75}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                  >
                    <Icon name={outline(ic)} size={22} color={on ? '#FFFFFF' : dc.textSecondary} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </>
      )}

      <SheetLabel>{t('categories.color')}</SheetLabel>
      <View style={styles.colors}>
        <TouchableOpacity
          style={[
            styles.colorAuto,
            { borderColor: choice === null ? dc.textPrimary : ui.hair2 },
          ]}
          onPress={() => setChoice(null)}
          activeOpacity={0.75}
          accessibilityRole="radio"
          accessibilityState={{ selected: choice === null }}
        >
          <View style={[styles.colorAutoDot, { backgroundColor: autoColor }]} />
          <Text style={[styles.colorAutoText, { color: dc.textPrimary }]}>{t('categories.colorAuto')}</Text>
        </TouchableOpacity>
        {options.map((c, i) => {
          const on = choice === i;
          return (
            <TouchableOpacity
              key={`${c}_${i}`}
              style={[styles.colorRing, { borderColor: on ? dc.textPrimary : 'transparent' }]}
              onPress={() => setChoice(i)}
              activeOpacity={0.75}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
            >
              <View style={[styles.colorDot, { backgroundColor: c }]}>
                {on && <Icon name="checkmark" size={16} color="#FFFFFF" />}
              </View>
            </TouchableOpacity>
          );
        })}
        {/* Color libre: abre el panel para elegirlo con el dedo */}
        <TouchableOpacity
          style={[styles.colorRing, { borderColor: isCustom ? dc.textPrimary : 'transparent' }]}
          onPress={openPicker}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={t('common.customColor')}
        >
          {isCustom ? (
            <View style={[styles.colorDot, { backgroundColor: choice as string }]}>
              <Icon name="checkmark" size={16} color="#FFFFFF" />
            </View>
          ) : (
            <View style={styles.colorDot}>
              <RainbowSwatch size={30} />
              <View style={styles.rainbowIcon}>
                <Icon name="add" size={18} color="#FFFFFF" />
              </View>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
};

/**
 * Pantalla de categorías, igual para la cuenta individual y la compartida:
 * cabecera con Gastos / Ingresos y la lista con el color de cada una. Deslizar
 * una fila permite cambiarle el color (y el nombre y el icono si es propia) o
 * quitarla.
 */
const CategoriesManager = ({
  api, subtitle, addRequested, onAddRequestHandled,
}: {
  api: CategoriesApi;
  subtitle: string;
  /** El + de la barra pide una categoría nueva */
  addRequested: boolean;
  onAddRequestHandled: () => void;
}) => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { colors: dc, ui } = useTheme();
  const catColors = useCategoryColors();
  // Los de la cuenta activa: en compartida, los de la cuenta
  const recurringMovements = useMovementStore((s) => s.recurringMovements);
  const [activeType, setActiveType] = useState<MovementType>('expense');
  const [editing, setEditing] = useState<Editing | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);

  const openSheet = (e: Editing) => {
    setEditing(e);
    setSheetVisible(true);
  };

  useEffect(() => {
    if (!addRequested) return;
    onAddRequestHandled();
    openSheet({ kind: 'create', type: activeType });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addRequested]);

  const all = api.getForType(activeType);
  const baseCats = all.filter(c => !c.isCustom);
  const customCats = all.filter(c => c.isCustom);

  // Los recurrentes activos siguen usando la categoría aunque se borre: se avisa
  // en la confirmación de cuántos la usan
  const deleteMessage = (id: string, name: string) => {
    const count = recurringMovements
      .filter(r => r.isActive && r.category === id && r.type === activeType).length;
    return count > 0 ? `${name}\n\n${t('categories.usedByRecurring', { count })}` : name;
  };

  const confirmDelete = (id: string, name: string, onConfirm: () => void) => {
    warningHaptic();
    Alert.alert(
      t('categories.deleteConfirm'),
      deleteMessage(id, name),
      [
        { text: t('movements.cancel'), style: 'cancel' },
        { text: t('categories.delete'), style: 'destructive', onPress: onConfirm },
      ]
    );
  };

  const colorOf = (id: string) => (activeType === 'income' ? catColors.incomeOf(id) : catColors.expense(id));

  const renderRow = (cat: CategoryItem, isBase: boolean) => {
    const name = isBase ? t(`movements.categories.${cat.id}`) : cat.name;
    const color = colorOf(cat.id);
    return (
      <SwipeableRow
        key={cat.id}
        borderRadius={14}
        actions={[
          {
            icon: 'pencil',
            background: dc.primary,
            onPress: () => openSheet({ kind: 'edit', category: cat, type: activeType, isBase }),
          },
          {
            icon: 'trash',
            background: ui.expenseText,
            onPress: () => confirmDelete(cat.id, name, () => {
              (isBase ? api.hideBase(cat.id, activeType) : api.remove(cat.id))
                .catch((e) => console.error('Error deleting category:', e));
            }),
          },
        ]}
      >
        {/* Con fondo propio: si no, los botones de detrás se verían sin deslizar */}
        <View style={[styles.row, { backgroundColor: ui.sheet }]}>
          <View style={[styles.rowIcon, { backgroundColor: withAlpha(color, 0.16) }]}>
            <Icon name={outline(cat.icon)} size={20} color={color} />
          </View>
          <Text style={[styles.rowName, { color: dc.textPrimary }]} numberOfLines={1}>{name}</Text>
        </View>
      </SwipeableRow>
    );
  };

  const hero = (
    <>
      <HeroTitleBar title={t('categories.title')} onBack={() => navigation.goBack()} />
      <Text style={[styles.heroSubtitle, { color: ui.onHeroSoft }]}>{subtitle}</Text>
      <View style={styles.chips}>
        {(['expense', 'income'] as MovementType[]).map((tp) => {
          const on = tp === activeType;
          return (
            <TouchableOpacity
              key={tp}
              style={[styles.chip, { backgroundColor: on ? '#FFFFFF' : 'rgba(255,255,255,0.14)' }]}
              onPress={() => { closeOpenSwipeable(); setActiveType(tp); }}
              activeOpacity={0.8}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.chipText, { color: on ? ui.hero : 'rgba(255,255,255,0.92)' }]}>
                {t(tp === 'income' ? 'home.income' : 'home.expenses')}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );

  return (
    <View
      style={styles.container}
      // Cualquier toque de la pantalla cierra la fila deslizada. Devuelve false,
      // así que no se queda con el gesto y el toque llega igual a su destino.
      onStartShouldSetResponderCapture={closeOpenSwipeable}
    >
      <HeroScrollScreen hero={hero} onScrollBeginDrag={closeOpenSwipeable}>
        <View style={[styles.hint, { backgroundColor: ui.field }]}>
          <Icon name="hand-left-outline" size={16} color={dc.textSecondary} />
          <Text style={[styles.hintText, { color: dc.textSecondary }]}>{t('categories.swipeHint')}</Text>
        </View>

        <View style={styles.list}>
          {baseCats.length > 0 && (
            <>
              <GroupHeader label={t('categories.default')} first />
              {baseCats.map((cat) => renderRow(cat, true))}
            </>
          )}

          <GroupHeader label={t('categories.custom')} first={baseCats.length === 0} />
          {customCats.length === 0 && (
            <Text style={[styles.empty, { color: dc.textSecondary }]}>{t('categories.noCustom')}</Text>
          )}
          {customCats.map((cat) => renderRow(cat, false))}
        </View>

        {/* Se crean con el + de la barra: la flecha lo señala */}
        <AddHint label={t('categories.addHint')} style={styles.addHint} />
      </HeroScrollScreen>

      <CategorySheet
        editing={editing}
        visible={sheetVisible}
        onDismiss={() => setSheetVisible(false)}
        api={api}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  heroSubtitle: { fontSize: 13, fontFamily: 'Poppins_400Regular', paddingHorizontal: 20, paddingTop: 10 },
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 14 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 },
  chipText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },

  hint: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 20, marginBottom: 6, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 12,
  },
  hintText: { flex: 1, fontSize: 12.5, fontFamily: 'Poppins_400Regular' },
  list: { paddingHorizontal: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, borderRadius: 14 },
  rowIcon: { width: 42, height: 42, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  rowName: { flex: 1, fontSize: 15, fontFamily: 'Poppins_500Medium' },
  empty: { fontSize: 13, fontFamily: 'Poppins_400Regular', paddingVertical: 8 },
  // Abajo del todo aunque la lista sea corta, para que la flecha acabe sobre el +
  addHint: { marginTop: 'auto', paddingTop: 16 },

  preview: { alignItems: 'center', gap: 8, paddingBottom: 14 },
  previewIcon: { width: 66, height: 66, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },
  previewName: { fontSize: 18, fontFamily: 'Poppins_700Bold', maxWidth: '90%' },
  segment: { marginBottom: 2 },
  bleed: { marginHorizontal: -20 },
  bleedContent: { paddingHorizontal: 20 },
  iconsGrid: {
    flexDirection: 'column', flexWrap: 'wrap', alignContent: 'flex-start',
    height: ICON_SIZE * 3 + ICON_GAP * 2, gap: ICON_GAP,
  },
  iconOption: { width: ICON_SIZE, height: ICON_SIZE, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  colors: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  colorAuto: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    height: 40, paddingLeft: 6, paddingRight: 12, borderRadius: 20, borderWidth: 2,
  },
  colorAutoDot: { width: 24, height: 24, borderRadius: 12 },
  colorAutoText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
  colorRing: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  colorDot: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  rainbowIcon: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
});

export default CategoriesManager;
