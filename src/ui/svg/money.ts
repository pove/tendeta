import type { Cents } from '../../core/money';

/**
 * Original, stylised play money. Deliberately NOT a reproduction of real euro
 * notes/coins: no architecture, flags, maps or bank initials. Each value has
 * its own colour AND shape so it can be told apart without relying on colour.
 */

interface BillStyle {
  w: number;
  h: number;
  base: string;
  tint: string;
  ink: string;
  shape: 'circle' | 'triangle' | 'square' | 'diamond' | 'star';
}

// Width/height follow real proportions (bigger value → bigger note), in mm.
const BILLS: Record<number, BillStyle> = {
  500: { w: 120, h: 62, base: '#5E9C93', tint: '#E3F1EE', ink: '#1F4D47', shape: 'circle' },
  1000: { w: 127, h: 67, base: '#D9624B', tint: '#FBE4DE', ink: '#7A2615', shape: 'triangle' },
  2000: { w: 133, h: 72, base: '#3F78BE', tint: '#E0EBF8', ink: '#163C6B', shape: 'square' },
  5000: { w: 140, h: 77, base: '#E8932F', tint: '#FDEBD3', ink: '#7A440A', shape: 'diamond' },
  10000: { w: 147, h: 82, base: '#4E9E57', tint: '#E1F2E3', ink: '#1E5426', shape: 'star' },
};

// Real diameters in mm (keeps the relative sizes children know).
const COINS: Record<number, { d: number; metal: 'copper' | 'gold' | 'bi1' | 'bi2'; edge: 'plain' | 'notch' | 'milled' }> = {
  1: { d: 16.25, metal: 'copper', edge: 'plain' },
  2: { d: 18.75, metal: 'copper', edge: 'plain' },
  5: { d: 21.25, metal: 'copper', edge: 'plain' },
  10: { d: 19.75, metal: 'gold', edge: 'milled' },
  20: { d: 22.25, metal: 'gold', edge: 'notch' },
  50: { d: 24.25, metal: 'gold', edge: 'milled' },
  100: { d: 23.25, metal: 'bi1', edge: 'milled' },
  200: { d: 25.75, metal: 'bi2', edge: 'milled' },
};

const METALS = {
  copper: { light: '#F0B184', mid: '#D07F45', dark: '#8A4A1E', text: '#4A2408' },
  gold: { light: '#F8DD8A', mid: '#DDB042', dark: '#8F6A12', text: '#4A3505' },
  silver: { light: '#F3F5F8', mid: '#C4CBD4', dark: '#7D8794', text: '#2B3340' },
};

export function isBill(value: Cents): boolean {
  return value >= 500;
}

/** Real-world size in millimetres (bills: width × height; coins: diameter). */
export function pieceSizeMm(value: Cents): { w: number; h: number } {
  if (isBill(value)) {
    const b = BILLS[value]!;
    return { w: b.w, h: b.h };
  }
  const d = COINS[value]!.d;
  return { w: d, h: d };
}

/** Display size in CSS pixels for a piece, scale = px per mm. */
export function pieceSize(value: Cents, scale = 0.8): { w: number; h: number } {
  if (isBill(value)) {
    const b = BILLS[value]!;
    return { w: Math.round(b.w * scale), h: Math.round(b.h * scale) };
  }
  const c = COINS[value]!;
  const d = Math.round(c.d * scale * 2.85);
  return { w: d, h: d };
}

