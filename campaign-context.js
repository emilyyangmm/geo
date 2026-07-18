(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GeoCampaignContext = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function pickProductFromHistory(history) {
    const articles = Array.isArray(history) ? history : [];
    const latest = articles
      .filter(article => String(article?.productName || '').trim())
      .sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0))[0];

    if (!latest) return null;
    return {
      name: String(latest.productName).trim(),
      category: Array.isArray(latest.tags) ? String(latest.tags[0] || '').trim() : '',
    };
  }

  return { pickProductFromHistory };
});
