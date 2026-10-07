import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, useIsFocused } from '@react-navigation/native';
import { HeroScrollScreen } from '../../components/layout/HeroScreen';
import { HeroTitleBar } from '../../components/layout/HeroBar';
import { useBusinessStore } from '../store/businessStore';
import { useBizUiStore } from '../store/uiStore';
import { orderedItems } from '../logic/basics';
import { Channel, ConfigListKind, ExpenseType, Supplier, Worker } from '../types';
import { AddLink, EmptyNote, ListRow, Note } from '../ui/kit';
import { channelIcon } from '../ui/format';

/**
 * Una lista de Empresa: formas de cobro, empleados, proveedores, tipos de
 * gasto, secciones, cajas o turnos. Lo archivado, al final y en gris
 */
const BizListScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const focused = useIsFocused();
  const list: ConfigListKind = route.params?.list ?? 'channels';
  const config = useBusinessStore((s) => s.config);
  const open = useBizUiStore((s) => s.open);

  // El botón + de abajo añade a esta lista
  useEffect(() => {
    if (focused) useBizUiStore.getState().setList(list);
  }, [focused, list]);

  const items = useMemo(
    () => orderedItems(config?.[list] as Record<string, { name: string; order: number; archived?: boolean }> | undefined, { withArchived: true })
      .sort((a, b) => Number(!!a.archived) - Number(!!b.archived)),
    [config, list],
  );

  const subtitleOf = (item: (typeof items)[number]) => {
    if (item.archived) return t('business.lists.archived');
    if (list === 'channels') {
      const c = item as unknown as Channel;
      // El tipo, si no es el propio nombre («Efectivo», «Tarjeta»)
      const kind = t(`business.lists.channels.${c.kind}`);
      const parts = [
        kind.toLocaleLowerCase() === item.name.trim().toLocaleLowerCase() ? null : kind,
        c.commissionPct ? t('business.entry.commission', { pct: c.commissionPct }) : null,
      ].filter(Boolean);
      return parts.join(' · ') || null;
    }
    if (list === 'workers') return (item as unknown as Worker).role || null;
    if (list === 'suppliers') {
      const typeId = (item as unknown as Supplier).typeId;
      return typeId ? config?.expenseTypes?.[typeId]?.name ?? null : null;
    }
    return null;
  };

  const iconOf = (item: (typeof items)[number]) => {
    if (list === 'channels') return channelIcon((item as unknown as Channel).kind);
    if (list === 'expenseTypes') return ((item as unknown as ExpenseType).icon ?? 'pricetag') as never;
    return undefined;
  };

  return (
    <HeroScrollScreen hero={<HeroTitleBar title={t(`business.lists.${list}.title`)} onBack={() => navigation.goBack()} />}>
      <View style={styles.pad}>
        <Note text={t(`business.lists.${list}.hint`)} />
        <View style={styles.list}>
          {items.length === 0 ? (
            <EmptyNote text={t('business.lists.empty')} />
          ) : items.map((item) => {
            const icon = iconOf(item);
            return (
              <ListRow
                key={item.id}
                icon={icon}
                initial={icon ? undefined : item.name.charAt(0).toUpperCase()}
                title={item.name}
                subtitle={subtitleOf(item)}
                dim={item.archived}
                onPress={() => open({ kind: 'item', list, itemId: item.id })}
              />
            );
          })}
        </View>
        <AddLink label={t(`business.lists.${list}.add`)} onPress={() => open({ kind: 'item', list })} />
      </View>
    </HeroScrollScreen>
  );
};

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 20 },
  list: { marginTop: 10 },
});

export default BizListScreen;
