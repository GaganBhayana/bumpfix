import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyBump,
  compareVersions,
  formatVersion,
  isBreakingBump,
  MAX_INPUT_LENGTH,
  parseRange,
  parseVersion,
  satisfies,
  type BumpKind,
  type SemVer,
} from './semver.ts';

function v(text: string): SemVer {
  const result = parseVersion(text);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function inRange(version: string, range: string): boolean {
  const parsed = parseRange(range);
  if (!parsed.ok) throw new Error(parsed.error);
  return satisfies(v(version), parsed.value);
}

test('parses full versions with prerelease and build', () => {
  assert.deepEqual(v('1.2.3'), { major: 1, minor: 2, patch: 3, prerelease: [], build: [] });
  assert.deepEqual(v(' v2.0.0-rc.1+build.5 '), { major: 2, minor: 0, patch: 0, prerelease: ['rc', 1], build: ['build', '5'] });
  assert.deepEqual(v('1.0.0-alpha-1.0a.01b').prerelease, ['alpha-1', '0a', '01b']);
  assert.deepEqual(v('0.0.0+001').build, ['001']);
});

const invalidVersions = [
  '',
  '1',
  '1.2',
  '1.2.3.4',
  '01.2.3',
  '1.02.3',
  '1.2.3-01',
  '1.2.3-',
  '1.2.3+',
  '1.2.3-a..b',
  '^1.2.3',
  'latest',
  '99999999999999999.0.0',
  `1.0.0-${'a'.repeat(MAX_INPUT_LENGTH)}`,
];

for (const text of invalidVersions) {
  test(`rejects invalid version ${JSON.stringify(text.slice(0, 30))}`, () => {
    const result = parseVersion(text);
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.error.length > 0);
  });
}

test('formatVersion round-trips', () => {
  for (const text of ['1.2.3', '1.0.0-rc.1', '0.0.1-alpha.beta+exp.sha.5114f85']) {
    assert.equal(formatVersion(v(text)), text);
  }
});

// The precedence list from semver.org section 11, lowest first.
const ordered = [
  '1.0.0-alpha',
  '1.0.0-alpha.1',
  '1.0.0-alpha.beta',
  '1.0.0-beta',
  '1.0.0-beta.2',
  '1.0.0-beta.11',
  '1.0.0-rc.1',
  '1.0.0',
  '1.0.1',
  '1.1.0',
  '2.0.0',
  '10.0.0',
];

test('compareVersions follows semver precedence', () => {
  for (let i = 0; i < ordered.length - 1; i++) {
    const [a, b] = [v(ordered[i] as string), v(ordered[i + 1] as string)];
    assert.equal(compareVersions(a, b), -1, `${ordered[i]} < ${ordered[i + 1]}`);
    assert.equal(compareVersions(b, a), 1, `${ordered[i + 1]} > ${ordered[i]}`);
  }
  assert.equal(compareVersions(v('1.0.0+a'), v('1.0.0+b')), 0);
});

const bumpCases: ReadonlyArray<[string, string, BumpKind]> = [
  ['1.2.3', '2.0.0', 'major'],
  ['1.2.3', '1.3.0', 'minor'],
  ['1.2.3', '1.2.4', 'patch'],
  ['1.0.0-rc.1', '1.0.0', 'prerelease'],
  ['1.0.0-rc.1', '1.0.0-rc.2', 'prerelease'],
  ['1.2.3-beta', '1.3.0', 'minor'],
  ['0.2.3', '0.3.0', 'minor'],
  ['2.0.0', '1.9.9', 'major'],
  ['1.2.3', '1.2.3+build', 'none'],
];

for (const [from, to, kind] of bumpCases) {
  test(`classifyBump ${from} -> ${to} is ${kind}`, () => {
    assert.equal(classifyBump(v(from), v(to)), kind);
  });
}

const breakingCases: ReadonlyArray<[string, string, boolean]> = [
  ['1.2.3', '1.9.0', false],
  ['1.2.3', '2.0.0', true],
  ['1.2.3', '2.0.0-beta.1', true],
  ['0.2.3', '0.2.9', false],
  ['0.2.3', '0.3.0', true],
  ['0.0.3', '0.0.4', true],
  ['2.0.0', '1.0.0', false],
];

