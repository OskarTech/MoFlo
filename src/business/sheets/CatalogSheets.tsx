import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import Icon from '../../components/common/Icon';
import BottomSheet, {
  FilledInput, SegmentedControl, SheetButton, SheetLabel,
} from '../../components/common/BottomSheet';
import { useTheme } from '../../hooks/useTheme';
import { successHaptic } from '../../utils/haptics';
import { useBusinessStore } from '../store/businessStore';
import { cents, newId, nextOrder, orderedItems } from '../logic/basics';
import { ProductSize } from '../types';
import {
  AddLink, AmountBox, Chip, ChipRow, FieldRow, Note, SettingsSwitch,
} from '../ui/kit';

/**
 * La carta: productos (con un precio o con tamaños), extras con su precio y
 * categorías. Lo que ya no se vende se archiva: deja de salir al apuntar y
 * sigue en lo vendido antes. Los pedidos guardan su propia copia del precio,
 * así que cambiar la carta no cambia lo ya vendido.
 */

type SizeDraft = { id: string; name: string; price: number | null; archived?: boolean };

export const ProductSheet = ({
  visible, productId, categoryId, onClose,
}: { visible: boolean; productId?: string; categoryId?: string; onClose: () => void }) => {
  const { t } = useTranslation();
  const { colors: dc } = useTheme();
  const catalog = useBusinessStore((s) => s.catalog);
  const editing = productId ? catalog?.products?.[productId] : undefined;
  const categories = useMemo(() => orderedItems(catalog?.categories), [catalog]);

  const [name, setName] = useState('');
  const [catId, setCatId] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [mode, setMode] = useState<'single' | 'sizes'>('single');
  const [price, setPrice] = useState<number | null>(null);
  const [sizes, setSizes] = useState<SizeDraft[]>([]);
  const [selling, setSelling] = useState(true);

  useEffect(() => {
    if (!visible) return;
    setName(editing?.name ?? '');
    setCatId(editing?.categoryId ?? categoryId ?? categories[0]?.id ?? null);
    setNewCategory('');
    setAddingCategory(categories.length === 0);
    const existingSizes = orderedItems(editing?.sizes, { withArchived: true });
    setMode(existingSizes.some((s) => !s.archived) ? 'sizes' : 'single');
    setPrice(editing?.price ?? null);
    setSizes(existingSizes.length
      ? existingSizes.map((s) => ({ id: s.id, name: s.name, price: s.price, archived: s.archived }))
      : [{ id: newId('s_'), name: '', price: null }, { id: newId('s_'), name: '', price: null }]);
    setSelling(!editing?.archived);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- al abrir
  }, [visible, productId]);

  const liveSizes = sizes.filter((s) => !s.archived);
  const sizesValid = liveSizes.length > 0 && liveSizes.every((s) => s.name.trim() && (s.price ?? 0) > 0);
  const hasCategory = !!catId || !!newCategory.trim();
  const valid = !!name.trim() && hasCategory && (mode === 'single' ? (price ?? 0) > 0 : sizesValid);

  const save = async () => {
    if (!valid || !catalog) return;
    const store = useBusinessStore.getState();
    let category = catId;
    if (addingCategory && newCategory.trim()) {
      category = await store.saveCatalogItem('categories', null, {
        name: newCategory.trim(), order: nextOrder(useBusinessStore.getState().catalog?.categories),
      });
    }
    if (!category) return;
    const sizeRecord: Record<string, ProductSize> = {};
    if (mode === 'sizes') {
      let order = 1;
      for (const s of sizes) {
        if (!s.name.trim() && !s.archived) continue;
        sizeRecord[s.id] = {
          name: s.name.trim(), price: cents(s.price ?? 0), order: order++,
          ...(s.archived ? { archived: true } : {}),
        };
      }
    }
    await store.saveCatalogItem('products', productId ?? null, {
      name: name.trim(),
      categoryId: category,
      order: editing?.order ?? nextOrder(useBusinessStore.getState().catalog?.products),
      ...(mode === 'single' ? { price: cents(price ?? 0) } : { sizes: sizeRecord }),
      ...(selling ? {} : { archived: true }),
    });
    successHaptic();
    onClose();
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={editing ? editing.name : t('business.catalog.newProduct')}
      maxHeight={0.94}
      dismissKeyboardOnTap
      footer={<SheetButton label={t('business.common.save')} icon="checkmark" disabled={!valid} onPress={save} />}
    >
      <SheetLabel style={styles.firstLabel}>{t('business.catalog.name')}</SheetLabel>
      <FilledInput value={name} onChangeText={setName} placeholder={t('business.catalog.namePlaceholder')} maxLength={50} />

      <SheetLabel>{t('business.catalog.category')}</SheetLabel>
      <ChipRow>
        {categories.map((c) => (
          <Chip key={c.id} label={c.name} selected={!addingCategory && c.id === catId} onPress={() => { setCatId(c.id); setAddingCategory(false); }} />
        ))}
        <Chip label={t('business.catalog.newCategory')} icon="add" selected={addingCategory} onPress={() => setAddingCategory(!addingCategory)} />
      </ChipRow>
      {addingCategory && (
        <FilledInput
          value={newCategory}
          onChangeText={setNewCategory}
          placeholder={t('business.catalog.categoryPlaceholder')}
          containerStyle={styles.gapTop}
          maxLength={30}
        />
      )}

      <SheetLabel>{t('business.catalog.price')}</SheetLabel>
      <SegmentedControl
        options={[
          { key: 'single', label: t('business.catalog.singlePrice') },
          { key: 'sizes', label: t('business.catalog.withSizes') },
        ]}
        value={mode}
        onChange={setMode}
      />
      {mode === 'single' ? (
        <FieldRow
          title={t('business.catalog.price')}
          style={styles.gapTop}
          right={<AmountBox value={price} onChange={setPrice} accessibilityLabel={t('business.catalog.price')} />}
        />
      ) : (
        <View style={styles.gapTop}>
          {sizes.map((s, i) => (s.archived ? null : (
            <View key={s.id} style={styles.sizeRow}>
              <FilledInput
                value={s.name}
                onChangeText={(v) => setSizes((prev) => prev.map((x) => (x.id === s.id ? { ...x, name: v } : x)))}
                placeholder={t(i === 0 ? 'business.catalog.sizePlaceholder1' : 'business.catalog.sizePlaceholder2')}
                containerStyle={styles.flex}
                maxLength={20}
              />
              <AmountBox
                value={s.price}
                onChange={(v) => setSizes((prev) => prev.map((x) => (x.id === s.id ? { ...x, price: v } : x)))}
                width={96}
                accessibilityLabel={`${t('business.catalog.price')} ${s.name}`}
              />
              <TouchableOpacity
                onPress={() => setSizes((prev) => (
                  // Las que ya estaban se archivan (siguen en lo vendido); las nuevas, fuera
                  editing?.sizes?.[s.id]
                    ? prev.map((x) => (x.id === s.id ? { ...x, archived: true } : x))
                    : prev.filter((x) => x.id !== s.id)
                ))}
                hitSlop={8}
                accessibilityLabel={t('business.common.delete')}
              >
                <Icon name="close-circle" size={22} color={dc.textSecondary} />
              </TouchableOpacity>
            </View>
          )))}
          <AddLink label={t('business.catalog.addSize')} onPress={() => setSizes((prev) => [...prev, { id: newId('s_'), name: '', price: null }])} />
        </View>
      )}

      {editing && (
        <FieldRow
          title={t('business.catalog.selling')}
          subtitle={t('business.catalog.sellingHint')}
          style={styles.gapTop}
          right={<SettingsSwitch value={selling} onChange={setSelling} label={t('business.catalog.selling')} />}
        />
      )}
      <Note text={t('business.catalog.priceCopyNote')} style={styles.note} />
    </BottomSheet>
  );
};

