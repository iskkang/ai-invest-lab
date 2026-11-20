import test from 'node:test';
import assert from 'node:assert/strict';
import { makeAdjustedPriceMap } from '../lib/price-adjust.ts';

const rows = [
  { symbol: 'NVDA', trade_date: '2026-09-11', open: 100, high: 103, low: 97, close: 100, volume: 1000 },
  { symbol: 'NVDA', trade_date: '2026-09-14', open: 25, high: 26, low: 24, close: 25, volume: 4000 },
  { symbol: 'KO', trade_date: '2026-09-11', open: 70, high: 71, low: 69, close: 70, volume: 800 },
];
const actions = [
  { symbol: 'NVDA', kind: 'split', ex_date: '2026-09-14', ratio: 4 },
  { symbol: 'NVDA', kind: 'split', ex_date: '2026-11-16', ratio: 2 },
];

test('an upcoming split cannot adjust past chart data', () => {
  const bars = makeAdjustedPriceMap(rows, actions, '2026-09-11');
  assert.equal(bars.NVDA[0][4], 100);
  assert.equal(bars.NVDA[0][5], 1000);
  assert.equal(bars.NVDA.length, 1);
});

test('only elapsed split ratios adjust OHLC and volume', () => {
  const bars = makeAdjustedPriceMap(rows, actions, '2026-09-14');
  assert.deepEqual(bars.NVDA.map((b) => b[4]), [25, 25]);
  assert.deepEqual(bars.NVDA.map((b) => b[5]), [4000, 4000]);
  assert.equal(bars.KO[0][4], 70);
});

test('chart covers untraded symbols and sorts by trade date', () => {
  const unsorted = [rows[1], rows[0], rows[2]];
  const bars = makeAdjustedPriceMap(unsorted, actions, '2026-09-14');
  assert.deepEqual(bars.NVDA.map((b) => b[0]), ['2026-09-11', '2026-09-14']);
  assert.ok('KO' in bars);
});
