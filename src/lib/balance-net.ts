// The balance patch's changes as one net change per field: the unmodded
// game's value against the patch's final one.
//
// The mod's export lists changes in the order the mod applies them, each
// against the value before it, so one field can change twice: a T4's energy
// cost goes to 6 per alloy (Economy), then its whole cost is set again (Unit
// tuning). Read one by one, the second change's "before" isn't the game's
// number, and the first change's "after" isn't what you play. Folding them
// gives the game's value and the final one, with both sections.
//
// Plain TypeScript with no imports, so scripts/extract.js can load it under
// Node's type stripping as well as the site.

export interface NetInput {
  kind: string;
  id: string;
  field: string;
  label: string;
  before: unknown;
  after: unknown;
  sections: string[];
  why?: string[];
}

const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

// Set a dotted path inside an object, creating nothing: the patch only ever
// narrows into fields its wider change already holds.
function setPath(target: unknown, path: string[], value: unknown): unknown {
  if (!path.length) return clone(value);
  const copy = (clone(target) ?? {}) as Record<string, unknown>;
  copy[path[0]] = setPath(copy[path[0]], path.slice(1), value);
  return copy;
}

const within = (field: string, root: string) => field === root || field.startsWith(`${root}.`);
const rest = (field: string, root: string) => (field === root ? [] : field.slice(root.length + 1).split('.'));

/** Fold each thing's changes into one per field, in first-seen order, and drop
 *  any that end where they started. */
export function netChanges<T extends NetInput>(changes: T[]): T[] {
  const out: T[] = [];
  for (const c of changes) {
    const overlapping = out.filter(
      (g) => g.kind === c.kind && g.id === c.id && (within(c.field, g.field) || within(g.field, c.field)),
    );
    if (!overlapping.length) {
      out.push({
        ...c,
        before: clone(c.before),
        after: clone(c.after),
        sections: [...c.sections],
        why: [...(c.why ?? [])],
      });
      continue;
    }

    // Widen to whichever field holds the others, then replay.
    let net = overlapping[0];
    for (const g of overlapping.slice(1)) out.splice(out.indexOf(g), 1);
    for (const g of [...overlapping.slice(1), c]) {
      const merged = {
        sections: [...new Set([...net.sections, ...g.sections])],
        why: [...new Set([...(net.why ?? []), ...(g.why ?? [])])],
      };
      if (within(g.field, net.field)) {
        // Narrower (or the same): the game's value is already in net.before.
        net = { ...net, ...merged, after: setPath(net.after, rest(g.field, net.field), g.after) };
      } else {
        // Wider: its "before" holds net's result at the narrower path; put the game's value back.
        net = {
          ...g,
          ...merged,
          before: setPath(g.before, rest(net.field, g.field), net.before),
          after: clone(g.after),
        };
      }
    }
    out[out.indexOf(overlapping[0])] = net;
  }
  return out.filter((c) => JSON.stringify(c.before) !== JSON.stringify(c.after));
}
