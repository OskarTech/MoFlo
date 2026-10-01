import AsyncStorage from '@react-native-async-storage/async-storage';
import { SHARED_CACHE, sharedCacheKey, readSharedCache, removeSharedCaches } from '../sharedCache';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const { MOVEMENTS, HUCHAS } = SHARED_CACHE;

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('readSharedCache', () => {
  it('cada cuenta lee solo su copia', async () => {
    await AsyncStorage.setItem(sharedCacheKey(MOVEMENTS, 'A'), '["de A"]');
    expect(await readSharedCache(MOVEMENTS, 'A')).toBe('["de A"]');
    expect(await readSharedCache(MOVEMENTS, 'B')).toBeNull();
  });

  it('la copia única de antes pasa a la primera cuenta que la lee, y solo a esa', async () => {
    await AsyncStorage.setItem(MOVEMENTS, '["de antes"]');
    expect(await readSharedCache(MOVEMENTS, 'A')).toBe('["de antes"]');
    expect(await AsyncStorage.getItem(sharedCacheKey(MOVEMENTS, 'A'))).toBe('["de antes"]');
    expect(await AsyncStorage.getItem(MOVEMENTS)).toBeNull();
    expect(await readSharedCache(MOVEMENTS, 'B')).toBeNull();
  });

  it('con copia propia no toca la de antes', async () => {
    await AsyncStorage.setItem(MOVEMENTS, '["de antes"]');
    await AsyncStorage.setItem(sharedCacheKey(MOVEMENTS, 'A'), '["de A"]');
    expect(await readSharedCache(MOVEMENTS, 'A')).toBe('["de A"]');
    expect(await AsyncStorage.getItem(MOVEMENTS)).toBe('["de antes"]');
  });
});

describe('removeSharedCaches', () => {
  it('borra las copias de todas las cuentas compartidas y nada más', async () => {
    await AsyncStorage.multiSet([
      [MOVEMENTS, '[]'],
      [sharedCacheKey(MOVEMENTS, 'A'), '[]'],
      [sharedCacheKey(HUCHAS, 'B'), '[]'],
      ['@moflo_movements', '["personal"]'],
      ['@moflo_shared_settings_A', '{}'],
    ]);
    await removeSharedCaches();
    expect([...(await AsyncStorage.getAllKeys())].sort()).toEqual(['@moflo_movements', '@moflo_shared_settings_A']);
  });
});
