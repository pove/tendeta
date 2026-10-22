import { formatEuro } from './money';
import type { ErrorType } from './errors';
import type { LevelId } from './types';

/** Minimal shape of a log entry needed for statistics (see state/store.ts). */
export interface StatEntry {
  ts: number;
  profileId: string;
  scenarioId: string;
  mode: string;
  level: LevelId;
  method: string;
  total: number;
  due: number;
  paid: number;
  change: number;
  answers: number[];
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

export interface ProfileStats {
  problems: number;
  firstTryPct: number;
  solvedPct: number;
  avgTimeS: number;
  levels: LevelId[];
  byLevel: { level: LevelId; problems: number; firstTryPct: number }[];
  errors: Record<ErrorType, number>;
  borrowFirstTryPct: number | null;
  noBorrowFirstTryPct: number | null;
  lastPlayed: number | null;
}

export const ERROR_TYPES: ErrorType[] = ['over', 'under', 'carry', 'units', 'percent', 'split', 'total', 'estimate'];

const pct = (n: number, d: number): number => (d === 0 ? 0 : Math.round((n / d) * 100));

export function profileStats(entries: StatEntry[]): ProfileStats {
  const errors = Object.fromEntries(ERROR_TYPES.map((e) => [e, 0])) as Record<ErrorType, number>;
  for (const e of entries) for (const type of e.errorTypes) errors[type]++;
  const levels = [...new Set(entries.map((e) => e.level))].sort((a, b) => a - b);
  const byLevel = levels.map((level) => {
    const list = entries.filter((e) => e.level === level);
    return { level, problems: list.length, firstTryPct: pct(list.filter((e) => e.firstTry).length, list.length) };
  });
  const borrow = entries.filter((e) => e.borrow);
  const noBorrow = entries.filter((e) => !e.borrow);
  const times = entries.map((e) => e.timeMs).filter((t) => t > 0 && t < 10 * 60 * 1000);
  return {
    problems: entries.length,
    firstTryPct: pct(entries.filter((e) => e.firstTry).length, entries.length),
    solvedPct: pct(entries.filter((e) => e.solved).length, entries.length),
    avgTimeS: times.length === 0 ? 0 : Math.round(times.reduce((a, b) => a + b, 0) / times.length / 100) / 10,
    levels,
    byLevel,
    errors,
    borrowFirstTryPct: borrow.length ? pct(borrow.filter((e) => e.firstTry).length, borrow.length) : null,
    noBorrowFirstTryPct: noBorrow.length ? pct(noBorrow.filter((e) => e.firstTry).length, noBorrow.length) : null,
    lastPlayed: entries.length ? Math.max(...entries.map((e) => e.ts)) : null,
  };
}

function csvCell(value: string): string {
  if (/[;"\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function eur(c: number): string {
  return formatEuro(c, { symbol: false });
}

/**
 * CSV for spreadsheets configured in Spanish: `;` separator, comma decimals,
 * UTF-8 with BOM so Excel/LibreOffice read the accents correctly.
 */
export function toCSV(entries: StatEntry[], aliasOf: (profileId: string) => string, headers: string[], yes: string, no: string): string {
  const rows = entries.map((e) => {
    const d = new Date(e.ts);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const yn = (b: boolean | undefined): string => (b === undefined ? '' : b ? yes : no);
    return [
      date,
      time,
      aliasOf(e.profileId),
      e.scenarioId,
      e.mode,
      String(e.level),
      e.method,
      eur(e.total),
      eur(e.due),
      eur(e.paid),
      eur(e.change),
      e.answers[0] !== undefined ? eur(e.answers[0]) : '',
      e.answers[1] !== undefined ? eur(e.answers[1]) : '',
      yn(e.firstTry),
      yn(e.solved),
      e.errorTypes.join(' '),
      yn(e.borrow),
      String(e.hints),
      (Math.round(e.timeMs / 100) / 10).toString().replace('.', ','),
      yn(e.estimateOk),
      yn(e.totalOk),
      yn(e.optimal),
    ];
  });
  const lines = [headers, ...rows].map((r) => r.map(csvCell).join(';'));
  return '﻿' + lines.join('\r\n') + '\r\n';
}
