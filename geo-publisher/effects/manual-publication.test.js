const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const page = fs.readFileSync(path.join(__dirname, '..', '..', 'geo-studio.html'), 'utf8');

test('manual publication creation is protected by the save error handler', () => {
  const saveHandler = page.match(/async function saveManualPublication\(\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(saveHandler, /try \{[\s\S]*createManualEffectArticle\(manualTitle\)/);
});

test('manual publication reuses the loaded campaign before creating one', () => {
  assert.match(page, /const campaign = state\.effectCampaign \|\| await ensureEffectCampaign\(\);/);
});

test('manual publication supports one confirmed URL for each selected platform', () => {
  assert.match(page, /#publicationPlatforms input:checked/);
  assert.match(page, /publishedUrls\.length !== platforms\.length/);
  assert.match(page, /for \(const \[index, platform\] of platforms\.entries\(\)\)/);
});
