const test = require('node:test');
const assert = require('node:assert/strict');

const { pickProductFromHistory } = require('../../campaign-context');

test('restores the most recently saved product from article history', () => {
  const product = pickProductFromHistory([
    { savedAt: '2026-07-16T10:00:00.000Z', productName: '旧产品' },
    { savedAt: '2026-07-18T10:00:00.000Z', productName: '当前产品', tags: ['电池'] },
  ]);

  assert.deepEqual(product, { name: '当前产品', category: '电池' });
});

test('returns null when history does not contain a product name', () => {
  assert.equal(pickProductFromHistory([{ savedAt: '2026-07-18T10:00:00.000Z', title: '无产品记录' }]), null);
});
