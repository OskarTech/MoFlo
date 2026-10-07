import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import Icon from '../../components/common/Icon';
import BottomSheet, { FilledInput, SheetButton, SheetLabel } from '../../components/common/BottomSheet';
import { useTheme } from '../../hooks/useTheme';
import { lightHaptic, successHaptic, warningHaptic } from '../../utils/haptics';
import { useBusinessStore } from '../store/businessStore';
import { cents, newId, orderedItems } from '../logic/basics';
import { extrasForProduct, hasSizes, lineName, lineTotal, orderTotal, productPrice } from '../logic/orders';
import { OrderExtra, OrderLine, Product } from '../types';
import { AddLink, AmountBox, Chip, ChipRow, EmptyNote, useMoney } from '../ui/kit';

// La forma de cobro del último pedido: la del siguiente, de entrada
let lastChannelId: string | null = null;

type View_ =
  | { kind: 'main' }
  | { kind: 'product'; productId: string }
  | { kind: 'extras'; lineKey: string }
  | { kind: 'manual' };

/** Mismo producto, tamaño y extras: se suma a la línea que ya hay */
const lineKeyOf = (productId: string | null, sizeId: string | null, extras: OrderExtra[]) =>
  `${productId ?? 'm'}|${sizeId ?? ''}|${extras.map((e) => `${e.extraId ?? e.name}:${e.price}`).sort().join(',')}`;

/**
 * Nuevo pedido (pedido a pedido): se toca el producto (y su tamaño), se le
 * ponen extras con su precio si hace falta, se elige cómo paga y el total sale
 * solo. Lo que no está en la carta se escribe a mano.
 */
