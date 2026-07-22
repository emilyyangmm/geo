const test = require('node:test');
const assert = require('node:assert/strict');
const { canManuallyLoginToZhihu } = require('./zhihu');

test('online Linux publisher does not wait for an invisible Zhihu login window', () => {
  assert.equal(canManuallyLoginToZhihu('linux', ''), false);
});

test('desktop publisher can keep the manual Zhihu login flow', () => {
  assert.equal(canManuallyLoginToZhihu('win32', ''), true);
  assert.equal(canManuallyLoginToZhihu('linux', ':0'), true);
});
