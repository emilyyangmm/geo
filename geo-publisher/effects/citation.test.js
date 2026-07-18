const test = require('node:test');
const assert = require('node:assert/strict');

const { matchPublicationSources, normalizePublicationUrl } = require('./citation');

test('normalizes tracking parameters before comparing published URLs', () => {
  assert.equal(
    normalizePublicationUrl('https://zhuanlan.zhihu.com/p/12345?utm_source=doubao#comments'),
    'https://zhuanlan.zhihu.com/p/12345'
  );
});

test('matches an AI reference URL to a confirmed published article', () => {
  const result = matchPublicationSources({
    publications: [{
      id: 'publication-1',
      platform: 'zhihu',
      article_title: '惠州龙门地派、云顶、富力希尔顿温泉对比怎么选',
      published_url: 'https://zhuanlan.zhihu.com/p/2048713298984558615',
      status: 'confirmed'
    }],
    sourceRefs: ['https://zhuanlan.zhihu.com/p/2048713298984558615?utm_source=doubao']
  });

  assert.equal(result.citedPublicationCount, 1);
  assert.equal(result.matches[0].matchType, 'exact_url');
  assert.equal(result.unmatchedSources.length, 0);
});

test('does not count a pending publication or an unrelated source as cited', () => {
  const result = matchPublicationSources({
    publications: [{
      id: 'publication-1',
      platform: 'toutiao',
      article_title: '温泉对比怎么选',
      published_url: 'https://www.toutiao.com/article/111',
      status: 'pending_confirmation'
    }],
    sourceRefs: ['https://www.toutiao.com/article/111', 'https://example.com/article/other']
  });

  assert.equal(result.citedPublicationCount, 0);
  assert.equal(result.matches.length, 0);
  assert.equal(result.unmatchedSources.length, 2);
});

test('matches a source title only when the same confirmed platform is explicitly supplied', () => {
  const result = matchPublicationSources({
    publications: [{
      id: 'publication-1',
      platform: 'baijiahao',
      article_title: '惠州龙门地派、云顶、富力希尔顿温泉对比怎么选',
      published_url: 'https://baijiahao.baidu.com/s?id=1',
      status: 'confirmed'
    }],
    sourceRefs: [{ platform: 'baijiahao', title: '惠州龙门地派、云顶、富力希尔顿温泉对比怎么选' }]
  });

  assert.equal(result.citedPublicationCount, 1);
  assert.equal(result.matches[0].matchType, 'platform_title');
});
