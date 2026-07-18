const test = require('node:test');
const assert = require('node:assert/strict');

const { analyzeAiAnswer, classifySentiment } = require('./analysis');

test('识别品牌提及、推荐倾向和竞品', () => {
  const result = analyzeAiAnswer({
    answerText: '选择电动车电池时，我更推荐喵喵电池的磷酸铁锂系列。它比星火电池更适合通勤场景。',
    brandName: '喵喵',
    productName: '喵喵电池',
    competitors: ['星火电池', '远航电池']
  });

  assert.equal(result.mentionsBrand, true);
  assert.equal(result.mentionCount, 2);
  assert.equal(result.sentiment, 'recommended');
  assert.deepEqual(result.competitorsFound, ['星火电池']);
});

test('负面关键词优先于正面关键词', () => {
  const result = analyzeAiAnswer({
    answerText: '虽然有人推荐喵喵电池，但近期投诉较多，建议慎选。',
    brandName: '喵喵',
    productName: '喵喵电池'
  });

  assert.equal(result.mentionsBrand, true);
  assert.equal(result.sentiment, 'negative');
});

test('空答案或未提及品牌时不制造结论', () => {
  const result = analyzeAiAnswer({
    answerText: '',
    brandName: '喵喵',
    productName: '喵喵电池',
    competitors: ['星火电池']
  });

  assert.equal(result.mentionsBrand, false);
  assert.equal(result.mentionCount, 0);
  assert.equal(result.sentiment, 'unknown');
  assert.deepEqual(result.competitorsFound, []);
});

test('does not leak regex state between independent answers', () => {
  assert.equal(classifySentiment('推荐这个产品', true), 'recommended');
  assert.equal(classifySentiment('推荐这个产品', true), 'recommended');
});