const OrderSheet = ({ visible, orderId, onClose }: { visible: boolean; orderId?: string; onClose: () => void }) => {
  const { t } = useTranslation();
  const { colors: dc, ui } = useTheme();
  const { money } = useMoney();
  const catalog = useBusinessStore((s) => s.catalog);
  const config = useBusinessStore((s) => s.config);
  const editing = useBusinessStore((s) => (orderId ? s.orders[orderId] : undefined));

  const categories = useMemo(() => orderedItems(catalog?.categories), [catalog]);
  const channels = useMemo(() => orderedItems(config?.channels), [config]);

  const [tab, setTab] = useState<string | null>(null);
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [channelId, setChannelId] = useState<string>('');
  const [note, setNote] = useState('');
  const [view, setView] = useState<View_>({ kind: 'main' });
  const [saving, setSaving] = useState(false);

  // Producto elegido (tamaño, extras y cantidad antes de añadirlo)
  const [sizeId, setSizeId] = useState<string | null>(null);
  const [picked, setPicked] = useState<OrderExtra[]>([]);
  const [qty, setQty] = useState(1);
  // Extra o línea a mano
  const [manualName, setManualName] = useState('');
  const [manualPrice, setManualPrice] = useState<number | null>(null);

  useEffect(() => {
    if (!visible) return;
    setView({ kind: 'main' });
    setTab((prev) => (prev && categories.some((c) => c.id === prev) ? prev : categories[0]?.id ?? null));
    if (editing) {
      setLines(editing.lines.map((l) => ({ ...l })));
      setChannelId(editing.channelId);
      setNote(editing.note ?? '');
    } else {
      setLines([]);
      setNote('');
      setChannelId(
        lastChannelId && channels.some((c) => c.id === lastChannelId) ? lastChannelId : channels[0]?.id ?? '',
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- al abrir
  }, [visible, orderId]);

  const products = useMemo(
    () => orderedItems(catalog?.products).filter((p) => !tab || p.categoryId === tab),
    [catalog, tab],
  );

  const addLine = (line: Omit<OrderLine, 'key'>) => {
    lightHaptic();
    const key = line.productId ? lineKeyOf(line.productId, line.sizeId ?? null, line.extras ?? []) : newId('m');
    setLines((prev) => {
      const same = prev.find((l) => l.key === key);
      if (same) return prev.map((l) => (l.key === key ? { ...l, qty: l.qty + line.qty } : l));
      return [...prev, { ...line, key }];
    });
  };

  const tapProduct = (product: Product & { id: string }) => {
    if (!hasSizes(product)) {
      // Sin tamaños: al pedido directamente. Los extras, desde la línea
      addLine({
        productId: product.id, categoryId: product.categoryId, name: product.name,
        unitPrice: productPrice(product), qty: 1, extras: [],
      });
      return;
    }
    const sizes = orderedItems(product.sizes);
    setSizeId(sizes[0]?.id ?? null);
    setPicked([]);
    setQty(1);
    setManualName('');
    setManualPrice(null);
    setView({ kind: 'product', productId: product.id });
  };

  const changeQty = (key: string, delta: number) => {
    lightHaptic();
    setLines((prev) => prev
      .map((l) => (l.key === key ? { ...l, qty: l.qty + delta } : l))
      .filter((l) => l.qty > 0));
  };

  const total = orderTotal(lines);

  const save = async () => {
    if (!lines.length || saving) return;
    if (!channelId) return;
    setSaving(true);
    try {
      const result = await useBusinessStore.getState().saveOrder({ id: editing?.id, lines, channelId, note });
      if (result === 'dayClosed') {
        warningHaptic();
        Alert.alert(t('business.order.dayClosedTitle'), t('business.order.dayClosedBody'));
        return;
      }
      lastChannelId = channelId;
      successHaptic();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const voidOrder = () => {
    if (!editing) return;
    Alert.alert(t('business.order.voidTitle'), t('business.order.voidBody'), [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('business.order.void'),
        style: 'destructive',
        onPress: async () => {
          const result = await useBusinessStore.getState().voidOrder(editing.id);
          if (result === 'dayClosed') {
            Alert.alert(t('business.order.dayClosedTitle'), t('business.order.dayClosedBody'));
            return;
          }
          warningHaptic();
          onClose();
        },
      },
    ]);
  };

  // ── Vistas ─────────────────────────────────────────────────────

  const extrasPicker = (
    available: { id: string; name: string; price: number }[],
    chosen: OrderExtra[],
    toggle: (extra: OrderExtra) => void,
  ) => (
    <>
      {available.length > 0 ? (
        <ChipRow>
          {available.map((extra) => {
            const on = chosen.some((c) => c.extraId === extra.id);
            return (
              <Chip
                key={extra.id}
                label={`${extra.name} +${money(extra.price)}`}
                selected={on}
                onPress={() => toggle({ extraId: extra.id, name: extra.name, price: extra.price })}
              />
            );
          })}
        </ChipRow>
      ) : (
        <EmptyNote text={t('business.order.noExtras')} />
      )}
      {chosen.filter((c) => !c.extraId).length > 0 && (
        <ChipRow style={styles.manualExtras}>
          {chosen.filter((c) => !c.extraId).map((c) => (
            <Chip key={c.name} label={`${c.name} +${money(c.price)}`} selected onPress={() => toggle(c)} />
          ))}
        </ChipRow>
      )}
      <SheetLabel>{t('business.order.manualExtra')}</SheetLabel>
      <View style={styles.manualRow}>
        <FilledInput
          value={manualName}
          onChangeText={setManualName}
          placeholder={t('business.order.manualExtraPlaceholder')}
          containerStyle={styles.manualName}
          maxLength={40}
        />
        <AmountBox value={manualPrice} onChange={setManualPrice} width={96} accessibilityLabel={t('business.order.price')} />
        <TouchableOpacity
          style={[styles.addSmall, { backgroundColor: dc.primary }, !(manualName.trim() && manualPrice) && styles.disabled]}
          disabled={!(manualName.trim() && manualPrice)}
          onPress={() => {
            toggle({ extraId: null, name: manualName.trim(), price: cents(manualPrice ?? 0) });
            setManualName('');
            setManualPrice(null);
          }}
          accessibilityRole="button"
          accessibilityLabel={t('common.add')}
        >
          <Icon name="add" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </>
  );

  const toggleIn = (list: OrderExtra[], extra: OrderExtra) => {
    const key = (e: OrderExtra) => e.extraId ?? `m:${e.name}`;
    return list.some((e) => key(e) === key(extra)) ? list.filter((e) => key(e) !== key(extra)) : [...list, extra];
  };

  const stepper = (value: number, onMinus: () => void, onPlus: () => void, label: string) => (
    <View style={styles.stepper}>
      <TouchableOpacity style={[styles.stepBtn, { backgroundColor: ui.fill2 }]} onPress={onMinus} accessibilityLabel={`${t('business.order.less')} ${label}`}>
        <Icon name="remove" size={15} color={dc.textPrimary} />
      </TouchableOpacity>
      <Text style={[styles.stepValue, { color: dc.textPrimary }]}>{value}</Text>
      <TouchableOpacity style={[styles.stepBtn, { backgroundColor: ui.fill2 }]} onPress={onPlus} accessibilityLabel={`${t('business.order.more')} ${label}`}>
        <Icon name="add" size={15} color={dc.textPrimary} />
      </TouchableOpacity>
    </View>
  );

  let title = editing ? t('business.order.editTitle') : t('business.order.newTitle');
  let body: React.ReactNode;
  let footer: React.ReactNode;
  let onBack: (() => void) | undefined;

  if (view.kind === 'product') {
    const product = catalog?.products?.[view.productId];
    const sizes = product ? orderedItems(product.sizes) : [];
    const available = product ? extrasForProduct(catalog, product) : [];
    const unit = product ? productPrice(product, sizeId) : 0;
    const preview = lineTotal({ unitPrice: unit, qty, extras: picked });
    title = product?.name ?? title;
    onBack = () => setView({ kind: 'main' });
    body = (
      <>
        {sizes.length > 0 && (
          <>
            <SheetLabel style={styles.firstLabel}>{t('business.order.size')}</SheetLabel>
            <ChipRow>
              {sizes.map((s) => (
                <Chip key={s.id} label={`${s.name} · ${money(s.price)}`} selected={s.id === sizeId} onPress={() => setSizeId(s.id)} />
              ))}
            </ChipRow>
          </>
        )}
        <SheetLabel>{t('business.order.extras')}</SheetLabel>
        {extrasPicker(available, picked, (extra) => setPicked((prev) => toggleIn(prev, extra)))}
        <SheetLabel>{t('business.order.quantity')}</SheetLabel>
        {stepper(qty, () => setQty((q) => Math.max(1, q - 1)), () => setQty((q) => q + 1), product?.name ?? '')}
      </>
    );
    footer = (
      <SheetButton
        label={`${t('business.order.addToOrder')} · ${money(preview)}`}
        icon="add"
        onPress={() => {
          if (!product) return;
          const size = sizeId ? product.sizes?.[sizeId] : undefined;
          addLine({
            productId: view.productId, categoryId: product.categoryId, name: product.name,
            sizeId: size ? sizeId : null, sizeName: size?.name ?? null,
            unitPrice: unit, qty, extras: picked,
          });
          setView({ kind: 'main' });
        }}
      />
    );
  } else if (view.kind === 'extras') {
    const line = lines.find((l) => l.key === view.lineKey);
    const product = line?.productId ? catalog?.products?.[line.productId] : null;
    const available = extrasForProduct(catalog, product ?? null);
    title = line ? lineName(line) : title;
    onBack = () => setView({ kind: 'main' });
    body = line ? (
      <>
        <SheetLabel style={styles.firstLabel}>{t('business.order.extrasPerUnit')}</SheetLabel>
        {extrasPicker(available, line.extras ?? [], (extra) => {
          setLines((prev) => prev.map((l) => (l.key === line.key ? { ...l, extras: toggleIn(l.extras ?? [], extra) } : l)));
        })}
      </>
    ) : null;
    footer = <SheetButton label={t('common.done')} onPress={() => setView({ kind: 'main' })} />;
  } else if (view.kind === 'manual') {
    title = t('business.order.manualLine');
    onBack = () => setView({ kind: 'main' });
    body = (
      <>
        <SheetLabel style={styles.firstLabel}>{t('business.order.manualName')}</SheetLabel>
        <FilledInput value={manualName} onChangeText={setManualName} placeholder={t('business.order.manualNamePlaceholder')} maxLength={50} />
        <SheetLabel>{t('business.order.price')}</SheetLabel>
        <AmountBox value={manualPrice} onChange={setManualPrice} width={140} accessibilityLabel={t('business.order.price')} />
        <SheetLabel>{t('business.order.quantity')}</SheetLabel>
        {stepper(qty, () => setQty((q) => Math.max(1, q - 1)), () => setQty((q) => q + 1), manualName)}
      </>
    );
    footer = (
      <SheetButton
        label={t('business.order.addToOrder')}
        icon="add"
        disabled={!manualName.trim() || !manualPrice}
        onPress={() => {
          addLine({ productId: null, categoryId: null, name: manualName.trim(), unitPrice: cents(manualPrice ?? 0), qty, extras: [] });
          setManualName('');
          setManualPrice(null);
          setView({ kind: 'main' });
        }}
      />
    );
  } else {
    body = (
      <>
        {categories.length > 0 && (
          <ChipRow scroll>
            {categories.map((c) => (
              <Chip key={c.id} label={c.name} selected={c.id === tab} onPress={() => setTab(c.id)} />
            ))}
          </ChipRow>
        )}
        <View style={styles.grid}>
          {products.map((p) => {
            const sizes = orderedItems(p.sizes);
            const price = sizes.length
              ? t('business.order.from', { price: money(Math.min(...sizes.map((s) => s.price))) })
              : money(productPrice(p));
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.tile, { backgroundColor: ui.field }]}
                onPress={() => tapProduct(p)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${p.name}, ${price}`}
              >
                <Text style={[styles.tileName, { color: dc.textPrimary }]} numberOfLines={2}>{p.name}</Text>
                <Text style={[styles.tilePrice, { color: dc.textSecondary }]} numberOfLines={1}>{price}</Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            style={[styles.tile, styles.tileHand, { borderColor: ui.hair2 }]}
            onPress={() => { setManualName(''); setManualPrice(null); setQty(1); setView({ kind: 'manual' }); }}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Text style={[styles.tileName, { color: ui.accent }]} numberOfLines={1}>{t('business.order.manual')}</Text>
            <Text style={[styles.tilePrice, { color: dc.textSecondary }]} numberOfLines={1}>{t('business.order.manualHint')}</Text>
          </TouchableOpacity>
        </View>
        {!products.length && !categories.length && <EmptyNote text={t('business.order.emptyCatalog')} />}

        <SheetLabel>{t('business.order.thisOrder')}</SheetLabel>
        {lines.length === 0 ? (
          <EmptyNote text={t('business.order.tapToAdd')} />
        ) : lines.map((line) => {
          // Extras: en los productos que los tienen en la carta (y en las líneas que ya llevan)
          const product = line.productId ? catalog?.products?.[line.productId] : null;
          const canExtras = !!product && (extrasForProduct(catalog, product).length > 0 || (line.extras ?? []).length > 0);
          return (
            <View key={line.key} style={[styles.line, { borderBottomColor: ui.hair }]}>
              {stepper(line.qty, () => changeQty(line.key, -1), () => changeQty(line.key, 1), lineName(line))}
              <View style={styles.lineText}>
                <Text style={[styles.lineName, { color: dc.textPrimary }]} numberOfLines={2}>{lineName(line)}</Text>
                {(line.extras ?? []).length > 0 && (
                  <Text style={[styles.lineSub, { color: dc.textSecondary }]} numberOfLines={2}>
                    {(line.extras ?? []).map((e) => `+\u00A0${e.name}\u00A0${money(e.price)}`).join(' · ')}
                  </Text>
                )}
                {canExtras && (
                  <TouchableOpacity onPress={() => setView({ kind: 'extras', lineKey: line.key })} hitSlop={6} accessibilityRole="button">
                    <Text style={[styles.lineLink, { color: ui.accent }]}>
                      {(line.extras ?? []).length ? t('business.order.changeExtras') : t('business.order.addExtra')}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={[styles.lineTotal, { color: dc.textPrimary }]}>{money(lineTotal(line))}</Text>
            </View>
          );
        })}

        <SheetLabel>{t('business.order.howPays')}</SheetLabel>
        <ChipRow>
          {channels.map((c) => (
            <Chip key={c.id} label={c.name} selected={c.id === channelId} onPress={() => setChannelId(c.id)} />
          ))}
        </ChipRow>
        <SheetLabel>{t('business.order.note')}</SheetLabel>
        <FilledInput value={note} onChangeText={setNote} placeholder={t('business.order.notePlaceholder')} maxLength={120} />
        {editing && (
          <AddLink label={t('business.order.voidOrder')} onPress={voidOrder} style={styles.voidLink} />
        )}
      </>
    );
    footer = (
      <View>
        <View style={styles.totalRow}>
          <Text style={[styles.totalLabel, { color: dc.textSecondary }]}>{t('business.order.total')}</Text>
          <Text style={[styles.totalValue, { color: dc.textPrimary }]}>{money(total)}</Text>
        </View>
        <SheetButton
          label={editing ? t('business.order.saveChanges') : t('business.order.save')}
          icon="checkmark"
          disabled={!lines.length || !channelId}
          loading={saving}
          onPress={save}
        />
      </View>
    );
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      onBack={onBack}
      title={title}
      footer={footer}
      maxHeight={0.94}
      dismissKeyboardOnTap
    >
      {body}
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  firstLabel: { marginTop: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  tile: { width: '48.5%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, minHeight: 64, justifyContent: 'space-between' },
  tileHand: { backgroundColor: 'transparent', borderWidth: 1.5, borderStyle: 'dashed' },
  tileName: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', lineHeight: 18 },
  tilePrice: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 4 },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  lineText: { flex: 1, minWidth: 0 },
  lineName: { fontSize: 14.5, fontFamily: 'Poppins_500Medium' },
  lineSub: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 1 },
  lineLink: { fontSize: 12.5, fontFamily: 'Poppins_600SemiBold', marginTop: 3 },
  lineTotal: { fontSize: 14.5, fontFamily: 'Poppins_600SemiBold', marginTop: 4 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  stepValue: { minWidth: 20, textAlign: 'center', fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  manualExtras: { marginTop: 8 },
  manualRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  manualName: { flex: 1 },
  addSmall: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  disabled: { opacity: 0.4 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  totalLabel: { fontSize: 13.5, fontFamily: 'Poppins_600SemiBold' },
  totalValue: { fontSize: 24, fontFamily: 'Poppins_700Bold', letterSpacing: -0.5 },
  voidLink: { marginTop: 8 },
});

export default OrderSheet;
