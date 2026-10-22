import type { LevelDef, LevelId, Scenario } from '../core/types';
import levelsJson from './levels.json';
import supermercado from './scenarios/supermercado.json';
import restaurante from './scenarios/restaurante.json';
import mercado from './scenarios/mercado.json';
import horchateria from './scenarios/horchateria.json';
import stickersJson from './stickers.json';

export const LEVELS = levelsJson as unknown as LevelDef[];

/**
 * Scenarios are plain JSON files: adding a new shop only requires a new file
 * in `scenarios/` and one line here.
 */
export const SCENARIOS = [supermercado, restaurante, mercado, horchateria] as unknown as Scenario[];

export interface Sticker {
  id: string;
  icon: string;
  name: { es: string; va: string };
}

export const STICKERS = stickersJson as Sticker[];

export function getLevel(level: LevelId): LevelDef {
  const def = LEVELS.find((l) => l.level === level);
  if (!def) throw new Error(`Unknown level ${level}`);
  return def;
}

export function getScenario(id: string): Scenario {
  const sc = SCENARIOS.find((s) => s.id === id);
  if (!sc) throw new Error(`Unknown scenario ${id}`);
  return sc;
}

export const LEVEL_IDS: LevelId[] = [1, 2, 3, 4, 5, 6];
