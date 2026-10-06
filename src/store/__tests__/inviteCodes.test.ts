import { generateInviteCode, isInviteCodeFormat } from '../inviteCodes';

jest.mock('@react-native-firebase/firestore', () => ({ __esModule: true, default: () => ({}) }));
jest.mock('../../services/crashReporting', () => ({ reportError: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

describe('códigos de invitación', () => {
  it('los que genera la app valen como código', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateInviteCode();
      expect(code).toMatch(/^[A-Z0-9]{6}$/);
      expect(isInviteCodeFormat(code)).toBe(true);
    }
  });

  it('lo que no puede ser un id de documento no se busca como código', () => {
    for (const code of ['', 'AB/CD', 'ABC', 'abc123', '../..', '__X__', 'ABC 12', 'A'.repeat(13)]) {
      expect(isInviteCodeFormat(code)).toBe(false);
    }
  });
});
