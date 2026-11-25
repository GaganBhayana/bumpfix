/** A parsed semantic version (semver 2.0.0). */
export interface SemVer {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  /** Dot-separated prerelease identifiers; numeric ones are numbers. Empty for a release. */
  readonly prerelease: readonly (string | number)[];
  /** Build metadata identifiers. Ignored when comparing. */
  readonly build: readonly string[];
}

/** Success with a value, or an expected failure with a readable reason. */
export type ParseResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

/** How far a version moved, by the highest component that changed. */
export type BumpKind = 'major' | 'minor' | 'patch' | 'prerelease' | 'none';

/** Longest version or range text accepted, to bound work on untrusted manifests. */
export const MAX_INPUT_LENGTH = 256;

const NUM = '0|[1-9]\\d*';
const PRE_ID = `(?:${NUM}|\\d*[A-Za-z-][0-9A-Za-z-]*)`;
const PRE = `${PRE_ID}(?:\\.${PRE_ID})*`;
const BUILD = '[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*';
const VERSION_RE = new RegExp(`^v?(${NUM})\\.(${NUM})\\.(${NUM})(?:-(${PRE}))?(?:\\+(${BUILD}))?$`);
const XPART = `x|X|\\*|${NUM}`;
const PARTIAL_RE = new RegExp(
  `^v?(${XPART})(?:\\.(${XPART})(?:\\.(${XPART})(?:-(${PRE}))?(?:\\+(${BUILD}))?)?)?$`,
);

const fail = (error: string): ParseResult<never> => ({ ok: false, error });

/** Quotes untrusted input for an error message, escaping newlines and control characters. */
const quote = (text: string): string => JSON.stringify(text);

function toInt(text: string): number | undefined {
  const n = Number(text);
  return Number.isSafeInteger(n) ? n : undefined;
}

/** Splits prerelease identifiers; undefined if a numeric one is above `Number.MAX_SAFE_INTEGER`. */
function parsePrerelease(text: string | undefined): (string | number)[] | undefined {
  if (text === undefined) return [];
  const ids: (string | number)[] = [];
  for (const id of text.split('.')) {
    if (!/^\d+$/.test(id)) ids.push(id);
    else {
      const n = toInt(id);
      if (n === undefined) return undefined;
      ids.push(n);
    }
  }
  return ids;
}

/**
 * Parses a full version such as `1.2.3`, `v2.0.0-rc.1` or `1.0.0+build.5`.
 * Rejects partial versions, leading zeros and numbers above `Number.MAX_SAFE_INTEGER`.
 */
export function parseVersion(text: string): ParseResult<SemVer> {
  const trimmed = text.trim();
  if (trimmed.length > MAX_INPUT_LENGTH) return fail(`version longer than ${MAX_INPUT_LENGTH} characters`);
  const m = VERSION_RE.exec(trimmed);
  if (!m) return fail(`invalid version ${quote(trimmed)}`);
  const [major, minor, patch] = [m[1], m[2], m[3]].map((p) => toInt(p ?? ''));
  if (major === undefined || minor === undefined || patch === undefined) {
    return fail(`version number too large in ${quote(trimmed)}`);
  }
  const prerelease = parsePrerelease(m[4]);
  if (prerelease === undefined) return fail(`prerelease number too large in ${quote(trimmed)}`);
  return { ok: true, value: { major, minor, patch, prerelease, build: m[5] ? m[5].split('.') : [] } };
}

/** Formats a version back to text, including prerelease and build. */
export function formatVersion(v: SemVer): string {
  const pre = v.prerelease.length > 0 ? `-${v.prerelease.join('.')}` : '';
  const build = v.build.length > 0 ? `+${v.build.join('.')}` : '';
  return `${v.major}.${v.minor}.${v.patch}${pre}${build}`;
}

const sign = (n: number): -1 | 0 | 1 => (n < 0 ? -1 : n > 0 ? 1 : 0);

function compareIdentifier(a: string | number, b: string | number): -1 | 0 | 1 {
  if (typeof a === 'number' && typeof b === 'number') return sign(a - b);
  if (typeof a === 'number') return -1;
  if (typeof b === 'number') return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function comparePrerelease(a: SemVer['prerelease'], b: SemVer['prerelease']): -1 | 0 | 1 {
  if (a.length === 0 || b.length === 0) return sign(b.length - a.length);
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const c = compareIdentifier(a[i] as string | number, b[i] as string | number);
    if (c !== 0) return c;
  }
  return sign(a.length - b.length);
}

