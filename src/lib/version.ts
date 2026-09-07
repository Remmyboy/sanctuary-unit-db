// Dotted version strings, as the mod reports them ("0.2.3"). Only ever used
// to decide whether a player's LadderReporter is behind the one the Play
// page offers; anything unparseable is treated as unknown, never as old.

const parts = (v: string): number[] | null => {
  const m = /^v?(\d+(?:\.\d+)*)/.exec(v.trim());
  return m ? m[1].split('.').map(Number) : null;
};

// True when `have` is a well-formed version strictly older than `want`.
export function isOlderVersion(have: string | null | undefined, want: string): boolean {
  if (!have) return false;
  const a = parts(have);
  const b = parts(want);
  if (!a || !b) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}
