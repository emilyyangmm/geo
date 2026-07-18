const test = require('node:test');
const assert = require('node:assert/strict');
const { collectReferenceLinks } = require('./collector-core.js');

test('collectReferenceLinks keeps only unique HTTP links', () => {
  const result = collectReferenceLinks([
    { title: '资料 A', href: 'https://example.com/a' },
    { title: '资料 A 重复', href: 'https://example.com/a#section' },
    { title: '忽略', href: 'javascript:alert(1)' },
  ]);
  assert.equal(result, '资料 A | https://example.com/a');
});

test('collectReferenceLinks uses the hostname when a link has no title', () => {
  assert.equal(collectReferenceLinks([{ title: '', href: 'https://example.com/source' }]), 'example.com | https://example.com/source');
});