for (const [from, to, breaking] of breakingCases) {
  test(`isBreakingBump ${from} -> ${to} is ${breaking}`, () => {
    assert.equal(isBreakingBump(v(from), v(to)), breaking);
  });
}

const rangeCases: ReadonlyArray<[string, string, boolean]> = [
  // caret
  ['^1.2.3', '1.2.3', true],
  ['^1.2.3', '1.9.9', true],
  ['^1.2.3', '2.0.0', false],
  ['^1.2.3', '1.2.2', false],
  ['^1.2.3', '2.0.0-0', false],
  ['^0.2.3', '0.2.9', true],
  ['^0.2.3', '0.3.0', false],
  ['^0.0.3', '0.0.3', true],
  ['^0.0.3', '0.0.4', false],
  ['^0.0', '0.0.9', true],
  ['^0.0', '0.1.0', false],
  ['^0.x', '0.9.0', true],
  ['^0.x', '1.0.0', false],
  ['^1.x', '1.5.0', true],
  ['^0.0.x', '0.0.7', true],
  ['^1.2.3-beta.2', '1.2.3-beta.4', true],
  ['^1.2.3-beta.2', '1.2.4-beta.1', false],
  ['^1.2.3', '1.3.0-beta', false],
  // tilde
  ['~1.2.3', '1.2.9', true],
  ['~1.2.3', '1.3.0', false],
  ['~1.2', '1.2.0', true],
  ['~1', '1.9.0', true],
  ['~1', '2.0.0', false],
  ['~0.2.3', '0.2.5', true],
  ['~>1.2.3', '1.2.4', true],
  // comparators
  ['>=1.2.3', '1.2.3', true],
  ['>=1.2.3', '1.2.2', false],
  ['>1.2.3', '1.2.3', false],
  ['>1.2', '1.3.0', true],
  ['>1.2', '1.2.9', false],
  ['<2', '1.9.9', true],
  ['<2', '2.0.0-beta', false],
  ['<=1.2', '1.2.9', true],
  ['<=1.2', '1.3.0', false],
  ['=1.2.3', '1.2.3', true],
  ['>= 1.2.3 < 2', '1.5.0', true],
  ['>=1.2.3 <2', '2.0.0', false],
  // x-ranges and exact
  ['1.2.x', '1.2.7', true],
  ['1.2.x', '1.3.0', false],
  ['1.x', '1.8.0', true],
  ['1.X.3', '1.0.0', true],
  ['*', '3.4.5', true],
  ['*', '1.0.0-beta', false],
  ['', '0.0.1', true],
  ['1.2', '1.2.5', true],
  ['1.2.3', '1.2.3', true],
  ['1.2.3', '1.2.4', false],
  ['v1.2.3', '1.2.3', true],
  ['1.0.0-rc.1', '1.0.0-rc.1', true],
  // or
  ['^1.0.0 || ^2.0.0', '2.3.0', true],
  ['^1.0.0 || ^2.0.0', '3.0.0', false],
  ['1.2.3 || >=2.0.0-beta.1 <2.0.0', '2.0.0-beta.3', true],
  ['>*', '1.0.0', false],
];

for (const [range, version, expected] of rangeCases) {
  test(`${version} ${expected ? 'satisfies' : 'does not satisfy'} "${range}"`, () => {
    assert.equal(inRange(version, range), expected);
  });
}

const badRanges = [
  '1.2.3 - 2.3.4',
  'latest',
  'workspace:^1.0.0',
  'npm:left-pad@1.3.0',
  'github:owner/repo',
  '^1.2.x-beta',
  '>=a.b.c',
  '^^1.2.3',
  '1.2.3 || foo',
  'x'.repeat(MAX_INPUT_LENGTH + 1),
];

for (const range of badRanges) {
  test(`rejects unsupported range ${JSON.stringify(range.slice(0, 30))}`, () => {
    assert.equal(parseRange(range).ok, false);
  });
}

test('parseRange returns comparators npm would use', () => {
  const result = parseRange('^0.2.3');
  assert.deepEqual(result, {
    ok: true,
    value: {
      sets: [
        [
          { operator: '>=', version: { major: 0, minor: 2, patch: 3, prerelease: [], build: [] } },
          { operator: '<', version: { major: 0, minor: 3, patch: 0, prerelease: [0], build: [] } },
        ],
      ],
    },
  });
});
