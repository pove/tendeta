import { createRng } from '../../core/rng';

/** Procedural, diverse customer portraits (original SVG illustrations). */

export type Mood = 'neutral' | 'happy' | 'thinking';

const SKINS = ['#F7D9C0', '#EDBB91', '#D9975F', '#B26F3E', '#8A5230', '#5E3A22'];
const HAIR_COLORS = ['#2B1B12', '#4A2C1A', '#7A4A24', '#B9773A', '#E3C27A', '#1B1B1B', '#9C3B22'];
const GREY = ['#C9C9C9', '#E6E6E6'];
const SHIRTS = ['#1E5AA8', '#C2412D', '#23784A', '#F08A24', '#7B4FA0', '#E86A92', '#2A8C9A', '#F5C443'];
const HIJABS = ['#7B4FA0', '#2A8C9A', '#C2412D', '#1E5AA8', '#E8932F'];

type HairStyle = 'short' | 'long' | 'bun' | 'curly' | 'afro' | 'bald' | 'hijab' | 'cap' | 'pigtails';
const STYLES: HairStyle[] = ['short', 'long', 'bun', 'curly', 'afro', 'bald', 'hijab', 'cap', 'pigtails'];

export interface CustomerLook {
  skin: string;
  hair: string;
  style: HairStyle;
  shirt: string;
  glasses: boolean;
  beard: boolean;
  elder: boolean;
  child: boolean;
  accent: string;
}

export function lookFromSeed(seed: number): CustomerLook {
  const rng = createRng(seed);
  const elder = rng.chance(0.2);
  const child = !elder && rng.chance(0.2);
  const style = rng.pick(child ? STYLES.filter((s) => s !== 'bald') : STYLES);
  return {
    skin: rng.pick(SKINS),
    hair: elder ? rng.pick(GREY) : rng.pick(HAIR_COLORS),
    style,
    shirt: rng.pick(SHIRTS),
    glasses: rng.chance(elder ? 0.6 : 0.25),
    beard: !child && style !== 'hijab' && style !== 'pigtails' && style !== 'long' && rng.chance(0.25),
    elder,
    child,
    accent: style === 'hijab' ? rng.pick(HIJABS) : rng.pick(SHIRTS),
  };
}

