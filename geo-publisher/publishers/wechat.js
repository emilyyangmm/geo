/**
 * 微信公众号发布模块（官方 API）
 * 需要: AppID + AppSecret（服务号或订阅号）
 * 文档: https://developers.weixin.qq.com/doc/offiaccount/Message_Management/
 *
 * 流程: 上传图文素材 → 发布（需在公众号后台手动推送，或用群发接口）
 */

const axios = require('axios');
const { marked } = require('marked');

// 获取 access_token（缓存避免频繁请求）
let tokenCache = {};
async function getAccessToken(appId, appSecret) {
  const now = Date.now();
  if (tokenCache[appId] && tokenCache[appId].expiresAt > now) {
    return tokenCache[appId].token;
  }
  const res = await axios.get('https://api.weixin.qq.com/cgi-bin/token', {
    params: { grant_type: 'client_credential', appid: appId, secret: appSecret },
  });
  if (res.data.errcode) throw new Error(`微信Token获取失败: ${res.data.errmsg}`);
  tokenCache[appId] = { token: res.data.access_token, expiresAt: now + (res.data.expires_in - 60) * 1000 };
  return tokenCache[appId].token;
}

async function publish({ title, content, summary, tags, creds, cookiePath, addLog }) {
  const { appId, appSecret, author = '' } = creds;
  if (!appId || !appSecret) throw new Error('微信公众号需要填写 AppID 和 AppSecret');

  addLog('获取微信 access_token...');
  const token = await getAccessToken(appId, appSecret);

  // Markdown → HTML
  const htmlContent = marked.parse(content || '');

  addLog('上传图文草稿...');
  const draftRes = await axios.post(
    `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${token}`,
    {
      articles: [{
        title,
        author: author || '',
        digest: (summary || '').slice(0, 120),
        content: htmlContent,
        content_source_url: '',
        thumb_media_id: '', // 封面图 media_id，留空则使用默认
        need_open_comment: 1,
        only_fans_can_comment: 0,
      }],
    }
  );

  if (draftRes.data.errcode && draftRes.data.errcode !== 0) {
    throw new Error(`草稿上传失败: ${draftRes.data.errmsg} (code: ${draftRes.data.errcode})`);
  }

  const mediaId = draftRes.data.media_id;
  addLog(`✅ 草稿已上传，media_id: ${mediaId}`);
  addLog('提示：请登录微信公众号后台 → 草稿箱 → 找到此文章 → 发布/群发');
  addLog('或调用群发接口（需要服务号权限）自动推送');

  return {
    mediaId,
    note: '文章已保存至草稿箱，请在微信公众号后台手动发布',
    url: `https://mp.weixin.qq.com/`,
  };
}

module.exports = { publish };
