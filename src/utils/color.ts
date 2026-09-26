// Utilidades de color para colores en hexadecimal (#RRGGBB)

const parse = (hex: string) => {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// El color con transparencia, como rgba()
export const withAlpha = (hex: string, alpha: number): string => {
  const [r, g, b] = parse(hex);
  return `rgba(${r},${g},${b},${alpha})`;
};

// Mezcla dos colores: t = 0 devuelve a, t = 1 devuelve b
export const mixHex = (a: string, b: string, t: number): string => {
  const pa = parse(a);
  const pb = parse(b);
  return '#' + pa
    .map((v, i) => Math.round(v * (1 - t) + pb[i] * t).toString(16).padStart(2, '0'))
    .join('');
};

// ¿Es un color #RRGGBB válido? (los elegidos con el selector libre)
export const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);

// Tono (0-360), saturación y brillo (0-1) a #RRGGBB
export const hsvToHex = (h: number, s: number, v: number): string => {
  const hue = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    hue < 60 ? [c, x, 0]
      : hue < 120 ? [x, c, 0]
        : hue < 180 ? [0, c, x]
          : hue < 240 ? [0, x, c]
            : hue < 300 ? [x, 0, c]
              : [c, 0, x];
  return '#' + [r, g, b]
    .map((n) => Math.round((n + m) * 255).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
};

// #RRGGBB a tono (0-360), saturación y brillo (0-1)
export const hexToHsv = (hex: string): { h: number; s: number; v: number } => {
  const [r, g, b] = parse(hex).map((n) => n / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h: h < 0 ? h + 360 : h, s: max === 0 ? 0 : d / max, v: max };
};