/** Semver precedence: -1 if `a < b`, 0 if equal, 1 if `a > b`. Build metadata is ignored. */
export function compareVersions(a: SemVer, b: SemVer): -1 | 0 | 1 {
  return (
    sign(a.major - b.major) ||
    sign(a.minor - b.minor) ||
    sign(a.patch - b.patch) ||
    comparePrerelease(a.prerelease, b.prerelease)
  );
}

/**
 * Names the highest component that differs between two versions, for example
 * `1.2.3 → 2.0.0` is `major` and `1.0.0-rc.1 → 1.0.0` is `prerelease`. It does not
 * look at direction: use {@link compareVersions} to spot a downgrade.
 */
export function classifyBump(from: SemVer, to: SemVer): BumpKind {
  if (from.major !== to.major) return 'major';
  if (from.minor !== to.minor) return 'minor';
  if (from.patch !== to.patch) return 'patch';
  return comparePrerelease(from.prerelease, to.prerelease) === 0 ? 'none' : 'prerelease';
}

/**
 * True when `to` is an upgrade outside what `^from` allows: a major bump for `>=1.0.0`,
 * a minor bump for `0.y.z` and any bump for `0.0.z`, as npm's caret treats them.
 */
export function isBreakingBump(from: SemVer, to: SemVer): boolean {
  if (compareVersions(to, from) <= 0) return false;
  return compareVersions(to, caretUpper(from.major, from.minor, from.patch)) >= 0;
}

/** One comparison such as `>=1.2.3` inside a range. */
export interface Comparator {
  readonly operator: '<' | '<=' | '>' | '>=' | '=';
  readonly version: SemVer;
}

/** A parsed npm range: a version satisfies it when it satisfies every comparator of any one set. */
export interface Range {
  readonly sets: readonly (readonly Comparator[])[];
}

const ver = (major: number, minor: number, patch: number, prerelease: SemVer['prerelease'] = []): SemVer => ({
  major,
  minor,
  patch,
  prerelease,
  build: [],
});
const c = (operator: Comparator['operator'], version: SemVer): Comparator => ({ operator, version });
/** `-0` is the lowest prerelease, so `<2.0.0-0` also excludes `2.0.0` prereleases. */
const below = (major: number, minor: number, patch: number): Comparator => c('<', ver(major, minor, patch, [0]));
const ANY: readonly Comparator[] = [c('>=', ver(0, 0, 0))];
const NONE: readonly Comparator[] = [below(0, 0, 0)];

function caretUpper(major: number, minor: number, patch: number): SemVer {
  if (major > 0) return ver(major + 1, 0, 0, [0]);
  if (minor > 0) return ver(0, minor + 1, 0, [0]);
  return ver(0, 0, patch + 1, [0]);
}

/** A range operand such as `1`, `1.2`, `1.x` or `1.2.3-beta`; missing parts are wildcards. */
interface PartialVersion {
  readonly major?: number;
  readonly minor?: number;
  readonly patch?: number;
  readonly prerelease: SemVer['prerelease'];
}

const isX = (part: string | undefined): boolean => part === undefined || part === 'x' || part === 'X' || part === '*';

function parsePartial(text: string): PartialVersion | undefined {
  const m = PARTIAL_RE.exec(text);
  if (!m) return undefined;
  const nums: (number | undefined)[] = [];
  for (const part of [m[1], m[2], m[3]]) {
    // Once a part is a wildcard, the rest are too: `1.x.3` means `1.x`.
    if (isX(part) || nums.some((n) => n === undefined)) nums.push(undefined);
    else {
      const n = toInt(part as string);
      if (n === undefined) return undefined;
      nums.push(n);
    }
  }
  const [major, minor, patch] = nums;
  const prerelease = parsePrerelease(m[4]);
  if (prerelease === undefined || (prerelease.length > 0 && patch === undefined)) return undefined;
  return {
    prerelease,
    ...(major !== undefined && { major }),
    ...(minor !== undefined && { minor }),
    ...(patch !== undefined && { patch }),
  };
}

