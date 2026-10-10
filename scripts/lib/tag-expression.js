// The canBuild tag-expression compiler for extract.js, split out so it can be
// unit-tested without a game install.

// canBuild is a boolean tag expression. `*` is AND, `+` is OR, and parentheses
// group:
//
//   Tags.EDA * Tags.BUILDABLE_BY_T1_FACTORY * ((Tags.LAND * Tags.MOBILE) + Tags.LAND_FACTORY)
//
// i.e. a land factory builds EDA land units, or another land factory — that's
// the upgrade chain. An atom that names a template id rather than a tag matches
// that one unit, which is how in-place structure upgrades are written
// ("Tags.ugs2806"). 27 of the 69 expressions use the OR/parenthesis form; a
// naive split on `*` silently drops them, costing ~90 units their builders.
export function compileTagExpression(src) {
  const tokens = src.match(/Tags\.[A-Za-z0-9_]+|[*+()]/g) ?? [];
  let pos = 0;

  // orExpr := andExpr ('+' andExpr)*
  const orExpr = () => {
    let node = andExpr();
    while (tokens[pos] === '+') {
      pos++;
      const [lhs, rhs] = [node, andExpr()];
      node = (u) => lhs(u) || rhs(u);
    }
    return node;
  };

  // andExpr := atom ('*' atom)*
  const andExpr = () => {
    let node = atom();
    while (tokens[pos] === '*') {
      pos++;
      const [lhs, rhs] = [node, atom()];
      node = (u) => lhs(u) && rhs(u);
    }
    return node;
  };

  const atom = () => {
    if (tokens[pos] === '(') {
      pos++;
      const node = orExpr();
      if (tokens[pos] !== ')') throw new Error(`expected ")" in: ${src}`);
      pos++;
      return node;
    }
    const token = tokens[pos++];
    if (!token?.startsWith('Tags.')) throw new Error(`unexpected "${token ?? 'end'}" in: ${src}`);
    const name = token.slice(5);
    return (u) => u.tags.includes(name) || u.id === name;
  };

  const matches = orExpr();
  if (pos !== tokens.length) throw new Error(`trailing tokens in: ${src}`);
  return matches;
}
