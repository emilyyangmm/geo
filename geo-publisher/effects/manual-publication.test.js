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

test('effect page imports collector clipboard lines with title and URL', () => {
  assert.match(page, /function parseReferenceClipboard\(text\)/);
  assert.match(page, /navigator\.clipboard\.readText\(\)/);
  assert.match(page, /从剪贴板导入引用/);
});

test('effect scan records show saved sources and their citation match result', () => {
  assert.match(page, /已采集参考链接/);
  assert.match(page, /已匹配发布链接/);
  assert.match(page, /未匹配参考链接/);
});
