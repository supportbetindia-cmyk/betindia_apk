import assert from 'node:assert/strict';
import test from 'node:test';
import { rowsToCsv } from '../lib/csv.ts';

test('header-only when no rows', () => {
  assert.equal(rowsToCsv([], ['a', 'b']), 'a,b\n');
});

test('quotes and escapes special characters', () => {
  const out = rowsToCsv([{ a: 'x,y', b: 'he "said"' }], ['a', 'b']);
  assert.equal(out, 'a,b\n"x,y","he ""said"""\n');
});

test('neutralizes formula injection; blanks for null; plain numbers', () => {
  const out = rowsToCsv([{ a: '=1+1', b: null, c: 100 }], ['a', 'b', 'c']);
  assert.equal(out, "a,b,c\n'=1+1,,100\n");
});
