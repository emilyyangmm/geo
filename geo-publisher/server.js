/**
 * GEO Studio 一键发布服务
 * 运行方式: node server.js
 * 默认端口: 3001
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(cors());
app.use(express.json({ limit: '20mb' }));

const CONFIG_PATH = path.join(__dirname, 'config.json');
const COOKIES_DIR = path.join(__dirname, 'cookies');
const MANUAL_LOGIN_PLATFORMS = new Set(['zhihu', 'toutiao', 'baijiahao', 'sohu']);
const COOKIE_DOMAINS = {
  zhihu: '.zhihu.com',
  toutiao: '.toutiao.com',
  baijiahao: '.baidu.com',
  sohu: '.sohu.com',
};

// 确保目录存在
if (!fs.existsSync(COOKIES_DIR)) fs.mkdirSync(COOKIES_DIR, { recursive: true });

// 内存任务队列
const jobs = {};

// ===================== 配置管理 =====================
function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return { platforms: {} };
  }
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// ===================== 健康检查 =====================
app.get('/api/status', (req, res) => {
  const config = loadConfig();
  const configured = new Set(Object.keys(config.platforms || {}).filter(
    p => config.platforms[p]?.username || config.platforms[p]?.appId
  ));
  for (const platform of Object.keys(COOKIE_DOMAINS)) {
    if (fs.existsSync(path.join(COOKIES_DIR, `${platform}.json`))) configured.add(platform);
  }
  res.json({ ok: true, configured: [...configured] });
});

// ===================== 获取配置（脱敏） =====================
app.get('/api/config', (req, res) => {
  const config = loadConfig();
  const safe = { platforms: {} };
  for (const [p, creds] of Object.entries(config.platforms || {})) {
    safe.platforms[p] = {
      ...creds,
      password: creds.password ? '●●●●●●' : '',
      appSecret: creds.appSecret ? '●●●●●●' : '',
    };
  }
  res.json(safe);
});

// ===================== 保存配置 =====================
app.post('/api/config', (req, res) => {
  const config = loadConfig();
  const incoming = req.body.platforms || {};

  for (const [platform, creds] of Object.entries(incoming)) {
    const existing = config.platforms?.[platform] || {};
    // 不覆盖已有的密码（前端传来脱敏占位符时）
    const password = creds.password && !creds.password.startsWith('●')
      ? creds.password : existing.password;
    const appSecret = creds.appSecret && !creds.appSecret.startsWith('●')
      ? creds.appSecret : existing.appSecret;
    config.platforms[platform] = { ...existing, ...creds, password, appSecret };
  }

  saveConfig(config);
  res.json({ success: true });
});

// ===================== 清除某平台 Cookie（强制重新登录） =====================
app.delete('/api/cookies/:platform', (req, res) => {
  const cookiePath = path.join(COOKIES_DIR, `${req.params.platform}.json`);
  if (fs.existsSync(cookiePath)) fs.unlinkSync(cookiePath);
  res.json({ success: true });
});

function normalizeCookie(cookie, fallbackDomain) {
  const name = String(cookie.name || '').trim();
  const value = String(cookie.value || '');
  if (!name) return null;
  return {
    name,
    value,
    domain: cookie.domain || fallbackDomain,
    path: cookie.path || '/',
    expires: typeof cookie.expires === 'number' ? cookie.expires : undefined,
    httpOnly: Boolean(cookie.httpOnly),
    secure: cookie.secure !== false,
    sameSite: ['Strict', 'Lax', 'None'].includes(cookie.sameSite) ? cookie.sameSite : 'Lax',
  };
}

function parseCookieInput(raw, fallbackDomain) {
  const text = String(raw || '').trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    const list = Array.isArray(parsed) ? parsed : parsed.cookies;
    if (Array.isArray(list)) {
      return list.map(cookie => normalizeCookie(cookie, fallbackDomain)).filter(Boolean);
    }
  } catch {}

  return text
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const eq = part.indexOf('=');
      if (eq <= 0) return null;
      return normalizeCookie({
        name: part.slice(0, eq).trim(),
        value: part.slice(eq + 1).trim(),
      }, fallbackDomain);
    })
    .filter(Boolean);
}

// ===================== 手动导入 Cookie =====================
app.post('/api/cookies/:platform/import', (req, res) => {
  const platform = req.params.platform;
  const domain = COOKIE_DOMAINS[platform];
  if (!domain) return res.status(400).json({ error: `不支持导入 Cookie 的平台: ${platform}` });

  const cookies = parseCookieInput(req.body.cookie || req.body.cookies || '', domain);
  if (!cookies.length) return res.status(400).json({ error: '没有识别到有效 Cookie' });

  fs.writeFileSync(path.join(COOKIES_DIR, `${platform}.json`), JSON.stringify(cookies, null, 2));
  res.json({ success: true, count: cookies.length });
});

// ===================== 单平台发布 =====================
app.post('/api/publish', async (req, res) => {
  const { platform, title, content, summary = '', tags = [] } = req.body;
  const config = loadConfig();
  const creds = config.platforms?.[platform] || {};

  if (!MANUAL_LOGIN_PLATFORMS.has(platform) && !creds.username && !creds.appId) {
    return res.status(400).json({ error: `平台 ${platform} 未配置账号` });
  }

  const jobId = uuidv4();
  jobs[jobId] = { status: 'running', platform, title, log: [] };

  // 异步执行
  (async () => {
    const addLog = (msg) => {
      jobs[jobId].log.push(`[${new Date().toLocaleTimeString('zh-CN')}] ${msg}`);
      console.log(`[${platform}] ${msg}`);
    };

    try {
      let publisherPath = path.join(__dirname, 'publishers', `${platform}.js`);
      if (!fs.existsSync(publisherPath)) throw new Error(`暂不支持平台: ${platform}`);

      const publisher = require(publisherPath);
      const cookiePath = path.join(COOKIES_DIR, `${platform}.json`);

      const result = await publisher.publish({
        title, content, summary, tags, creds,
        cookiePath, addLog,
      });

      jobs[jobId].status = 'done';
      jobs[jobId].result = result;
      addLog(`✅ 发布成功` + (result.url ? `：${result.url}` : ''));
    } catch (e) {
      jobs[jobId].status = 'error';
      jobs[jobId].error = e.message;
      addLog(`❌ 失败：${e.message}`);
    }
  })();

  res.json({ jobId });
});

// ===================== 批量发布 =====================
app.post('/api/publish/batch', async (req, res) => {
  const { platforms, title, content, summary = '', tags = [] } = req.body;
  const jobIds = {};

  for (const platform of platforms) {
    const r = await fetch(`http://localhost:3001/api/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, title, content, summary, tags }),
    });
    const d = await r.json();
    jobIds[platform] = d.jobId;
  }

  res.json({ jobIds });
});

// ===================== 查询任务状态 =====================
app.get('/api/job/:jobId', (req, res) => {
  const job = jobs[req.params.jobId];
  if (!job) return res.status(404).json({ error: 'job not found' });
  res.json(job);
});

// ===================== 启动 =====================
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`\n🚀 GEO Publisher 已启动: http://localhost:${PORT}`);
  console.log(`📁 配置文件: ${CONFIG_PATH}`);
  console.log(`🍪 Cookie缓存: ${COOKIES_DIR}`);
  console.log(`\n保持此窗口运行，然后在浏览器打开 geo-studio.html 即可使用\n`);
});
