const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('CloudBase colleague page uses the production GEO API endpoint', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'geo-studio.html'), 'utf8');

  assert.match(
    html,
    /tcloudbaseapp\.com[\s\S]*https:\/\/geo\.miaomiaxiaoxianer\.cn\/geo-api/,
  );
});
