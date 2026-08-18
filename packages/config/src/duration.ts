/**
 * Duration parsing for token lifetimes.
 *
 * Accepts the compact form used throughout the configuration (`15m`, `7d`) and
 * a bare number, which is interpreted as seconds.
 */

const MULTIPLIERS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

export function parseDurationToMs(value: string): number {
  const match = /^(\d+)(ms|s|m|h|d)?$/.exec(value.trim());
  if (!match) {
    throw new TypeError(`Invalid duration: "${value}"`);
  }
  const amount = Number.parseInt(match[1]!, 10);
  const unit = match[2] ?? 's';
  const multiplier = MULTIPLIERS[unit];
  if (multiplier === undefined) {
    throw new TypeError(`Invalid duration unit: "${unit}"`);
  }
  return amount * multiplier;
}

export function parseDurationToSeconds(value: string): number {
  return Math.floor(parseDurationToMs(value) / 1000);
}
