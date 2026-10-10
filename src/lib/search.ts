// One search param for a route's validateSearch. The custom parseSearch in
// src/router.tsx only ever hands over strings, so all this does is give "not
// set" a single spelling: an absent or empty param both come out undefined.
export const str = (v: unknown): string | undefined => {
  const s = v == null ? '' : String(v);
  return s ? s : undefined;
};
