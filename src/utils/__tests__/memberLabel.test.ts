import { getMemberLabel } from '../memberLabel';

const FORMER = 'Antiguo miembro';

const account = {
  members: ['ana', 'luis'],
  memberNames: { ana: 'Ana', luis: 'Luis', marta: 'Marta' },
};

describe('getMemberLabel', () => {
  it('firma con su nombre a quien sigue en la cuenta', () => {
    expect(getMemberLabel(account, 'ana', FORMER)).toEqual({ name: 'Ana', isFormer: false });
  });

  it('mantiene el nombre de quien se fue, marcado como antiguo', () => {
    expect(getMemberLabel(account, 'marta', FORMER)).toEqual({ name: 'Marta', isFormer: true });
  });

  it('usa el texto genérico si del antiguo miembro no queda el nombre', () => {
    expect(getMemberLabel(account, 'pedro', FORMER)).toEqual({ name: FORMER, isFormer: true });
  });

  it('un miembro actual sin nombre se queda sin firma, como antes', () => {
    const sinNombre = { members: ['ana', 'eva'], memberNames: { ana: 'Ana' } };
    expect(getMemberLabel(sinNombre, 'eva', FORMER)).toBeUndefined();
  });

  it('sin cuenta o sin autor no hay firma', () => {
    expect(getMemberLabel(null, 'ana', FORMER)).toBeUndefined();
    expect(getMemberLabel(account, undefined, FORMER)).toBeUndefined();
  });

  it('sin lista de miembros no marca a nadie como antiguo', () => {
    const cacheAntigua = { memberNames: { ana: 'Ana' } } as any;
    expect(getMemberLabel(cacheAntigua, 'ana', FORMER)).toEqual({ name: 'Ana', isFormer: false });
    expect(getMemberLabel(cacheAntigua, 'pedro', FORMER)).toBeUndefined();
  });
});
