import { countUpSteps } from '../../core/countup';
import { formatShort, type Cents } from '../../core/money';
import { esc } from '../dom';

export interface NumberLineOptions {
  /** How many jumps are visible (the rest are drawn as dotted «?»). */
  revealed: number;
  /** Show the labels of the points that are not reached yet. */
  showPoints?: boolean;
  /** Text label for the whole drawing (accessibility). */
  label?: string;
}

/**
 * «Empty number line» with evenly spaced points and arcs labelled with the
 * jump (+10 c, +50 c, +2 €…). Even spacing keeps small jumps readable.
 */
export function numberLineSvg(price: Cents, paid: Cents, opts: NumberLineOptions): string {
  const steps = countUpSteps(price, paid);
  const n = steps.length;
  const gap = 118;
  const pad = 46;
  const width = pad * 2 + gap * Math.max(1, n);
  const y = 92;
  const x = (i: number): number => pad + i * gap;
  const parts: string[] = [];
  parts.push(`<line x1="${pad - 26}" y1="${y}" x2="${width - pad + 26}" y2="${y}" class="nl-axis"/>`);
  const points = [steps[0]?.from ?? price, ...steps.map((s) => s.to)];
  points.forEach((p, i) => {
    const shown = i <= opts.revealed || opts.showPoints || i === 0;
    const cls = i === 0 ? 'nl-start' : i === points.length - 1 ? 'nl-end' : 'nl-mid';
    parts.push(`<g class="nl-point ${cls} ${shown ? 'is-shown' : 'is-hidden'}" data-i="${i}">
      <line x1="${x(i)}" y1="${y - 9}" x2="${x(i)}" y2="${y + 9}" class="nl-tick"/>
      <text x="${x(i)}" y="${y + 32}" text-anchor="middle" class="nl-label">${shown ? esc(formatShort(p)) : '?'}</text>
    </g>`);
  });
  steps.forEach((s, i) => {
    const x1 = x(i) + 6;
    const x2 = x(i + 1) - 6;
    const mid = (x1 + x2) / 2;
    const shown = i < opts.revealed;
    parts.push(`<g class="nl-jump ${shown ? 'is-shown' : 'is-hidden'}" data-i="${i}">
      <path d="M${x1} ${y - 10} Q ${mid} ${y - 70} ${x2} ${y - 10}" class="nl-arc"/>
      <path d="M${x2 - 9} ${y - 20} L${x2} ${y - 10} L${x2 - 11} ${y - 8}" class="nl-arrow"/>
      <rect x="${mid - 38}" y="${y - 76}" width="76" height="28" rx="14" class="nl-badge"/>
      <text x="${mid}" y="${y - 56}" text-anchor="middle" class="nl-add">${shown ? '+' + esc(formatShort(s.add)) : '?'}</text>
    </g>`);
  });
  const label = opts.label ? ` aria-label="${esc(opts.label)}"` : ' aria-hidden="true"';
  return `<svg class="numberline" viewBox="0 0 ${width} 140" role="img"${label} preserveAspectRatio="xMidYMid meet">${parts.join('')}</svg>`;
}