function shapePath(shape: BillStyle['shape'], cx: number, cy: number, r: number): string {
  switch (shape) {
    case 'circle':
      return `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
    case 'triangle':
      return `<path d="M${cx} ${cy - r} L${cx + r * 0.95} ${cy + r * 0.75} L${cx - r * 0.95} ${cy + r * 0.75}Z"/>`;
    case 'square':
      return `<rect x="${cx - r * 0.85}" y="${cy - r * 0.85}" width="${r * 1.7}" height="${r * 1.7}" rx="${r * 0.2}"/>`;
    case 'diamond':
      return `<path d="M${cx} ${cy - r} L${cx + r} ${cy} L${cx} ${cy + r} L${cx - r} ${cy}Z"/>`;
    case 'star': {
      const pts: string[] = [];
      for (let i = 0; i < 10; i++) {
        const rr = i % 2 === 0 ? r : r * 0.45;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
      }
      return `<polygon points="${pts.join(' ')}"/>`;
    }
  }
}

export function billSvg(value: Cents): string {
  const b = BILLS[value];
  if (!b) throw new Error(`No bill of ${value}`);
  const { w, h } = b;
  const euros = value / 100;
  const band = w * 0.24;
  const shapes = [0.25, 0.5, 0.75]
    .map((f) => shapePath(b.shape, band / 2, h * f, h * 0.085))
    .join('');
  const waves = [0.3, 0.5, 0.7]
    .map((f, i) => {
      const y = h * f;
      const amp = 3 + i;
      return `<path d="M${band} ${y} q ${w * 0.1} ${-amp} ${w * 0.19} 0 t ${w * 0.19} 0 t ${w * 0.19} 0 t ${w * 0.19} 0" fill="none" stroke="${b.base}" stroke-opacity="0.22" stroke-width="1.4"/>`;
    })
    .join('');
  const numSize = h * 0.5;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" class="piece-svg" aria-hidden="true" focusable="false">
  <rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="5" fill="${b.tint}" stroke="${b.ink}" stroke-width="1.6"/>
  ${waves}
  <path d="M1 6 a5 5 0 0 1 5 -5 H${band} V${h - 1} H6 a5 5 0 0 1 -5 -5Z" fill="${b.base}"/>
  <g fill="#fff" fill-opacity="0.92">${shapes}</g>
  <circle cx="${w * 0.8}" cy="${h * 0.48}" r="${h * 0.3}" fill="${b.base}" fill-opacity="0.13"/>
  <text x="${band + (w - band) * 0.47}" y="${h * 0.66}" text-anchor="middle" font-family="Atkinson Hyperlegible, system-ui, sans-serif" font-weight="700" font-size="${numSize}" fill="${b.ink}">${euros}</text>
  <text x="${w - 7}" y="${h * 0.24}" text-anchor="end" font-family="Atkinson Hyperlegible, system-ui, sans-serif" font-weight="700" font-size="${h * 0.17}" fill="${b.ink}">${euros} €</text>
  <text x="${band + 6}" y="${h - 7}" font-family="Atkinson Hyperlegible, system-ui, sans-serif" font-weight="700" font-size="${h * 0.13}" letter-spacing="2" fill="${b.ink}" fill-opacity="0.85">EUROS</text>
  <g fill="${b.ink}">${shapePath(b.shape, w - 12, h - 12, h * 0.07)}</g>
</svg>`;
}

export function coinSvg(value: Cents): string {
  const c = COINS[value];
  if (!c) throw new Error(`No coin of ${value}`);
  const size = 100;
  const r = 48;
  const cx = 50;
  const isEuro = value >= 100;
  const label = isEuro ? String(value / 100) : String(value);
  const unit = isEuro ? '€' : 'c';
  const outer = c.metal === 'copper' ? METALS.copper : c.metal === 'gold' || c.metal === 'bi1' ? METALS.gold : METALS.silver;
  const inner = c.metal === 'bi1' ? METALS.silver : c.metal === 'bi2' ? METALS.gold : outer;
  const gid = `g${value}`;
  let edge = '';
  if (c.edge === 'milled') {
    edge = `<circle cx="${cx}" cy="${cx}" r="${r - 1.5}" fill="none" stroke="${outer.dark}" stroke-width="3" stroke-dasharray="1.6 2.2" stroke-opacity="0.55"/>`;
  }
  let body = `<circle cx="${cx}" cy="${cx}" r="${r}" fill="url(#${gid}o)" stroke="${outer.dark}" stroke-width="2.5"/>`;
  if (c.edge === 'notch') {
    // «flower» shaped coin: 7 gentle notches
    const pts: string[] = [];
    for (let i = 0; i < 70; i++) {
      const a = (i / 70) * Math.PI * 2 - Math.PI / 2;
      const notch = Math.cos(a * 7) > 0.92 ? 3.2 : 0;
      const rr = r - notch;
      pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cx + rr * Math.sin(a)).toFixed(2)}`);
    }
    body = `<polygon points="${pts.join(' ')}" fill="url(#${gid}o)" stroke="${outer.dark}" stroke-width="2.5" stroke-linejoin="round"/>`;
  }
  const innerDisc =
    c.metal === 'bi1' || c.metal === 'bi2'
      ? `<circle cx="${cx}" cy="${cx}" r="${r * 0.68}" fill="url(#${gid}i)" stroke="${inner.dark}" stroke-width="1.6"/>`
      : `<circle cx="${cx}" cy="${cx}" r="${r * 0.8}" fill="none" stroke="${outer.dark}" stroke-opacity="0.35" stroke-width="1.4"/>`;
  const textColor = inner.text;
  const fontSize = label.length >= 2 ? 36 : 42;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" class="piece-svg" aria-hidden="true" focusable="false">
  <defs>
    <radialGradient id="${gid}o" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="${outer.light}"/><stop offset="0.6" stop-color="${outer.mid}"/><stop offset="1" stop-color="${outer.dark}"/></radialGradient>
    <radialGradient id="${gid}i" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="${inner.light}"/><stop offset="0.7" stop-color="${inner.mid}"/><stop offset="1" stop-color="${inner.dark}"/></radialGradient>
  </defs>
  ${body}${edge}${innerDisc}
  <text x="${cx}" y="${cx + 4}" text-anchor="middle" font-family="Atkinson Hyperlegible, system-ui, sans-serif" font-weight="700" font-size="${fontSize}" fill="${textColor}">${label}</text>
  <text x="${cx}" y="${cx + 29}" text-anchor="middle" font-family="Atkinson Hyperlegible, system-ui, sans-serif" font-weight="700" font-size="${isEuro ? 24 : 22}" fill="${textColor}">${unit}</text>
</svg>`;
}

export function pieceSvg(value: Cents): string {
  return isBill(value) ? billSvg(value) : coinSvg(value);
}
