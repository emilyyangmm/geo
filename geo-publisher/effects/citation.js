function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-—_、，,。！？!?:：；;（）()【】\[\]"'“”‘’]/g, '');
}

function normalizePublicationUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const url = new URL(raw);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|spm$|from$|source$|share_|referer$)/i.test(key)) url.searchParams.delete(key);
    }
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/$/, '');
    return url.toString().replace(/\?$/, '');
  } catch {
    return '';
  }
}

function normalizeSourceRef(source) {
  if (typeof source === 'string') return { url: source, title: '', platform: '' };
  return {
    url: String(source?.url || '').trim(),
    title: String(source?.title || '').trim(),
    platform: String(source?.platform || '').trim().toLowerCase()
  };
}

function matchPublicationSources({ publications = [], sourceRefs = [] } = {}) {
  const confirmed = publications.filter((publication) => publication?.status === 'confirmed');
  const matches = [];
  const unmatchedSources = [];
  const seenPublicationIds = new Set();

  for (const rawSource of sourceRefs) {
    const source = normalizeSourceRef(rawSource);
    const normalizedUrl = normalizePublicationUrl(source.url);
    let matched = normalizedUrl
      ? confirmed.find((publication) => normalizePublicationUrl(publication.published_url) === normalizedUrl)
      : null;
    let matchType = matched ? 'exact_url' : '';

    if (!matched && source.platform && source.title) {
      const normalizedTitle = normalizeText(source.title);
      matched = confirmed.find((publication) => (
        String(publication.platform || '').toLowerCase() === source.platform
        && normalizeText(publication.article_title) === normalizedTitle
      ));
      if (matched) matchType = 'platform_title';
    }

    if (!matched) {
      unmatchedSources.push(source);
      continue;
    }

    if (!seenPublicationIds.has(matched.id)) {
      seenPublicationIds.add(matched.id);
      matches.push({
        publicationId: matched.id,
        platform: matched.platform,
        publishedUrl: matched.published_url,
        articleTitle: matched.article_title,
        sourceUrl: source.url,
        sourceTitle: source.title,
        matchType
      });
    }
  }

  return {
    citedPublicationCount: matches.length,
    matches,
    unmatchedSources
  };
}

module.exports = {
  matchPublicationSources,
  normalizePublicationUrl,
  normalizeText
};
