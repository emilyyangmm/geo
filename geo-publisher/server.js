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
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-GEO-User-Id');
  res.header('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(cors());
app.use(express.json({ limit: '20mb' }));

const CONFIG_PATH = path.join(__dirname, 'config.json');
const COOKIES_DIR = path.join(__dirname, 'cookies');
const SITE_ROOT = path.resolve(__dirname, '..');
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nhpelzwccvqdcstbxwvf.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_NBXXIzCYMR-2GWgMjB1Z3A_lAGU84py';
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
let publishQueue = Promise.resolve();

function enqueuePublish(task) {
  publishQueue = publishQueue.then(task, task);
  return publishQueue;
}

function safeUserId(userId) {
  return String(userId || 'anonymous').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function getUserDir(userId) {
  const dir = path.join(COOKIES_DIR, safeUserId(userId));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getUserConfigPath(userId) {
  return path.join(getUserDir(userId), 'config.json');
}

async function getSupabaseUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return null;
  const decoded = decodeSupabaseToken(token);
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
    });
    if (response.ok) return response.json();
  } catch {}
  return decoded;
}

function decodeSupabaseToken(token) {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const claims = JSON.parse(json);
    if (!claims.sub) return null;
    if (claims.exp && claims.exp * 1000 < Date.now()) return null;
    return {
      id: claims.sub,
      email: claims.email || claims.user_metadata?.email || '',
    };
  } catch {
    return null;
  }
}

async function requireUser(req, res, next) {
  try {
    const user = await getSupabaseUser(req);
    if (!user?.id) return res.status(401).json({ error: '请先登录 GEO Studio' });
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: '登录状态校验失败，请重新登录' });
  }
}

// ===================== 配置管理 =====================
function loadConfig(configPath = CONFIG_PATH) {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return { platforms: {} };
  }
}