export const ExtraSheet = ({ visible, extraId, onClose }: { visible: boolean; extraId?: string; onClose: () => void }) => {
  const { t } = useTranslation();
  const catalog = useBusinessStore((s) => s.catalog);
  const editing = extraId ? catalog?.extras?.[extraId] : undefined;
  const categories = useMemo(() => orderedItems(catalog?.categories), [catalog]);

  const [name, setName] = useState('');
  const [price, setPrice] = useState<number | null>(null);
  const [cats, setCats] = useState<string[]>([]);
  const [selling, setSelling] = useState(true);

  useEffect(() => {
    if (!visible) return;
    setName(editing?.name ?? '');
    setPrice(editing?.price ?? null);
    setCats(editing?.categoryIds ?? []);
    setSelling(!editing?.archived);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- al abrir
  }, [visible, extraId]);

  const valid = !!name.trim() && (price ?? 0) > 0;

  const save = async () => {
    if (!valid) return;
    await useBusinessStore.getState().saveCatalogItem('extras', extraId ?? null, {
      name: name.trim(),
      price: cents(price ?? 0),
      order: editing?.order ?? nextOrder(catalog?.extras),
      ...(cats.length ? { categoryIds: cats } : {}),
      ...(selling ? {} : { archived: true }),
    });
    successHaptic();
    onClose();
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={editing ? editing.name : t('business.catalog.newExtra')}
      subtitle={t('business.catalog.extraHint')}
      dismissKeyboardOnTap
      footer={<SheetButton label={t('business.common.save')} icon="checkmark" disabled={!valid} onPress={save} />}
    >
      <SheetLabel style={styles.firstLabel}>{t('business.catalog.name')}</SheetLabel>
      <FilledInput value={name} onChangeText={setName} placeholder={t('business.catalog.extraPlaceholder')} maxLength={40} />
      <FieldRow
        title={t('business.catalog.extraPrice')}
        style={styles.gapTop}
        right={<AmountBox value={price} onChange={setPrice} accessibilityLabel={t('business.catalog.extraPrice')} />}
      />
      {categories.length > 0 && (
        <>
          <SheetLabel>{t('business.catalog.extraFor')}</SheetLabel>
          <ChipRow>
            <Chip label={t('business.catalog.allCategories')} selected={cats.length === 0} onPress={() => setCats([])} />
            {categories.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                selected={cats.includes(c.id)}
                onPress={() => setCats((prev) => (prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id]))}
              />
            ))}
          </ChipRow>
        </>
      )}
      {editing && (
        <FieldRow
          title={t('business.catalog.selling')}
          subtitle={t('business.catalog.sellingHint')}
          style={styles.gapTop}
          right={<SettingsSwitch value={selling} onChange={setSelling} label={t('business.catalog.selling')} />}
        />
      )}
    </BottomSheet>
  );
};

