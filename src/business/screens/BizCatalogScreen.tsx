import React, { useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { HeroScrollScreen } from '../../components/layout/HeroScreen';
import { HeroTitleBar } from '../../components/layout/HeroBar';
import { SectionHeader } from '../../components/layout/SheetSection';
import { useBusinessStore } from '../store/businessStore';
import { useBizUiStore } from '../store/uiStore';
import { orderedItems } from '../logic/basics';
import { productPrice } from '../logic/orders';
import { AddLink, Chip, ChipRow, EmptyNote, ListRow, Note, useMoney } from '../ui/kit';

/**
 * La carta: los productos de cada categoría con sus tamaños y precios, los
 * extras y las categorías. Lo archivado, al final y en gris: ya no sale al
 * apuntar, pero sigue en lo vendido
 */
const BizCatalogScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { money } = useMoney();
  const catalog = useBusinessStore((s) => s.catalog);
  const open = useBizUiStore((s) => s.open);
  const categories = useMemo(() => orderedItems(catalog?.categories), [catalog]);
  const [tab, setTab] = useState<string | 'all'>('all');

  const products = useMemo(
    () => orderedItems(catalog?.products, { withArchived: true })
      .filter((p) => tab === 'all' || p.categoryId === tab)
      .sort((a, b) => Number(!!a.archived) - Number(!!b.archived)),
    [catalog, tab],
  );
  const extras = useMemo(() => orderedItems(catalog?.extras, { withArchived: true }), [catalog]);
  const allCategories = useMemo(() => orderedItems(catalog?.categories, { withArchived: true }), [catalog]);

  const priceLabel = (p: (typeof products)[number]) => {
    const sizes = orderedItems(p.sizes);
    return sizes.length ? sizes.map((s) => `${s.name} ${money(s.price)}`).join(' · ') : money(productPrice(p));
  };

  return (
    <HeroScrollScreen hero={<HeroTitleBar title={t('business.catalog.title')} onBack={() => navigation.goBack()} />}>
      <View style={styles.pad}>
        <Note text={t('business.catalog.hint')} />
      </View>
      {categories.length > 0 && (
        <View style={styles.tabs}>
          <ChipRow scroll>
            <Chip label={t('business.catalog.all')} selected={tab === 'all'} onPress={() => setTab('all')} />
            {categories.map((c) => (
              <Chip key={c.id} label={c.name} selected={tab === c.id} onPress={() => setTab(c.id)} />
            ))}
          </ChipRow>
        </View>
      )}

      <SectionHeader title={t('business.catalog.products')} style={styles.section} />
      <View style={styles.pad}>
        {products.length === 0 ? (
          <EmptyNote text={t('business.catalog.noProducts')} />
        ) : products.map((p) => (
          <ListRow
            key={p.id}
            icon="pricetag-outline"
            title={p.name}
            subtitle={p.archived ? t('business.catalog.archived') : priceLabel(p)}
            dim={p.archived}
            onPress={() => open({ kind: 'product', productId: p.id })}
          />
        ))}
        <AddLink
          label={t('business.catalog.addProduct')}
          onPress={() => open({ kind: 'product', categoryId: tab === 'all' ? undefined : tab })}
        />
      </View>

      <SectionHeader title={t('business.catalog.extrasTitle')} style={styles.section} />
      <View style={styles.pad}>
        {extras.length === 0 ? (
          <EmptyNote text={t('business.catalog.noExtras')} />
        ) : extras.map((x) => (
          <ListRow
            key={x.id}
            icon="add-circle-outline"
            title={x.name}
            subtitle={x.archived
              ? t('business.catalog.archived')
              : x.categoryIds?.length
                ? x.categoryIds.map((c) => catalog?.categories?.[c]?.name).filter(Boolean).join(', ')
                : t('business.catalog.allCategories')}
            right={`+${money(x.price)}`}
            dim={x.archived}
            onPress={() => open({ kind: 'extra', extraId: x.id })}
          />
        ))}
        <AddLink label={t('business.catalog.addExtra')} onPress={() => open({ kind: 'extra' })} />
      </View>

      <SectionHeader title={t('business.catalog.categories')} style={styles.section} />
      <View style={styles.pad}>
        {allCategories.map((c) => (
          <ListRow
            key={c.id}
            icon="grid-outline"
            title={c.name}
            subtitle={c.archived
              ? t('business.catalog.archived')
              : t('business.catalog.productCount', {
                count: orderedItems(catalog?.products).filter((p) => p.categoryId === c.id).length,
              })}
            dim={c.archived}
            onPress={() => open({ kind: 'category', categoryId: c.id })}
          />
        ))}
        <AddLink label={t('business.catalog.addCategory')} onPress={() => open({ kind: 'category' })} />
      </View>
    </HeroScrollScreen>
  );
};

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 20 },
  tabs: { marginTop: 16, paddingHorizontal: 20 },
  section: { marginTop: 22 },
});

export default BizCatalogScreen;