function saveConfig(config, configPath = CONFIG_PATH) {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// ===================== 健康检查 =====================
app.get('/api/status', async (req, res) => {
  const user = await getSupabaseUser(req).catch(() => null);
  if (!user?.id) return res.json({ ok: true, configured: [], auth: false });
  const baseDir = getUserDir(user.id);
  const config = loadConfig(getUserConfigPath(user.id));
  const configured = new Set(Object.keys(config.platforms || {}).filter(
    p => config.platforms[p]?.username || config.platforms[p]?.appId
  ));
  for (const platform of Object.keys(COOKIE_DOMAINS)) {
    if (fs.existsSync(path.join(baseDir, `${platform}.json`))) configured.add(platform);
  }
  res.json({ ok: true, configured: [...configured], auth: true, email: user.email || '' });
});

// ===================== 简易 Cookie 导入页面 =====================
app.get('/', (req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>GEO Publisher</title>
  <style>
    body { margin: 0; font-family: "Microsoft YaHei", Arial, sans-serif; background: #0b1020; color: #eef2ff; }
    main { max-width: 860px; margin: 40px auto; padding: 0 20px; }
    .card { background: #121a2f; border: 1px solid #24304d; border-radius: 10px; padding: 20px; }
    h1 { margin: 0 0 8px; font-size: 24px; }
    p { color: #9ca8c8; line-height: 1.7; }
    label { display: block; margin: 14px 0 6px; color: #cbd5e1; font-size: 13px; }
    select, textarea { width: 100%; box-sizing: border-box; border-radius: 8px; border: 1px solid #33415f; background: #0f172a; color: #eef2ff; padding: 10px 12px; font-size: 14px; }
    textarea { min-height: 180px; resize: vertical; }
    button { margin-top: 14px; border: 0; border-radius: 8px; background: #7cff4f; color: #06111f; font-weight: 700; padding: 11px 16px; cursor: pointer; }
    .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .muted { font-size: 12px; color: #7d8bad; }
    #result { margin-top: 14px; font-size: 14px; }
    a { color: #8bd3ff; }
  </style>
</head>
<body>
  <main>
    <div class="card">
      <h1>GEO Publisher Cookie 导入</h1>
      <p>把你已经登录平台后复制出来的 Cookie 粘到这里。支持 <code>name=value; name2=value2</code>，也支持 Cookie JSON 数组。</p>
      <label>平台</label>
      <select id="platform">
        <option value="zhihu">知乎 zhihu</option>
        <option value="toutiao">今日头条 toutiao</option>
        <option value="baijiahao">百家号 baijiahao</option>
        <option value="sohu">搜狐号 sohu</option>
      </select>
      <label>Cookie</label>
      <textarea id="cookie" placeholder="在这里粘贴 Cookie"></textarea>
      <div class="row">
        <button onclick="importCookie()">保存 Cookie</button>
        <span class="muted">Cookie 等于登录态，只保存在本机，不要发给别人。</span>
      </div>
      <div id="result"></div>
      <p class="muted">主页面：<a href="https://geo.miaomiaoxiaoxianer.cn/geo-studio.html">geo-studio.html</a></p>
    </div>
  </main>
  <script>
    async function importCookie() {
      const platform = document.getElementById('platform').value;
      const cookie = document.getElementById('cookie').value;
      const result = document.getElementById('result');
      if (!cookie.trim()) {
        result.textContent = '请先粘贴 Cookie';
        result.style.color = '#ffb86b';
        return;
      }
      try {
        const res = await fetch('/api/cookies/' + platform + '/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cookie }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '导入失败');
        result.textContent = '保存成功：' + platform + '，共 ' + data.count + ' 条 Cookie';
        result.style.color = '#7cff4f';
        document.getElementById('cookie').value = '';
      } catch (e) {
        result.textContent = '保存失败：' + e.message;
        result.style.color = '#ff6b6b';
      }
    }
  </script>
</body>
</html>`);
});

// ===================== 本地 GEO Studio 页面 =====================
app.get('/geo-studio.html', (req, res) => {
  res.sendFile(path.join(SITE_ROOT, 'geo-studio.html'));
});
app.use('/pdd商品图', express.static(path.join(SITE_ROOT, 'pdd商品图')));
app.use('/assets', express.static(path.join(SITE_ROOT, 'assets')));

// ===================== 获取配置（脱敏） =====================
app.get('/api/config', requireUser, (req, res) => {
  const config = loadConfig(getUserConfigPath(req.user.id));
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
app.post('/api/config', requireUser, (req, res) => {
  const configPath = getUserConfigPath(req.user.id);
  const config = loadConfig(configPath);
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

  saveConfig(config, configPath);
  res.json({ success: true });
});

// ===================== 清除某平台 Cookie（强制重新登录） =====================
app.delete('/api/cookies/:platform', requireUser, (req, res) => {
  const cookiePath = path.join(getUserDir(req.user.id), `${req.params.platform}.json`);
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
app.post('/api/cookies/:platform/import', requireUser, (req, res) => {
  const platform = req.params.platform;
  const domain = COOKIE_DOMAINS[platform];
  if (!domain) return res.status(400).json({ error: `不支持导入 Cookie 的平台: ${platform}` });

  const cookies = parseCookieInput(req.body.cookie || req.body.cookies || '', domain);
  if (!cookies.length) return res.status(400).json({ error: '没有识别到有效 Cookie' });

  if (platform === 'sohu') {
    const names = new Set(cookies.map(cookie => cookie.name));
    const required = ['ppinf', 'pprdig', 'ppmdig'];
    const missing = required.filter(name => !names.has(name));
    if (missing.length) {
      return res.status(400).json({
        error: `搜狐 Cookie 不完整，缺少登录态字段：${missing.join('、')}。请从已登录的 mp.sohu.com 页面复制完整 Cookie，不要只复制 Network 里单个请求的访客 Cookie。`,
      });
    }
  }

  fs.writeFileSync(path.join(getUserDir(req.user.id), `${platform}.json`), JSON.stringify(cookies, null, 2));
  res.json({ success: true, count: cookies.length });
});

// ===================== 单平台发布 =====================
app.post('/api/publish', requireUser, async (req, res) => {
  const { platform, title, content, summary = '', tags = [] } = req.body;
  const config = loadConfig(getUserConfigPath(req.user.id));
  const creds = config.platforms?.[platform] || {};

  if (!MANUAL_LOGIN_PLATFORMS.has(platform) && !creds.username && !creds.appId) {
    return res.status(400).json({ error: `平台 ${platform} 未配置账号` });
  }

  const jobId = uuidv4();
  jobs[jobId] = { status: 'running', platform, title, userId: req.user.id, log: [] };

  // 异步执行；发布浏览器串行启动，避免多个 Chrome 抢同一个用户目录
  enqueuePublish(async () => {
    const addLog = (msg) => {
      jobs[jobId].log.push(`[${new Date().toLocaleTimeString('zh-CN')}] ${msg}`);
      console.log(`[${platform}] ${msg}`);
    };

    try {
      let publisherPath = path.join(__dirname, 'publishers', `${platform}.js`);
      if (!fs.existsSync(publisherPath)) throw new Error(`暂不支持平台: ${platform}`);

      delete require.cache[require.resolve(publisherPath)];
      const publisher = require(publisherPath);
      const cookiePath = path.join(getUserDir(req.user.id), `${platform}.json`);

      const result = await publisher.publish({
        title, content, summary, tags, creds,
        cookiePath, addLog,
      });

      jobs[jobId].result = result;
      if (result?.manual) {
        jobs[jobId].status = 'manual';
        addLog(`⚠️ 需要手动处理` + (result.url ? `：${result.url}` : ''));
      } else {
        jobs[jobId].status = 'done';
        addLog(`✅ 发布成功` + (result.url ? `：${result.url}` : ''));
      }
    } catch (e) {
      jobs[jobId].status = 'error';
      jobs[jobId].error = e.message;
      addLog(`❌ 失败：${e.message}`);
    }
  });

  res.json({ jobId });
});

// ===================== 批量发布 =====================
app.post('/api/publish/batch', requireUser, async (req, res) => {
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
