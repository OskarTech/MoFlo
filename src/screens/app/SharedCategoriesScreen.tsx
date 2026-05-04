import React, { useState, useEffect, useRef } from 'react';
import {
  View, StyleSheet, ScrollView,
  TouchableOpacity, Alert, Modal,
  Animated, Platform, Keyboard,
} from 'react-native';
import { Text, TextInput, Button } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, RouteProp } from '@react-navigation/native';
import { useSharedCategoryStore } from '../../store/sharedCategoryStore';
import { useTheme } from '../../hooks/useTheme';
import { colors } from '../../theme';
import { MovementType } from '../../types';
import AppHeader from '../../components/common/AppHeader';

const AVAILABLE_ICONS: { name: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { name: 'home', icon: 'home' },
  { name: 'business', icon: 'business' },
  { name: 'bed', icon: 'bed' },
  { name: 'construct', icon: 'construct' },
  { name: 'car', icon: 'car' },
  { name: 'bicycle', icon: 'bicycle' },
  { name: 'bus', icon: 'bus' },
  { name: 'boat', icon: 'boat' },
  { name: 'airplane', icon: 'airplane' },
  { name: 'rocket', icon: 'rocket' },
  { name: 'train', icon: 'train' },
  { name: 'map', icon: 'map' },
  { name: 'gift', icon: 'gift' },
  { name: 'heart', icon: 'heart' },
  { name: 'star', icon: 'star' },
  { name: 'sparkles', icon: 'sparkles' },
  { name: 'trophy', icon: 'trophy' },
  { name: 'medal', icon: 'medal' },
  { name: 'ribbon', icon: 'ribbon' },
  { name: 'diamond', icon: 'diamond' },
  { name: 'school', icon: 'school' },
  { name: 'library', icon: 'library' },
  { name: 'book', icon: 'book' },
  { name: 'briefcase', icon: 'briefcase' },
  { name: 'laptop', icon: 'laptop' },
  { name: 'desktop', icon: 'desktop' },
  { name: 'tablet-portrait', icon: 'tablet-portrait' },
  { name: 'phone-portrait', icon: 'phone-portrait' },
  { name: 'watch', icon: 'watch' },
  { name: 'headset', icon: 'headset' },
  { name: 'game-controller', icon: 'game-controller' },
  { name: 'tv', icon: 'tv' },
  { name: 'camera', icon: 'camera' },
  { name: 'videocam', icon: 'videocam' },
  { name: 'image', icon: 'image' },
  { name: 'film', icon: 'film' },
  { name: 'musical-notes', icon: 'musical-notes' },
  { name: 'mic', icon: 'mic' },
  { name: 'restaurant', icon: 'restaurant' },
  { name: 'pizza', icon: 'pizza' },
  { name: 'fast-food', icon: 'fast-food' },
  { name: 'cafe', icon: 'cafe' },
  { name: 'wine', icon: 'wine' },
  { name: 'beer', icon: 'beer' },
  { name: 'ice-cream', icon: 'ice-cream' },
  { name: 'nutrition', icon: 'nutrition' },
  { name: 'cart', icon: 'cart' },
  { name: 'bag', icon: 'bag' },
  { name: 'basket', icon: 'basket' },
  { name: 'pricetag', icon: 'pricetag' },
  { name: 'shirt', icon: 'shirt' },
  { name: 'glasses', icon: 'glasses' },
  { name: 'cut', icon: 'cut' },
  { name: 'brush', icon: 'brush' },
  { name: 'color-palette', icon: 'color-palette' },
  { name: 'color-wand', icon: 'color-wand' },
  { name: 'flower', icon: 'flower' },
  { name: 'leaf', icon: 'leaf' },
  { name: 'paw', icon: 'paw' },
  { name: 'fish', icon: 'fish' },
  { name: 'man', icon: 'man' },
  { name: 'woman', icon: 'woman' },
  { name: 'people', icon: 'people' },
  { name: 'person', icon: 'person' },
  { name: 'fitness', icon: 'fitness' },
  { name: 'barbell', icon: 'barbell' },
  { name: 'football', icon: 'football' },
  { name: 'basketball', icon: 'basketball' },
  { name: 'tennisball', icon: 'tennisball' },
  { name: 'american-football', icon: 'american-football' },
  { name: 'medical', icon: 'medical' },
  { name: 'pulse', icon: 'pulse' },
  { name: 'bandage', icon: 'bandage' },
  { name: 'umbrella', icon: 'umbrella' },
  { name: 'sunny', icon: 'sunny' },
  { name: 'snow', icon: 'snow' },
  { name: 'partly-sunny', icon: 'partly-sunny' },
  { name: 'cash', icon: 'cash' },
  { name: 'card', icon: 'card' },
  { name: 'wallet', icon: 'wallet' },
  { name: 'trending-up', icon: 'trending-up' },
  { name: 'receipt', icon: 'receipt' },
  { name: 'shield', icon: 'shield' },
  { name: 'balloon', icon: 'balloon' },
  { name: 'planet', icon: 'planet' },
  { name: 'earth', icon: 'earth' },
  { name: 'globe', icon: 'globe' },
  { name: 'ellipsis-horizontal', icon: 'ellipsis-horizontal' },
];

