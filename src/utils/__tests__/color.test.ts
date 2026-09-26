import { hexToHsv, hsvToHex, isHexColor, mixHex, withAlpha } from '../color';

describe('isHexColor', () => {
  it('acepta solo #RRGGBB', () => {
    expect(isHexColor('#E8735A')).toBe(true);
    expect(isHexColor('#e8735a')).toBe(true);
    expect(isHexColor('#FFF')).toBe(false);
    expect(isHexColor('E8735A')).toBe(false);
    expect(isHexColor('#E8735AFF')).toBe(false);
    expect(isHexColor(3)).toBe(false);
    expect(isHexColor(undefined)).toBe(false);
  });
});

describe('hsvToHex', () => {
  it('da los colores puros de cada tono', () => {
    expect(hsvToHex(0, 1, 1)).toBe('#FF0000');
    expect(hsvToHex(60, 1, 1)).toBe('#FFFF00');
    expect(hsvToHex(120, 1, 1)).toBe('#00FF00');
    expect(hsvToHex(180, 1, 1)).toBe('#00FFFF');
    expect(hsvToHex(240, 1, 1)).toBe('#0000FF');
    expect(hsvToHex(300, 1, 1)).toBe('#FF00FF');
  });

  it('sin saturación es gris, y sin brillo, negro', () => {
    expect(hsvToHex(200, 0, 1)).toBe('#FFFFFF');
    expect(hsvToHex(200, 0, 0.5)).toBe('#808080');
    expect(hsvToHex(200, 1, 0)).toBe('#000000');
  });

  it('un tono de 360 o negativo vuelve a empezar', () => {
    expect(hsvToHex(360, 1, 1)).toBe('#FF0000');
    expect(hsvToHex(-120, 1, 1)).toBe('#0000FF');
  });
});

describe('hexToHsv', () => {
  it('ida y vuelta da el mismo color', () => {
    ['#E8735A', '#4A90D9', '#7BC67E', '#34495E', '#FFFFFF', '#000000', '#123456'].forEach((hex) => {
      const { h, s, v } = hexToHsv(hex);
      expect(hsvToHex(h, s, v)).toBe(hex);
    });
  });

  it('da tono, saturación y brillo en su rango', () => {
    const { h, s, v } = hexToHsv('#FF00FF');
    expect(h).toBeCloseTo(300);
    expect(s).toBe(1);
    expect(v).toBe(1);
    expect(hexToHsv('#000000')).toEqual({ h: 0, s: 0, v: 0 });
  });
});

describe('withAlpha y mixHex', () => {
  it('siguen funcionando', () => {
    expect(withAlpha('#FF8000', 0.5)).toBe('rgba(255,128,0,0.5)');
    expect(mixHex('#000000', '#FFFFFF', 0.5)).toBe('#808080');
  });
});
