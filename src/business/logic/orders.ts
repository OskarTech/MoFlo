import {
  Catalog, CatalogExtra, Order, OrderLine, OrdersSummary, Product, SoldItem,
} from '../types';
import { cents, orderedItems, sumOf } from './basics';

/** Lo que suman los extras de una unidad */
export const extrasPerUnit = (line: Pick<OrderLine, 'extras'>): number =>
  sumOf(line.extras ?? [], (e) => e.price);

/** Una línea: (precio de la unidad + sus extras) × cantidad */
export const lineTotal = (line: Pick<OrderLine, 'unitPrice' | 'qty' | 'extras'>): number =>
  cents((line.unitPrice + extrasPerUnit(line)) * line.qty);

export const orderTotal = (lines: readonly Pick<OrderLine, 'unitPrice' | 'qty' | 'extras'>[]): number =>
  sumOf(lines, lineTotal);

/** «Barbacoa familiar» */
export const lineName = (line: Pick<OrderLine, 'name' | 'sizeName'>): string =>
  (line.sizeName ? `${line.name} ${line.sizeName.toLocaleLowerCase()}` : line.name);

/** «2 Barbacoa familiar + queso, Coca-Cola»: lo que se ve de un pedido en una línea */
export const describeOrder = (lines: readonly OrderLine[]): string =>
  lines.map((line) => {
    const qty = line.qty > 1 ? `${line.qty} ` : '';
    const extras = (line.extras ?? []).map((e) => ` + ${e.name.toLocaleLowerCase()}`).join('');
    return `${qty}${lineName(line)}${extras}`;
  }).join(', ');

/** Los extras que se le pueden poner a un producto: los de su categoría y los de todo */
export const extrasForProduct = (
  catalog: Catalog | null | undefined, product: Pick<Product, 'categoryId'> | null | undefined,
): (CatalogExtra & { id: string })[] =>
  orderedItems(catalog?.extras).filter((extra) =>
    !extra.categoryIds?.length || (!!product && extra.categoryIds.includes(product.categoryId)));

/** El precio de un producto: el del tamaño, o el suyo si no tiene tamaños */
export const productPrice = (product: Product, sizeId?: string | null): number => {
  if (sizeId && product.sizes?.[sizeId]) return product.sizes[sizeId].price;
  return product.price ?? 0;
};

export const hasSizes = (product: Product): boolean => orderedItems(product.sizes).length > 0;

// Clave de lo vendido: por los ids, para que renombrar no parta las ventas.
// Lo escrito a mano, por su nombre
const itemKey = (line: OrderLine) =>
  (line.productId ? `${line.productId}|${line.sizeId ?? ''}` : `manual|${line.name.trim().toLocaleLowerCase()}`);
const extraKey = (extra: { extraId?: string | null; name: string }) =>
  (extra.extraId ? extra.extraId : `manual|${extra.name.trim().toLocaleLowerCase()}`);

const addSold = (record: Record<string, SoldItem>, key: string, name: string, qty: number, amount: number, categoryId?: string | null) => {
  const prev = record[key];
  record[key] = prev
    ? { ...prev, name, qty: prev.qty + qty, amount: cents(prev.amount + amount) }
    : { name, qty, amount: cents(amount), categoryId: categoryId ?? null };
};

/**
 * Lo vendido en unos pedidos (los de un día): cuántos, por forma de cobro, por
 * producto y tamaño, los extras, los tamaños y las horas. Los anulados solo
 * se cuentan como anulados.
 */
export const summarizeOrders = (orders: readonly Order[]): OrdersSummary => {
  const summary: OrdersSummary = {
    count: 0, voided: 0, total: 0,
    byChannel: {}, channelNames: {}, items: {}, extras: {}, sizes: {}, hours: {},
  };
  for (const order of orders) {
    if (order.status === 'void') {
      summary.voided += 1;
      continue;
    }
    summary.count += 1;
    summary.total = cents(summary.total + order.total);
    summary.byChannel[order.channelId] = cents((summary.byChannel[order.channelId] ?? 0) + order.total);
    summary.channelNames[order.channelId] = order.channelName;
    const hour = String(new Date(order.at).getHours());
    summary.hours[hour] = (summary.hours[hour] ?? 0) + 1;
    for (const line of order.lines) {
      addSold(summary.items, itemKey(line), lineName(line), line.qty, line.unitPrice * line.qty, line.categoryId);
      if (line.sizeName) summary.sizes[line.sizeName] = (summary.sizes[line.sizeName] ?? 0) + line.qty;
      for (const extra of line.extras ?? []) {
        addSold(summary.extras, extraKey(extra), extra.name, line.qty, extra.price * line.qty);
      }
    }
  }
  return summary;
};

/** Junta los resúmenes de varios días (los del mes) */
export const mergeSummaries = (list: readonly OrdersSummary[]): OrdersSummary => {
  const out: OrdersSummary = {
    count: 0, voided: 0, total: 0,
    byChannel: {}, channelNames: {}, items: {}, extras: {}, sizes: {}, hours: {},
  };
  for (const s of list) {
    out.count += s.count;
    out.voided += s.voided;
    out.total = cents(out.total + s.total);
    for (const [k, v] of Object.entries(s.byChannel ?? {})) out.byChannel[k] = cents((out.byChannel[k] ?? 0) + v);
    Object.assign(out.channelNames, s.channelNames ?? {});
    for (const [k, v] of Object.entries(s.items ?? {})) addSold(out.items, k, v.name, v.qty, v.amount, v.categoryId);
    for (const [k, v] of Object.entries(s.extras ?? {})) addSold(out.extras, k, v.name, v.qty, v.amount, v.categoryId);
    for (const [k, v] of Object.entries(s.sizes ?? {})) out.sizes[k] = (out.sizes[k] ?? 0) + v;
    for (const [k, v] of Object.entries(s.hours ?? {})) out.hours[k] = (out.hours[k] ?? 0) + v;
  }
  return out;
};

/** De más a menos vendido */
export const ranking = (record: Record<string, SoldItem>): (SoldItem & { key: string })[] =>
  Object.entries(record)
    .map(([key, item]) => ({ ...item, key }))
    .sort((a, b) => (b.qty - a.qty) || (b.amount - a.amount));
