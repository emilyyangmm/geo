const SENTIMENT_PATTERNS = {
  negative: /不推荐|避坑|投诉|差评|风险|慎选|不建议|劣质|失望/g,
  recommended: /首选|强烈推荐|推荐|值得买|优先选择|优先考虑/g,
  positive: /不错|可靠|口碑好|优势|表现优秀|满意|好评/g
};

function normalizeText(value) {
  return String(value || '').trim();
}

function countOccurrences(text, term) {
  if (!term) return 0;
  return text.split(term).length - 1;
}

function findTerm(text, term) {
  if (!term) return -1;
  return text.indexOf(term);
}

function uniqueTerms(values) {
  return [...new Set(values.map(normalizeText).filter(Boolean))];
}

function patternMatches(pattern, text) {
  pattern.lastIndex = 0;
  return pattern.test(text);
}

function classifySentiment(answerText, mentionsBrand) {
  if (!mentionsBrand) return 'unknown';
  if (patternMatches(SENTIMENT_PATTERNS.negative, answerText)) return 'negative';
  if (patternMatches(SENTIMENT_PATTERNS.recommended, answerText)) return 'recommended';
  if (patternMatches(SENTIMENT_PATTERNS.positive, answerText)) return 'positive';
  return 'neutral';
}

function analyzeAiAnswer({ answerText, brandName, productName, competitors = [] } = {}) {
  const text = normalizeText(answerText);
  const brandTerms = uniqueTerms([brandName, productName]);
  const matchedTerms = brandTerms.filter((term) => text.includes(term));
  const mentionCount = matchedTerms.reduce((total, term) => total + countOccurrences(text, term), 0);
  const mentionIndexes = matchedTerms.map((term) => findTerm(text, term)).filter((index) => index >= 0);
  const competitorsFound = uniqueTerms(competitors).filter((term) => text.includes(term));

  return {
    mentionsBrand: matchedTerms.length > 0,
    mentionCount,
    firstMentionIndex: mentionIndexes.length ? Math.min(...mentionIndexes) : null,
    matchedTerms,
    competitorsFound,
    sentiment: classifySentiment(text, matchedTerms.length > 0)
  };
}

module.exports = {
  analyzeAiAnswer,
  classifySentiment,
  normalizeText
};
