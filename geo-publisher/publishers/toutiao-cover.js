function extractToutiaoCoverInfo(payload) {
  if (!payload || typeof payload !== 'object' || !payload.infos || typeof payload.infos !== 'object') {
    return null;
  }

  const [key, info] = Object.entries(payload.infos)[0] || [];
  if (!key || !info || typeof info !== 'object') return null;

  return {
    key,
    uri: info.uri || key,
    url: info.url || '',
    width: Number(info.width) || 0,
    height: Number(info.height) || 0,
    md5: info.md5 || '',
  };
}

module.exports = { extractToutiaoCoverInfo };