type RouteParams = { SharedCategories: { accountId: string } };

const SharedCategoriesScreen = () => {
  const { t } = useTranslation();
  const { colors: dc, isDark } = useTheme();
  const TYPE_COLORS = { income: dc.income, expense: dc.expense, saving: dc.savings };
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProp<RouteParams, 'SharedCategories'>>();
  const accountId = route.params?.accountId;

  const {
    addSharedCategory,
    updateSharedCategory,
    deleteSharedCategory,
    hideSharedBaseCategory,
    getSharedCategoriesForType,
  } = useSharedCategoryStore();

  const [activeType, setActiveType] = useState<MovementType>('expense');
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('ellipsis-horizontal');
  const [selectedType, setSelectedType] = useState<MovementType>('expense');
  const [editingCategory, setEditingCategory] = useState<{ id: string; name: string; icon: string; type: MovementType } | null>(null);
  const sheetOffset = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!showAddModal) {
      sheetOffset.setValue(0);
      return;
    }
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => {
      const offset = Platform.OS === 'ios'
        ? -(e.endCoordinates.height - insets.bottom)
        : -e.endCoordinates.height;
      Animated.timing(sheetOffset, {
        toValue: offset,
        duration: Platform.OS === 'ios' ? (e.duration ?? 250) : 200,
        useNativeDriver: true,
      }).start();
    });
    const hide = Keyboard.addListener(hideEvent, () => {
      Animated.timing(sheetOffset, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    });
    return () => { show.remove(); hide.remove(); };
  }, [showAddModal, sheetOffset, insets.bottom]);

  useEffect(() => {
    if (showAddModal) {
      if (editingCategory) {
        setName(editingCategory.name);
        setSelectedIcon(editingCategory.icon);
        setSelectedType(editingCategory.type);
      } else {
        setName('');
        setSelectedIcon('ellipsis-horizontal');
        setSelectedType(activeType);
      }
    }
  }, [showAddModal, editingCategory]);

  const baseCats = getSharedCategoriesForType(activeType).filter(c => !c.isCustom);
  const customCats = getSharedCategoriesForType(activeType).filter(c => c.isCustom);

  const handleDeleteBase = (id: string, catName: string) => {
    Alert.alert(
      t('categories.deleteConfirm'),
      catName,
      [
        { text: t('movements.cancel'), style: 'cancel' },
        {
          text: t('categories.delete'),
          style: 'destructive',
          onPress: () => hideSharedBaseCategory(accountId, id, activeType),
        },
      ]
    );
  };

  const handleDeleteCustom = (id: string, catName: string) => {
    Alert.alert(
      t('categories.deleteConfirm'),
      catName,
      [
        { text: t('movements.cancel'), style: 'cancel' },
        {
          text: t('categories.delete'),
          style: 'destructive',
          onPress: () => deleteSharedCategory(accountId, id),
        },
      ]
    );
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    if (editingCategory) {
      await updateSharedCategory(accountId, editingCategory.id, { name: name.trim(), icon: selectedIcon });
    } else {
      await addSharedCategory(accountId, {
        name: name.trim(),
        icon: selectedIcon,
        type: selectedType,
        isCustom: true,
      });
    }
    setName('');
    setSelectedIcon('ellipsis-horizontal');
    setEditingCategory(null);
    setShowAddModal(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: dc.background }]}>
      <AppHeader title={t('categories.title')} showBack showBell={false} />

      <View style={[styles.typeTabs, { backgroundColor: dc.surface, borderBottomColor: dc.border }]}>
        {(['expense', 'income'] as MovementType[]).map((tp) => (
          <TouchableOpacity
            key={tp}
            style={[
              styles.typeTab,
              activeType === tp && { borderBottomColor: TYPE_COLORS[tp], borderBottomWidth: 2 },
            ]}
            onPress={() => setActiveType(tp)}
          >
            <Text style={[
              styles.typeTabText,
              { color: dc.textSecondary },
              activeType === tp && { color: TYPE_COLORS[tp], fontFamily: 'Poppins_600SemiBold' },
            ]}>
              {t(`movements.${tp}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* CATEGORÍAS BASE */}
        {baseCats.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
              {t('categories.default')}
            </Text>
            <View style={[styles.card, { backgroundColor: dc.surface, borderColor: dc.border }]}>
              {baseCats.map((cat, index) => (
                <View key={cat.id}>
                  <View style={styles.categoryRow}>
                    <View style={[styles.categoryIcon, { backgroundColor: TYPE_COLORS[activeType] + '20' }]}>
                      <Ionicons name={cat.icon as any} size={20} color={TYPE_COLORS[activeType]} />
                    </View>
                    <Text style={[styles.categoryName, { color: dc.textPrimary }]}>
                      {t(`movements.categories.${cat.id}`)}
                    </Text>
                    <TouchableOpacity
                      onPress={() => handleDeleteBase(cat.id, t(`movements.categories.${cat.id}`))}
                      style={styles.deleteButton}
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.expense} />
                    </TouchableOpacity>
                  </View>
                  {index < baseCats.length - 1 && (
                    <View style={[styles.divider, { backgroundColor: dc.border }]} />
                  )}
                </View>
              ))}
            </View>
          </>
        )}

        {/* CATEGORÍAS PERSONALIZADAS */}
        <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
          {t('categories.custom')}
        </Text>
        {customCats.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: dc.surface, borderColor: dc.border }]}>
            <Text style={[styles.emptyText, { color: dc.textSecondary }]}>
              {t('categories.noCustom')}
            </Text>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: dc.surface, borderColor: dc.border }]}>
            {customCats.map((cat, index) => (
              <View key={cat.id}>
                <View style={styles.categoryRow}>
                  <View style={[styles.categoryIcon, { backgroundColor: TYPE_COLORS[activeType] + '20' }]}>
                    <Ionicons name={cat.icon as any} size={20} color={TYPE_COLORS[activeType]} />
                  </View>
                  <Text style={[styles.categoryName, { color: dc.textPrimary }]}>
                    {cat.name}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setEditingCategory({ id: cat.id, name: cat.name, icon: cat.icon, type: activeType });
                      setShowAddModal(true);
                    }}
                    style={styles.actionButton}
                  >
                    <Ionicons name="pencil-outline" size={18} color={dc.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDeleteCustom(cat.id, cat.name)}
                    style={styles.actionButton}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.expense} />
                  </TouchableOpacity>
                </View>
                {index < customCats.length - 1 && (
                  <View style={[styles.divider, { backgroundColor: dc.border }]} />
                )}
              </View>
            ))}
          </View>
        )}

        <Button
          mode="contained"
          onPress={() => {
            setEditingCategory(null);
            setShowAddModal(true);
          }}
          style={styles.addButton}
          contentStyle={styles.addButtonContent}
          buttonColor={TYPE_COLORS[activeType]}
          textColor="#FFFFFF"
          icon="plus"
        >
          {t('categories.addCategory')}
        </Button>
      </ScrollView>

      {/* MODAL AÑADIR */}
      <Modal visible={showAddModal} animationType="slide" transparent onRequestClose={() => { setShowAddModal(false); setEditingCategory(null); }}>
        <Animated.View style={[styles.modalOverlay, { transform: [{ translateY: sheetOffset }] }]}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => { setShowAddModal(false); setEditingCategory(null); }} />
          <View style={[styles.modalSheet, {
            backgroundColor: isDark ? colors.surfaceDark : '#FFFFFF',
            paddingBottom: insets.bottom + 24,
          }]}>
            <View style={[styles.handleBar, { backgroundColor: dc.border }]} />
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={[styles.modalTitle, { color: dc.textPrimary }]}>
                {editingCategory ? t('categories.editCategory') : t('categories.addCategory')}
              </Text>

              {!editingCategory && (
                <>
                  <Text style={[styles.fieldLabel, { color: dc.textSecondary }]}>{t('categories.type')}</Text>
                  <View style={styles.typeRow}>
                    {(['expense', 'income'] as MovementType[]).map((tp) => (
                      <TouchableOpacity
                        key={tp}
                        style={[
                          styles.typeChip,
                          { backgroundColor: dc.surface, borderColor: dc.border },
                          selectedType === tp && { backgroundColor: TYPE_COLORS[tp], borderColor: TYPE_COLORS[tp] },
                        ]}
                        onPress={() => setSelectedType(tp)}
                      >
                        <Text style={[
                          styles.typeChipText, { color: dc.textSecondary },
                          selectedType === tp && { color: '#FFFFFF' },
                        ]}>
                          {t(`movements.${tp}`)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              <Text style={[styles.fieldLabel, { color: dc.textSecondary }]}>{t('categories.name')}</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                mode="outlined"
                placeholder={t('categories.namePlaceholder')}
                style={[styles.nameInput, { backgroundColor: isDark ? colors.backgroundDark : '#FFFFFF' }]}
                outlineColor={TYPE_COLORS[selectedType]}
                activeOutlineColor={TYPE_COLORS[selectedType]}
              />

              <Text style={[styles.fieldLabel, { color: dc.textSecondary }]}>{t('categories.icon')}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                style={styles.iconsScroll}
                contentContainerStyle={styles.iconsScrollContent}
              >
                <View style={styles.iconsGrid}>
                  {AVAILABLE_ICONS.map((item) => (
                    <TouchableOpacity
                      key={item.name}
                      style={[
                        styles.iconOption,
                        { backgroundColor: dc.surface, borderColor: dc.border },
                        selectedIcon === item.name && { backgroundColor: TYPE_COLORS[selectedType], borderColor: TYPE_COLORS[selectedType] },
                      ]}
                      onPress={() => setSelectedIcon(item.name)}
                    >
                      <Ionicons
                        name={item.icon}
                        size={22}
                        color={selectedIcon === item.name ? '#FFFFFF' : dc.textSecondary}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <View style={styles.buttons}>
                <Button mode="outlined" onPress={() => setShowAddModal(false)} style={styles.cancelButton} textColor={dc.textSecondary}>
                  {t('movements.cancel')}
                </Button>
                <Button
                  mode="contained"
                  onPress={handleSave}
                  disabled={!name.trim()}
                  style={styles.saveButton}
                  buttonColor={TYPE_COLORS[selectedType]}
                  textColor="#FFFFFF"
                >
                  {t('movements.save')}
                </Button>
              </View>
            </ScrollView>
          </View>
        </Animated.View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  typeTabs: { flexDirection: 'row', borderBottomWidth: 0.5 },
  typeTab: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  typeTabText: { fontSize: 13, fontFamily: 'Poppins_500Medium' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  sectionLabel: {
    fontSize: 12, fontFamily: 'Poppins_600SemiBold',
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: 8, marginLeft: 4,
  },
  card: { borderRadius: 16, marginBottom: 20, overflow: 'hidden', borderWidth: 0.5 },
  emptyCard: { borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 20, borderWidth: 0.5 },
  emptyText: { fontSize: 14, fontFamily: 'Poppins_400Regular' },
  categoryRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  categoryIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  categoryName: { flex: 1, fontSize: 15, fontFamily: 'Poppins_500Medium' },
  deleteButton: { padding: 4 },
  actionButton: { padding: 4 },
  divider: { height: 0.5, marginLeft: 66 },
  addButton: { borderRadius: 12 },
  addButtonContent: { height: 52 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '90%' },
  handleBar: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 22, fontFamily: 'Poppins_700Bold', marginBottom: 20 },
  fieldLabel: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  typeChip: { flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: 'center', borderWidth: 0.5 },
  typeChipText: { fontSize: 13, fontFamily: 'Poppins_500Medium' },
  nameInput: { marginBottom: 20 },
  iconsScroll: { marginHorizontal: -24, marginBottom: 24 },
  iconsScrollContent: { paddingHorizontal: 24 },
  iconsGrid: {
    flexDirection: 'column',
    flexWrap: 'wrap',
    height: 48 * 3 + 10 * 2,
    alignContent: 'flex-start',
    gap: 10,
  },
  iconOption: { width: 48, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 0.5 },
  buttons: { flexDirection: 'row', gap: 12 },
  cancelButton: { flex: 1 },
  saveButton: { flex: 2 },
});

export default SharedCategoriesScreen;