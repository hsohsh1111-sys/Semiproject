import test from 'node:test'
import assert from 'node:assert/strict'
import { getDemoPriceHistory } from './priceHistoryDemo.js'

function localDate(value) {
  const date = new Date(value)
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
}

test('example covers one year with thirteen monthly observations', () => {
  const history = getDemoPriceHistory(100, 'coat', new Date(2026, 10, 12))
  assert.equal(history.length, 13)
  assert.deepEqual(localDate(history[0].observedAt), [2025, 11, 12])
  assert.deepEqual(localDate(history.at(-1).observedAt), [2026, 11, 12])
  assert.equal(new Set(history.map((point) => point.price)).size > 1, true)
  assert.ok(history.every((point) => point.price >= 87 && point.price <= 113))
  assert.equal(history.at(-1).price, 100)
  assert.ok(history.every((point, index) => index === 0 || Date.parse(point.observedAt) > Date.parse(history[index - 1].observedAt)))
})

test('month ends and leap days are clamped without skipping months', () => {
  const march = getDemoPriceHistory(100, 'coat', new Date(2026, 2, 31))
  assert.deepEqual(localDate(march.at(-2).observedAt), [2026, 2, 28])
  assert.deepEqual(localDate(march.at(-1).observedAt), [2026, 3, 31])
  const leap = getDemoPriceHistory(100, 'coat', new Date(2024, 1, 29))
  assert.deepEqual(localDate(leap[0].observedAt), [2023, 2, 28])
  assert.deepEqual(localDate(leap.at(-1).observedAt), [2024, 2, 29])
})

test('invalid dates are rejected', () => {
  assert.throws(() => getDemoPriceHistory(100, 'coat', new Date('invalid')), TypeError)
})

test('example follows the selected price, preserving cents and zero', () => {
  const today = new Date(2026, 10, 12)
  const first = getDemoPriceHistory(35.75, 'coat', today)
  const second = getDemoPriceHistory(120, 'knit', today)
  assert.equal(first.at(-1).price, 35.75)
  assert.equal(second.at(-1).price, 120)
  assert.notDeepEqual(first.map((point) => point.price), second.map((point) => point.price))
  assert.ok(getDemoPriceHistory(0, 'coat', today).every((point) => point.price === 0))
  assert.throws(() => getDemoPriceHistory(-1, 'coat', today), TypeError)
  assert.throws(() => getDemoPriceHistory(NaN, 'coat', today), TypeError)
  assert.throws(() => getDemoPriceHistory(100, '', today), TypeError)
})

test('patterns vary by product even at the same price and stay stable across reloads', () => {
  const today = new Date(2026, 10, 12)
  const coat = getDemoPriceHistory(100, 'coat', today)
  const knit = getDemoPriceHistory(100, 'knit', today)
  assert.notDeepEqual(coat.map((point) => point.price), knit.map((point) => point.price))
  assert.deepEqual(coat, getDemoPriceHistory(100, 'coat', today))
  const nextMonth = getDemoPriceHistory(100, 'coat', new Date(2026, 11, 12))
  assert.deepEqual(coat.slice(1, -1), nextMonth.slice(0, -2))
})