function shade(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (n & 255) + amount));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export function customerSvg(seed: number, mood: Mood = 'neutral', label = ''): string {
  const c = lookFromSeed(seed);
  const headR = c.child ? 30 : 33;
  const cx = 70;
  const cy = c.child ? 74 : 68;
  const skinDark = shade(c.skin, -28);
  const hairDark = shade(c.hair, -20);

  // Hair behind the head
  let back = '';
  let front = '';
  switch (c.style) {
    case 'long':
      back = `<path d="M${cx - 38} ${cy - 4} q0 -44 38 -44 q38 0 38 44 v46 q-10 8 -20 0 v-30 h-36 v30 q-10 8 -20 0z" fill="${c.hair}"/>`;
      front = `<path d="M${cx - 33} ${cy - 6} q4 -32 33 -32 q29 0 33 32 q-18 -14 -40 -16 q-12 8 -26 16z" fill="${c.hair}"/>`;
      break;
    case 'bun':
      back = `<circle cx="${cx}" cy="${cy - 42}" r="15" fill="${c.hair}"/>`;
      front = `<path d="M${cx - 34} ${cy - 2} q0 -36 34 -36 q34 0 34 36 q-8 -20 -34 -22 q-26 2 -34 22z" fill="${c.hair}"/>`;
      break;
    case 'curly': {
      const curls: string[] = [];
      for (let i = 0; i < 9; i++) {
        const a = Math.PI + (i / 8) * Math.PI;
        curls.push(`<circle cx="${(cx + Math.cos(a) * 31).toFixed(1)}" cy="${(cy - 6 + Math.sin(a) * 30).toFixed(1)}" r="11" fill="${c.hair}"/>`);
      }
      front = curls.join('');
      break;
    }
    case 'afro':
      back = `<circle cx="${cx}" cy="${cy - 10}" r="46" fill="${c.hair}"/>`;
      break;
    case 'short':
      front = `<path d="M${cx - 34} ${cy - 4} q-2 -38 34 -38 q36 0 34 38 q-6 -16 -16 -18 q-8 6 -40 4 q-8 4 -12 14z" fill="${c.hair}"/>`;
      break;
    case 'pigtails':
      back = `<circle cx="${cx - 40}" cy="${cy - 4}" r="13" fill="${c.hair}"/><circle cx="${cx + 40}" cy="${cy - 4}" r="13" fill="${c.hair}"/>`;
      front = `<path d="M${cx - 34} ${cy - 4} q0 -36 34 -36 q34 0 34 36 q-10 -18 -34 -20 q-24 2 -34 20z" fill="${c.hair}"/>`;
      break;
    case 'cap':
      front = `<path d="M${cx - 35} ${cy - 10} q2 -30 35 -30 q33 0 35 30z" fill="${c.accent}"/><path d="M${cx + 10} ${cy - 12} h40 q4 0 2 5 q-10 5 -42 3z" fill="${shade(c.accent, -30)}"/>`;
      break;
    case 'hijab':
      back = `<path d="M${cx - 44} ${cy + 50} q-6 -60 10 -86 q34 -34 68 0 q16 26 10 86z" fill="${c.accent}"/>`;
      front = `<path d="M${cx - 36} ${cy + 6} q-2 -44 36 -46 q38 2 36 46 q-6 -26 -36 -28 q-30 2 -36 28z" fill="${c.accent}"/>`;
      break;
    case 'bald':
      front = c.elder ? `<path d="M${cx - 34} ${cy} q2 -10 6 -14 M${cx + 34} ${cy} q-2 -10 -6 -14" stroke="${c.hair}" stroke-width="7" stroke-linecap="round" fill="none"/>` : '';
      break;
  }

  const eyeY = cy + 2;
  const eyes =
    mood === 'happy'
      ? `<path d="M${cx - 17} ${eyeY} q5 -6 10 0 M${cx + 7} ${eyeY} q5 -6 10 0" stroke="#2B2340" stroke-width="3.2" stroke-linecap="round" fill="none"/>`
      : `<circle cx="${cx - 12}" cy="${eyeY}" r="3.6" fill="#2B2340"/><circle cx="${cx + 12}" cy="${eyeY}" r="3.6" fill="#2B2340"/>`;
  const brows =
    mood === 'thinking'
      ? `<path d="M${cx - 18} ${eyeY - 10} l10 -3 M${cx + 8} ${eyeY - 13} l10 3" stroke="${hairDark}" stroke-width="3" stroke-linecap="round"/>`
      : `<path d="M${cx - 18} ${eyeY - 10} q6 -4 11 -1 M${cx + 7} ${eyeY - 11} q5 -3 11 1" stroke="${hairDark}" stroke-width="3" stroke-linecap="round" fill="none"/>`;
  const mouth =
    mood === 'happy'
      ? `<path d="M${cx - 13} ${cy + 15} q13 14 26 0 z" fill="#8E2F2A"/><path d="M${cx - 9} ${cy + 16} q9 5 18 0" fill="#fff"/>`
      : mood === 'thinking'
        ? `<path d="M${cx - 8} ${cy + 19} q8 -4 16 1" stroke="#7A2F2A" stroke-width="3" stroke-linecap="round" fill="none"/>`
        : `<path d="M${cx - 10} ${cy + 16} q10 8 20 0" stroke="#7A2F2A" stroke-width="3" stroke-linecap="round" fill="none"/>`;
  const glasses = c.glasses
    ? `<g fill="none" stroke="#2B2340" stroke-width="2.4"><circle cx="${cx - 12}" cy="${eyeY}" r="9"/><circle cx="${cx + 12}" cy="${eyeY}" r="9"/><path d="M${cx - 3} ${eyeY} h6"/></g>`
    : '';
  const beard = c.beard
    ? `<path d="M${cx - 30} ${cy + 4} q2 34 30 36 q28 -2 30 -36 q-6 14 -16 14 q-14 -6 -28 0 q-10 0 -16 -14z" fill="${c.hair}"/>`
    : '';
  const cheeks = `<circle cx="${cx - 20}" cy="${cy + 11}" r="5" fill="#E86A6A" fill-opacity="0.25"/><circle cx="${cx + 20}" cy="${cy + 11}" r="5" fill="#E86A6A" fill-opacity="0.25"/>`;
  const shoulders = `<path d="M${cx - 52} 160 q0 -44 52 -46 q52 2 52 46z" fill="${c.shirt}"/><path d="M${cx - 12} ${cy + 34} h24 l-12 14z" fill="${shade(c.shirt, 30)}"/>`;
  const neck = `<rect x="${cx - 10}" y="${cy + 22}" width="20" height="20" rx="6" fill="${skinDark}"/>`;
  const ears = c.style === 'hijab' ? '' : `<circle cx="${cx - headR}" cy="${cy + 3}" r="7" fill="${skinDark}"/><circle cx="${cx + headR}" cy="${cy + 3}" r="7" fill="${skinDark}"/>`;
  const think = mood === 'thinking' ? `<g fill="#5E5470"><circle cx="${cx + 46}" cy="${cy - 30}" r="3"/><circle cx="${cx + 54}" cy="${cy - 40}" r="4.5"/><circle cx="${cx + 63}" cy="${cy - 53}" r="6"/></g>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 160" class="customer-svg" role="img" aria-label="${label}">
  ${back}${shoulders}${neck}${ears}
  <circle cx="${cx}" cy="${cy}" r="${headR}" fill="${c.skin}"/>
  ${beard}${front}${cheeks}${brows}${eyes}${glasses}${mouth}${think}
</svg>`;
}
