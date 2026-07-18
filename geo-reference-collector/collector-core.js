(function initCollector(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GeoReferenceCollector = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCollector() {
  function normalizeHttpUrl(value) {
    try {
      const url = new URL(String(value || '').trim());
      if (!['http:', 'https:'].includes(url.protocol)) return '';
      url.hash = '';
      return url.toString();
    } catch {
      return '';
    }
  }

  function collectReferenceLinks(links) {
    const seen = new Set();
    return (Array.isArray(links) ? links : []).flatMap(({ title, href }) => {
      const url = normalizeHttpUrl(href);
      if (!url || seen.has(url)) return [];
      seen.add(url);
      const safeTitle = String(title || new URL(url).hostname).replace(/\s+/g, ' ').trim().slice(0, 160);
      return [`${safeTitle} | ${url}`];
    }).join('\n');
  }

  return { normalizeHttpUrl, collectReferenceLinks };
});