export const CategorySheet = ({ visible, categoryId, onClose }: { visible: boolean; categoryId?: string; onClose: () => void }) => {
  const { t } = useTranslation();
  const catalog = useBusinessStore((s) => s.catalog);
  const editing = categoryId ? catalog?.categories?.[categoryId] : undefined;
  const [name, setName] = useState('');
  const [inUse, setInUse] = useState(true);

  useEffect(() => {
    if (!visible) return;
    setName(editing?.name ?? '');
    setInUse(!editing?.archived);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- al abrir
  }, [visible, categoryId]);

  const save = async () => {
    if (!name.trim()) return;
    await useBusinessStore.getState().saveCatalogItem('categories', categoryId ?? null, {
      name: name.trim(),
      order: editing?.order ?? nextOrder(catalog?.categories),
      ...(inUse ? {} : { archived: true }),
    });
    successHaptic();
    onClose();
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={editing ? editing.name : t('business.catalog.newCategoryTitle')}
      dismissKeyboardOnTap
      footer={<SheetButton label={t('business.common.save')} icon="checkmark" disabled={!name.trim()} onPress={save} />}
    >
      <SheetLabel style={styles.firstLabel}>{t('business.catalog.name')}</SheetLabel>
      <FilledInput value={name} onChangeText={setName} placeholder={t('business.catalog.categoryPlaceholder')} maxLength={30} />
      {editing && (
        <FieldRow
          title={t('business.catalog.inUse')}
          subtitle={t('business.catalog.inUseHint')}
          style={styles.gapTop}
          right={<SettingsSwitch value={inUse} onChange={setInUse} label={t('business.catalog.inUse')} />}
        />
      )}
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  firstLabel: { marginTop: 0 },
  gapTop: { marginTop: 10 },
  flex: { flex: 1 },
  sizeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  note: { marginTop: 16 },
});
