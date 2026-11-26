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

test('reconciled NH history retains native volume and provider-reported prices', () => {
  const observed = rows.map(row => ({...row, source:'reconciled_live_v1', provider:'nh_plug',
    basis:'nh_reported_regular_session_ohlcv_adjustment_unspecified', volume_unit:'provider_native_unspecified'}));
  const bars = makeAdjustedPriceMap(observed, actions, '2026-09-14');
  assert.deepEqual(bars.NVDA.map(b => b[4]), [100,25]);
  assert.deepEqual(bars.NVDA.map(b => b[5]), [1000,4000]);
});

test('Nasdaq published history is not split-adjusted a second time', () => {
  const observed = [
    {...rows[0], open:25, high:25.75, low:24.25, close:25, volume:4000}, rows[1],
  ].map(row => ({...row, source:'reconciled_live_v1', provider:'nasdaq_historical',
    basis:'nasdaq_reported_historical_ohlcv', volume_unit:'shares'}));
  const bars = makeAdjustedPriceMap(observed, actions, '2026-09-14');
  assert.deepEqual(bars.NVDA.map(b => b[4]), [25,25]);
  assert.deepEqual(bars.NVDA.map(b => b[5]), [4000,4000]);
  assert.throws(() => makeAdjustedPriceMap([{...observed[0],basis:''}], [], '2026-09-14'),
    /Missing provider provenance/);
});
