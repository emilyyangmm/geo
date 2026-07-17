const test = require('node:test');
const assert = require('node:assert/strict');

const { extractToutiaoCoverInfo } = require('./toutiao-cover');

test('extracts the uploaded Toutiao image metadata from photo info responses', () => {
  const result = extractToutiaoCoverInfo({
    code: 0,
    infos: {
      'tos-cn-i-6w9my0ksvp/example-cover': {
        uri: 'tos-cn-i-6w9my0ksvp/example-cover',
        url: 'https://image-tt-private.toutiao.com/tos-cn-i-6w9my0ksvp/example-cover',
        width: 900,
        height: 900,
        md5: 'cover-md5',
      },
    },
  });

  assert.deepEqual(result, {
    key: 'tos-cn-i-6w9my0ksvp/example-cover',
    uri: 'tos-cn-i-6w9my0ksvp/example-cover',
    url: 'https://image-tt-private.toutiao.com/tos-cn-i-6w9my0ksvp/example-cover',
    width: 900,
    height: 900,
    md5: 'cover-md5',
  });
});