/** Turns one range token (operator plus partial version) into plain comparators. */
function desugar(operator: string, p: PartialVersion): readonly Comparator[] {
  const { major: M, minor: m, patch: pa, prerelease } = p;
  if (M === undefined) return operator === '<' || operator === '>' ? NONE : ANY;
  if (operator === '^') {
    if (m === undefined) return [c('>=', ver(M, 0, 0)), below(M + 1, 0, 0)];
    if (pa === undefined) return [c('>=', ver(M, m, 0)), M > 0 ? below(M + 1, 0, 0) : below(0, m + 1, 0)];
    return [c('>=', ver(M, m, pa, prerelease)), c('<', caretUpper(M, m, pa))];
  }
  if (operator === '~' || operator === '~>') {
    if (m === undefined) return [c('>=', ver(M, 0, 0)), below(M + 1, 0, 0)];
    return [c('>=', ver(M, m, pa ?? 0, prerelease)), below(M, m + 1, 0)];
  }
  if (operator === '' || operator === '=') {
    if (m === undefined) return [c('>=', ver(M, 0, 0)), below(M + 1, 0, 0)];
    if (pa === undefined) return [c('>=', ver(M, m, 0)), below(M, m + 1, 0)];
    return [c('=', ver(M, m, pa, prerelease))];
  }
  const full = m !== undefined && pa !== undefined;
  if (full) return [c(operator as Comparator['operator'], ver(M, m, pa, prerelease))];
  switch (operator) {
    case '>':
      return [c('>=', m === undefined ? ver(M + 1, 0, 0) : ver(M, m + 1, 0))];
    case '>=':
      return [c('>=', ver(M, m ?? 0, 0))];
    case '<':
      return [below(M, m ?? 0, 0)];
    default: // '<='
      return [m === undefined ? below(M + 1, 0, 0) : below(M, m + 1, 0)];
  }
}

const TOKEN_RE = /^(\^|~>?|>=|<=|>|<|=)?(.*)$/;

function parseSet(text: string): ParseResult<readonly Comparator[]> {
  // Allow a space between an operator and its version, as npm does: `>= 1.2.3`.
  const tokens = text.replace(/(\^|~>?|>=|<=|>|<|=)\s+/g, '$1').split(/\s+/).filter((t) => t !== '');
  if (tokens.length === 0) return { ok: true, value: ANY };
  const out: Comparator[] = [];
  for (const token of tokens) {
    const [, operator = '', rest = ''] = TOKEN_RE.exec(token) ?? [];
    const partial = parsePartial(rest);
    if (!partial) return fail(`invalid range part ${quote(token)}`);
    out.push(...desugar(operator, partial));
  }
  return { ok: true, value: out };
}

/**
 * Parses a simple npm range: `^`, `~`, `>`, `>=`, `<`, `<=`, `=`, exact versions,
 * `x`/`*` wildcards and partials (`1.2`), space-separated AND sets and `||`.
 * An empty range means any version. Hyphen ranges, tags (`latest`), URLs and
 * protocols such as `workspace:` or `npm:` are reported as unsupported.
 */
export function parseRange(text: string): ParseResult<Range> {
  const trimmed = text.trim();
  if (trimmed.length > MAX_INPUT_LENGTH) return fail(`range longer than ${MAX_INPUT_LENGTH} characters`);
  if (/\s-\s/.test(trimmed)) return fail(`hyphen ranges are not supported: ${quote(trimmed)}`);
  if (/[:/]/.test(trimmed)) return fail(`not a version range: ${quote(trimmed)}`);
  const sets: (readonly Comparator[])[] = [];
  for (const part of trimmed.split('||')) {
    const set = parseSet(part.trim());
    if (!set.ok) return set;
    sets.push(set.value);
  }
  return { ok: true, value: { sets } };
}

function testComparator(v: SemVer, comparator: Comparator): boolean {
  const cmp = compareVersions(v, comparator.version);
  switch (comparator.operator) {
    case '<':
      return cmp < 0;
    case '<=':
      return cmp <= 0;
    case '>':
      return cmp > 0;
    case '>=':
      return cmp >= 0;
    default:
      return cmp === 0;
  }
}

const sameTuple = (a: SemVer, b: SemVer): boolean => a.major === b.major && a.minor === b.minor && a.patch === b.patch;

function testSet(v: SemVer, set: readonly Comparator[]): boolean {
  if (!set.every((comparator) => testComparator(v, comparator))) return false;
  if (v.prerelease.length === 0) return true;
  // npm rule: a prerelease only matches when the range names a prerelease of the same x.y.z.
  return set.some((comparator) => comparator.version.prerelease.length > 0 && sameTuple(comparator.version, v));
}

/**
 * True when `version` is in `range`, with npm semantics: a prerelease such as
 * `1.3.0-beta` matches only if some comparator in the same set names a prerelease
 * of `1.3.0`, so `^1.2.0` does not match it.
 */
export function satisfies(version: SemVer, range: Range): boolean {
  return range.sets.some((set) => testSet(version, set));
}
