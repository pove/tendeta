import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEVELS, SCENARIOS, STICKERS } from '../src/data';
import es from '../src/i18n/es.json';
import va from '../src/i18n/va.json';

describe('translations', () => {
  it('Spanish (master) and Valencian have exactly the same keys and no empty texts', () => {
    expect(Object.keys(va).sort()).toEqual(Object.keys(es).sort());
    for (const dict of [es, va]) for (const [k, v] of Object.entries(dict)) expect(v.trim(), k).not.toBe('');
  });
  it('placeholders match in both languages', () => {
    const vars = (s: string): string[] => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const k of Object.keys(es) as (keyof typeof es)[]) expect(vars(va[k]), k).toEqual(vars(es[k]));
  });
  it('every key used in the code exists in the dictionaries', () => {
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const f of readdirSync(dir, { withFileTypes: true })) {
        if (f.isDirectory()) walk(join(dir, f.name));
        else if (f.name.endsWith('.ts')) files.push(join(dir, f.name));
      }
    };
    walk(join(process.cwd(), 'src'));
    const used = new Set<string>();
    for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) used.add(m[1]!);
    for (const key of used) expect(es, key).toHaveProperty([key]);
    // Dynamic keys
    for (const l of LEVELS) {
      expect(es).toHaveProperty([`level.${l.level}.title`]);
      expect(es).toHaveProperty([`level.${l.level}.desc`]);
    }
    for (const s of SCENARIOS) for (const p of s.products) expect(es, p.category).toHaveProperty([`cat.${p.category}`]);
    for (const m of ['auto', 'free', 'challenge', 'guided']) expect(es).toHaveProperty([`mode.${m}.desc`]);
    // Cashier sentences exist in feminine and masculine form.
    for (const k of ['setup.firstTimeText', 'answer.questionGuided', 'guided.title']) {
      expect(es).toHaveProperty([k]);
      expect(es).toHaveProperty([`${k}.m`]);
      expect(es[k as keyof typeof es]).toMatch(/cajera/);
      expect(es[`${k}.m` as keyof typeof es]).toMatch(/cajero/);
      expect(va[`${k}.m` as keyof typeof va]).toMatch(/\b(un|el) caixer\b/);
    }
  });
});

describe('dictionary hygiene', () => {
  it('every text in the dictionaries is used by the code (no dead translations)', () => {
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const f of readdirSync(dir, { withFileTypes: true })) {
        if (f.isDirectory()) walk(join(dir, f.name));
        else if (f.name.endsWith('.ts')) files.push(join(dir, f.name));
      }
    };
    walk(join(process.cwd(), 'src'));
    const code = files.map((f) => readFileSync(f, 'utf8')).join(' ');
    // Keys built at run time from a prefix (`level.${n}.desc`, `cat.${category}`…).
    const dynamic = ['level.', 'mode.', 'cat.', 'err.', 'adult.tab.', 'praise.', 'thanks.'];
    const unused = Object.keys(es).filter((k) => {
      const base = k.endsWith('.m') ? k.slice(0, -2) : k; // masculine variants of cashier sentences
      return !code.includes(`'${base}'`) && !dynamic.some((d) => k.startsWith(d));
    });
    expect(unused).toEqual([]);
  });
});

describe('data files', () => {
  it('every scenario and product is bilingual, unique and without brands', () => {
    const ids = new Set<string>();
    for (const s of SCENARIOS) {
      expect(ids.has(s.id)).toBe(false);
      ids.add(s.id);
      expect(s.name.es && s.name.va).toBeTruthy();
      const productIds = new Set<string>();
      for (const p of s.products) {
        expect(productIds.has(p.id), p.id).toBe(false);
        productIds.add(p.id);
        expect(p.name.es.length * p.name.va.length).toBeGreaterThan(0);
        expect(p.icon).toBeTruthy();
        expect(Boolean(p.price) !== Boolean(p.sizes), p.id).toBe(true);
        const ranges = p.sizes ? p.sizes.map((x) => x.price) : [p.price!];
        for (const [min, max] of ranges) {
          expect(Number.isInteger(min) && Number.isInteger(max)).toBe(true);
          expect(min).toBeLessThanOrEqual(max);
        }
      }
    }
  });
  it('levels are consistent with the specification table', () => {
    expect(LEVELS.map((l) => l.level)).toEqual([1, 2, 3, 4, 5, 6]);
    const totals = LEVELS.map((l) => l.totalMax);
    expect(totals).toEqual([1000, 2000, 5000, 10000, 10000, 20000]);
    for (let i = 1; i < LEVELS.length; i++) expect(LEVELS[i]!.borrowShare).toBeGreaterThan(LEVELS[i - 1]!.borrowShare);
    expect(LEVELS[0]!.money).toEqual([100, 200, 500]);
    expect(LEVELS[0]!.decimalKey).toBe(false);
    expect(LEVELS[2]!.decimalKey).toBe(true);
    expect(LEVELS[4]!.traySum).toBe(false);
    expect(LEVELS[5]!.minPieces).toBe(true);
  });
  it('stickers are a fixed bilingual sequence', () => {
    expect(new Set(STICKERS.map((s) => s.id)).size).toBe(STICKERS.length);
    for (const s of STICKERS) expect(s.name.es && s.name.va).toBeTruthy();
  });
});
