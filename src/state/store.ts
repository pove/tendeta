import type { AdaptiveState } from '../core/adaptive';
import type { ErrorType } from '../core/errors';
import type { Cents } from '../core/money';
import type { AnswerMethod, LevelId, Mode } from '../core/types';
import { readJSON, removeAll, writeJSON } from './storage';

export type UiLang = 'es' | 'va';

export interface Settings {
  lang: UiLang;
  voice: boolean;
  sound: boolean;
  timer: boolean;
  calcTotal: boolean;
  traySum: 'auto' | 'show' | 'hide';
  estimation: 'auto' | 'on' | 'off';
  expert: boolean;
  fontSize: 'm' | 'l' | 'xl';
  roundLength: 5 | 10;
  reduceMotion: boolean;
  breakReminder: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  lang: 'es',
  voice: false,
  sound: false,
  timer: false,
  calcTotal: false,
  traySum: 'auto',
  estimation: 'auto',
  expert: false,
  fontSize: 'm',
  roundLength: 5,
  reduceMotion: false,
  breakReminder: true,
};

export interface GameConfig {
  scenarioId: string;
  level: LevelId;
  mode: Mode;
  method: AnswerMethod;
}

export interface Profile {
  id: string;
  alias: string;
  avatar: string;
  createdAt: number;
  stickers: string[];
  /** Shop slot index → sticker id. */
  placed: Record<string, string>;
  guidedSeen: LevelId[];
  lastConfig?: GameConfig;
  adaptive?: Partial<Record<string, AdaptiveState>>;
  rounds: number;
}

export interface LogEntry {
  id: string;
  profileId: string;
  ts: number;
  scenarioId: string;
  mode: Mode;
  level: LevelId;
  method: AnswerMethod;
  total: Cents;
  due: Cents;
  paid: Cents;
  change: Cents;
  answers: Cents[];
  firstTry: boolean;
  solved: boolean;
  errorType: ErrorType | null;
  errorTypes: ErrorType[];
  borrow: boolean;
  hints: number;
  timeMs: number;
  estimateOk?: boolean;
  totalOk?: boolean;
  optimal?: boolean;
}

const MAX_LOG = 6000;

interface Persisted {
  settings: Settings;
  profiles: Profile[];
  currentProfileId: string | null;
}

type Listener = () => void;

class Store {
  settings: Settings;
  profiles: Profile[];
  currentProfileId: string | null;
  log: LogEntry[];
  private listeners = new Set<Listener>();

  constructor() {
    const data = readJSON<Partial<Persisted>>('state', {});
    this.settings = { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) };
    this.profiles = Array.isArray(data.profiles) ? data.profiles.map(normalizeProfile) : [];
    this.currentProfileId = data.currentProfileId ?? null;
    const log = readJSON<LogEntry[]>('log', []);
    this.log = Array.isArray(log) ? log : [];
  }

  get profile(): Profile | null {
    return this.profiles.find((p) => p.id === this.currentProfileId) ?? null;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  save(): void {
    writeJSON('state', { settings: this.settings, profiles: this.profiles, currentProfileId: this.currentProfileId });
  }

  updateSettings(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    this.save();
    this.emit();
  }

  addProfile(alias: string, avatar: string): Profile {
    const profile = normalizeProfile({
      id: `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
      alias: alias.trim().slice(0, 24),
      avatar,
      createdAt: Date.now(),
    });
    this.profiles.push(profile);
    this.currentProfileId = profile.id;
    this.save();
    this.emit();
    return profile;
  }

  selectProfile(id: string | null): void {
    this.currentProfileId = id;
    this.save();
    this.emit();
  }

  updateProfile(id: string, patch: Partial<Profile>): void {
    const p = this.profiles.find((x) => x.id === id);
    if (!p) return;
    Object.assign(p, patch);
    this.save();
    this.emit();
  }

  deleteProfile(id: string): void {
    this.profiles = this.profiles.filter((p) => p.id !== id);
    this.log = this.log.filter((e) => e.profileId !== id);
    if (this.currentProfileId === id) this.currentProfileId = null;
    this.save();
    writeJSON('log', this.log);
    this.emit();
  }

  addLog(entry: LogEntry): void {
    this.log.push(entry);
    if (this.log.length > MAX_LOG) this.log.splice(0, this.log.length - MAX_LOG);
    writeJSON('log', this.log);
  }

  logFor(profileId: string): LogEntry[] {
    return this.log.filter((e) => e.profileId === profileId);
  }

  clearAll(): void {
    removeAll();
    this.settings = { ...DEFAULT_SETTINGS };
    this.profiles = [];
    this.currentProfileId = null;
    this.log = [];
    this.emit();
  }
}

function normalizeProfile(p: Partial<Profile>): Profile {
  return {
    id: String(p.id),
    alias: String(p.alias ?? '?'),
    avatar: String(p.avatar ?? '🦊'),
    createdAt: Number(p.createdAt ?? Date.now()),
    stickers: Array.isArray(p.stickers) ? p.stickers : [],
    placed: p.placed && typeof p.placed === 'object' ? p.placed : {},
    guidedSeen: Array.isArray(p.guidedSeen) ? p.guidedSeen : [],
    lastConfig: p.lastConfig,
    adaptive: p.adaptive ?? {},
    rounds: Number(p.rounds ?? 0),
  };
}

export const store = new Store();
