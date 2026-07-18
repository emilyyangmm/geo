# AI 搜索投放效果追踪 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为每个登录用户的品牌和产品保存文章归因，并以可复核的真实 AI 联网搜索证据展示投放效果。

**Architecture:** 前端继续使用现有 Supabase 登录态，直接通过 RLS 表保存投放项目、文章快照与检测结果；Node 发布服务只负责执行串行浏览器检测和保存私有截图，前端在任务完成后把结构化结果写入 Supabase。真实检测只在读取到实际回答和截图时记为成功，登录、验证码与页面访问限制明确记为人工确认或失败。

**Tech Stack:** 单页 HTML/CSS/JavaScript、Supabase Auth/Postgres/RLS、Node.js/Express、Puppeteer、Node 内置测试框架。

## Global Constraints

- 当前用户 ID 必须来自 Supabase 会话；不得信任前端传入的任意 userId。
- 成功检测必须同时有真实页面回答与截图；失败和人工确认不能计入未提及。
- 检测平台固定为豆包、DeepSeek、Kimi、千问、文心一言。
- 检测任务串行运行，不能影响现有发布任务队列。
- 头条从 Cookie 配置与一键发布 UI 下线；不删除 `publishers/toutiao.js` 或历史 Cookie 文件。
- 不修改或删除现有 `tmp/` 内容。

---

## File Structure

- Create: `supabase/migrations/20260718_ai_search_effects.sql` - 项目、文章、检测与证据元数据表及 RLS。
- Create: `geo-publisher/effects/analysis.js` - 生成中性提问、品牌命中判断、竞品提取和统计聚合。
- Create: `geo-publisher/effects/analysis.test.js` - 上述纯函数的单元测试。
- Create: `geo-publisher/effects/scan-runner.js` - 串行真实检测任务、截图保存与统一状态。
- Create: `geo-publisher/effects/scan-runner.test.js` - 扫描状态机和成功证据约束测试。
- Create: `geo-publisher/effects/platforms.js` - 五个平台的 URL、页面读取契约与受限状态映射。
- Modify: `geo-publisher/server.js` - 受登录保护的检测启动、任务查询和私有截图读取 API；拒绝头条发布请求。
- Modify: `geo-studio.html` - “投放效果”页面、Supabase 数据同步、检测任务展示，以及头条 UI 下线。

## Task 1: 建立用户隔离的效果数据表

**Files:**
- Create: `supabase/migrations/20260718_ai_search_effects.sql`

**Interfaces:**
- Produces `geo_campaigns`, `geo_articles`, `geo_ai_scans` 三张表。
- `geo_articles.campaign_id` 关联投放项目；`geo_ai_scans.article_id` 可为空，关键词扫描不强制归属某一篇文章。

- [ ] **Step 1: 写入 SQL 迁移和 RLS 策略**

```sql
create table if not exists public.geo_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brand_name text not null,
  product_name text not null,
  website text not null default '',
  selling_points text not null default '',
  keywords jsonb not null default '[]'::jsonb,
  competitors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists geo_campaigns_owner_product
  on public.geo_campaigns(user_id, brand_name, product_name);

create table if not exists public.geo_articles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.geo_campaigns(id) on delete cascade,
  title text not null,
  content text not null,
  summary text not null default '',
  tags jsonb not null default '[]'::jsonb,
  published_platforms jsonb not null default '[]'::jsonb,
  publication_links jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now(),
  published_at timestamptz
);

create table if not exists public.geo_ai_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.geo_campaigns(id) on delete cascade,
  article_id uuid references public.geo_articles(id) on delete set null,
  platform text not null check (platform in ('doubao','deepseek','kimi','qianwen','wenxin')),
  keyword text not null,
  question text not null,
  status text not null check (status in ('success','manual_required','failed')),
  answer_text text not null default '',
  screenshot_path text not null default '',
  brand_mentioned boolean,
  product_mentioned boolean,
  website_mentioned boolean,
  selling_point_mentioned boolean,
  first_mention_index integer,
  mention_count integer not null default 0,
  sentiment text check (sentiment in ('recommended','positive','neutral','negative','unknown')),
  competitors_found jsonb not null default '[]'::jsonb,
  error_message text not null default '',
  created_at timestamptz not null default now()
);

alter table public.geo_campaigns enable row level security;
alter table public.geo_articles enable row level security;
alter table public.geo_ai_scans enable row level security;
create policy "campaign owner" on public.geo_campaigns for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "article owner" on public.geo_articles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "scan owner" on public.geo_ai_scans for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 2: 在 Supabase SQL Editor 执行迁移，并用登录用户验证读写**

Run: 在 SQL Editor 执行迁移；以已登录 GEO 用户调用 `supabaseClient.from('geo_campaigns').select()`。

Expected: 表创建成功，用户仅返回自己 `user_id` 的记录。

- [ ] **Step 3: 提交迁移**

```bash
git add supabase/migrations/20260718_ai_search_effects.sql
git commit -m "feat: add GEO effect tracking schema"
```

## Task 2: 实现可测试的检测结论分析

**Files:**
- Create: `geo-publisher/effects/analysis.js`
- Test: `geo-publisher/effects/analysis.test.js`

**Interfaces:**
- Consumes `campaign: { brandName, productName, website, sellingPoints, competitors }` 与实际 `answerText`。
- Produces `buildSearchQuestion(keyword)`, `analyseAnswer(campaign, answerText)` 和 `aggregateScans(scans)`。

- [ ] **Step 1: 写失败测试**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSearchQuestion, analyseAnswer, aggregateScans } = require('./analysis');

test('识别品牌、产品、官网、首个位置和竞品', () => {
  const result = analyseAnswer({
    brandName: '喵喵品牌', productName: '轻食面', website: 'miaomiao.cn',
    sellingPoints: '非油炸,低脂', competitors: ['竞品A'],
  }, '推荐喵喵品牌轻食面，非油炸低脂，详情见 miaomiao.cn。竞品A也可参考。');
  assert.equal(result.brandMentioned, true);
  assert.equal(result.productMentioned, true);
  assert.equal(result.websiteMentioned, true);
  assert.equal(result.firstMentionIndex, 2);
  assert.deepEqual(result.competitorsFound, ['竞品A']);
});

test('统计只计算成功扫描', () => {
  const stats = aggregateScans([
    { status: 'success', brandMentioned: true },
    { status: 'success', brandMentioned: false },
    { status: 'manual_required', brandMentioned: false },
  ]);
  assert.deepEqual(stats, { successful: 2, mentioned: 1, mentionRate: 50 });
});

test('问题保持中性且包含关键词', () => {
  assert.match(buildSearchQuestion('东莞广告投放媒体怎么选'), /东莞广告投放媒体怎么选/);
  assert.doesNotMatch(buildSearchQuestion('东莞广告投放媒体怎么选'), /喵喵品牌/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test geo-publisher/effects/analysis.test.js`

Expected: FAIL，提示 `Cannot find module './analysis'`。

- [ ] **Step 3: 实现纯函数**

```js
function buildSearchQuestion(keyword) {
  return `${String(keyword).trim()}怎么选？请给出推荐方向、判断依据和注意事项。`;
}
function normaliseTerms(value) {
  return String(value || '').split(/[，,、\n]/).map(v => v.trim()).filter(Boolean);
}
function indexOfTerm(text, term) {
  const index = text.toLocaleLowerCase().indexOf(term.toLocaleLowerCase());
  return index < 0 ? null : index + 1;
}
function analyseAnswer(campaign, answerText) {
  const text = String(answerText || '');
  const mentions = [campaign.brandName, campaign.productName, campaign.website]
    .map(term => indexOfTerm(text, String(term || '').trim())).filter(Number.isInteger);
  const sellingPointMentioned = normaliseTerms(campaign.sellingPoints).some(term => indexOfTerm(text, term));
  const competitorsFound = normaliseTerms(campaign.competitors).filter(term => indexOfTerm(text, term));
  const recommendation = new RegExp(`${String(campaign.brandName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^。！？]{0,24}(推荐|值得|优先)`).test(text);
  return {
    brandMentioned: Boolean(indexOfTerm(text, campaign.brandName)),
    productMentioned: Boolean(indexOfTerm(text, campaign.productName)),
    websiteMentioned: Boolean(indexOfTerm(text, campaign.website)),
    sellingPointMentioned,
    firstMentionIndex: mentions.length ? Math.min(...mentions) : null,
    mentionCount: [campaign.brandName, campaign.productName, campaign.website]
      .filter(Boolean).reduce((count, term) => count + text.split(String(term)).length - 1, 0),
    sentiment: recommendation ? 'recommended' : (mentions.length ? 'neutral' : 'unknown'),
    competitorsFound,
  };
}
function aggregateScans(scans) {
  const successful = scans.filter(scan => scan.status === 'success');
  const mentioned = successful.filter(scan => scan.brandMentioned).length;
  return { successful: successful.length, mentioned, mentionRate: successful.length ? Math.round(mentioned * 100 / successful.length) : 0 };
}
module.exports = { buildSearchQuestion, analyseAnswer, aggregateScans };
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test geo-publisher/effects/analysis.test.js`

Expected: PASS，3 个测试通过。

- [ ] **Step 5: 提交分析模块**

```bash
git add geo-publisher/effects/analysis.js geo-publisher/effects/analysis.test.js
git commit -m "feat: analyse AI search evidence"
```

## Task 3: 增加真实扫描任务和私有证据读取

**Files:**
- Create: `geo-publisher/effects/platforms.js`
- Create: `geo-publisher/effects/scan-runner.js`
- Create: `geo-publisher/effects/scan-runner.test.js`
- Modify: `geo-publisher/server.js`

**Interfaces:**
- `scanCampaign({ userId, campaign, keyword, platforms, addLog }) -> Promise<ScanResult[]>`。
- `ScanResult` 必须包含 `platform`, `status`, `question`, `answerText`, `screenshotPath`, `errorMessage` 和 Task 2 分析字段。
- `POST /api/effects/scans` 返回 `{ jobId }`；`GET /api/effects/job/:jobId` 返回任务状态；`GET /api/effects/evidence/:scanId` 仅返回当前用户目录下的截图。

- [ ] **Step 1: 写扫描状态机失败测试**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createScanResult } = require('./scan-runner');

test('没有回答或截图时不能是成功', () => {
  assert.equal(createScanResult({ platform: 'doubao', answerText: '回答', screenshotPath: '' }).status, 'failed');
  assert.equal(createScanResult({ platform: 'doubao', answerText: '', screenshotPath: '/safe/a.png' }).status, 'failed');
});
test('登录拦截必须标记为人工确认', () => {
  assert.equal(createScanResult({ platform: 'kimi', blockedByLogin: true }).status, 'manual_required');
});
```

- [ ] **Step 2: 实现平台配置和任务运行器**

```js
const PLATFORM_CONFIG = {
  doubao: { label: '豆包', url: 'https://www.doubao.com/chat/' },
  deepseek: { label: 'DeepSeek', url: 'https://chat.deepseek.com/' },
  kimi: { label: 'Kimi', url: 'https://kimi.moonshot.cn/' },
  qianwen: { label: '千问', url: 'https://www.qianwen.com/' },
  wenxin: { label: '文心一言', url: 'https://yiyan.baidu.com/' },
};
function createScanResult({ platform, question = '', answerText = '', screenshotPath = '', blockedByLogin = false, errorMessage = '' }) {
  if (blockedByLogin) return { platform, status: 'manual_required', question, answerText: '', screenshotPath: '', errorMessage: '平台要求登录或人工验证' };
  if (!answerText || !screenshotPath) return { platform, status: 'failed', question, answerText: '', screenshotPath: '', errorMessage: errorMessage || '没有取得可复核的页面回答和截图' };
  return { platform, status: 'success', question, answerText, screenshotPath, errorMessage: '' };
}
module.exports = { PLATFORM_CONFIG, createScanResult };
```

`scan-runner.js` 必须通过 `publishers/base.js` 的 `launchBrowser` 启动一个独立浏览器上下文，并对每个平台依次执行：打开 URL、识别登录墙、填写中性问题、等待稳定答案、读取可见答案、截图、调用 `analyseAnswer`。每一步使用 30 秒页面等待上限；异常仅影响当前平台并生成 `failed` 结果。

- [ ] **Step 3: 在 `server.js` 接入受保护路由**

```js
app.post('/api/effects/scans', requireUser, async (req, res) => {
  const { campaign, keyword, platforms } = req.body;
  if (!campaign?.brandName || !campaign?.productName || !String(keyword || '').trim()) {
    return res.status(400).json({ error: '缺少品牌、产品或检测关键词' });
  }
  const selected = (platforms || []).filter(p => EFFECT_PLATFORMS[p]);
  if (!selected.length) return res.status(400).json({ error: '请选择至少一个 AI 平台' });
  const jobId = uuidv4();
  effectJobs[jobId] = { userId: req.user.id, status: 'running', log: [], results: [] };
  enqueueEffectScan(async () => { /* 调用 scanCampaign 并写入 effectJobs[jobId] */ });
  res.json({ jobId });
});
```

将 `effectQueue` 与既有 `publishQueue` 分开；证据目录使用 `effects/<safeUserId>/<scanId>.png`，读取路由检查 `req.user.id` 与目录名匹配，绝不接受任意文件路径参数。

- [ ] **Step 4: 运行单元测试和语法检查**

Run: `node --test geo-publisher/effects/*.test.js`

Expected: PASS。

Run: `node --check geo-publisher/server.js`

Expected: 无输出，退出码 0。

- [ ] **Step 5: 提交后端真实检测框架**

```bash
git add geo-publisher/effects geo-publisher/server.js
git commit -m "feat: add real AI search scan jobs"
```

## Task 4: 保存产品快照、文章归因与检测结果

**Files:**
- Modify: `geo-studio.html:910-1560`

**Interfaces:**
- `upsertCampaignSnapshot() -> Promise<Campaign>` 从 `state.product` 和 `state.keywords` 创建或更新当前项目。
- `saveArticleToHistory(art) -> Promise<ArticleRecord>` 保留 localStorage，同时异步写入 `geo_articles`。
- `saveScanResults(job.results, campaignId) -> Promise<void>` 只写入 Task 3 返回的合法状态。

- [ ] **Step 1: 在前端状态加入效果数据缓存并写失败断言页面函数**

```js
state.effects = { campaign: null, scans: [], loading: false, jobId: '' };
function campaignPayloadFromProduct(product, keywords) {
  return {
    brand_name: String(product.brand || product.company || '').trim(),
    product_name: String(product.name || '').trim(),
    website: String(product.website || '').trim(),
    selling_points: String(product.sellingPoints || product.uniqueValue || '').trim(),
    keywords: keywords.map(item => item.query || item).filter(Boolean),
    competitors: String(product.competitors || '').split(/[，,、\n]/).map(v => v.trim()).filter(Boolean),
  };
}
```

在浏览器控制台验证：产品定义已填写时，`campaignPayloadFromProduct(state.product, state.keywords)` 的 `brand_name` 与 `product_name` 均非空；缺失时 UI 显示“请先完成产品定义”，不调用数据库。

- [ ] **Step 2: 实现 Supabase 写入和历史同步**

```js
async function upsertCampaignSnapshot() {
  if (!requireLogin()) return null;
  const payload = campaignPayloadFromProduct(state.product, state.keywords);
  if (!payload.brand_name || !payload.product_name) throw new Error('请先填写品牌名称和产品名称');
  const { data, error } = await supabaseClient.from('geo_campaigns')
    .upsert({ user_id: state.user.id, ...payload, updated_at: new Date().toISOString() }, { onConflict: 'user_id,brand_name,product_name' })
    .select().single();
  if (error) throw error;
  state.effects.campaign = data;
  return data;
}
```

在 `saveArticleToHistory` 中保留现有 localStorage 更新；若已登录且项目有效，异步 `upsert` 到 `geo_articles`，保存文章标题、正文、摘要、标签和 `campaign_id`。数据库失败不得阻塞文章生成，只在页面显示“云端归因保存失败”。

- [ ] **Step 3: 实现扫描结果持久化**

```js
async function saveScanResults(results, campaignId) {
  const rows = results.map(scan => ({
    user_id: state.user.id, campaign_id: campaignId, platform: scan.platform,
    keyword: scan.keyword, question: scan.question, status: scan.status,
    answer_text: scan.answerText || '', screenshot_path: scan.screenshotPath || '',
    brand_mentioned: scan.brandMentioned ?? null, product_mentioned: scan.productMentioned ?? null,
    website_mentioned: scan.websiteMentioned ?? null, selling_point_mentioned: scan.sellingPointMentioned ?? null,
    first_mention_index: scan.firstMentionIndex ?? null, mention_count: scan.mentionCount || 0,
    sentiment: scan.sentiment || 'unknown', competitors_found: scan.competitorsFound || [],
    error_message: scan.errorMessage || '',
  }));
  const { error } = await supabaseClient.from('geo_ai_scans').insert(rows);
  if (error) throw error;
}
```

- [ ] **Step 4: 验证登录用户隔离和本地回退**

Run: 登录用户生成一篇文章，检查 localStorage 与 `geo_articles` 均出现记录；退出登录再生成，检查 localStorage 仍保存但不出现 Supabase 写入请求。

Expected: 云端记录仅属于当前登录用户，本地生成不因云端失败而中断。

- [ ] **Step 5: 提交归因保存功能**

```bash
git add geo-studio.html
git commit -m "feat: save GEO campaign and article attribution"
```

## Task 5: 构建投放效果页面与真实证据展示

**Files:**
- Modify: `geo-studio.html:200-290, 430-890, 1740-2060`

**Interfaces:**
- `renderEffectsPage()` 读取当前用户的项目、文章与扫描记录。
- `startEffectScan(keyword)` 启动 Task 3 任务并在成功或受限后调用 `saveScanResults`。
- `getEvidenceUrl(scanId)` 返回经授权的 `/api/effects/evidence/:scanId`。

- [ ] **Step 1: 增加导航与页面骨架**

```html
<div class="nav-section">效果复盘</div>
<div class="nav-item" id="nav8" onclick="goPage(8,this)"><span class="nav-icon">📈</span>投放效果</div>
<div class="page" id="page8">
  <div class="page-title">📈 投放效果</div>
  <div class="page-desc">查看真实 AI 联网搜索中品牌、产品和官网的出现情况。</div>
  <div id="effectsProject"></div>
  <div id="effectsSummary"></div>
  <div id="effectsRecords"></div>
</div>
```

- [ ] **Step 2: 实现检测启动、轮询和安全渲染**

```js
async function startEffectScan(keyword) {
  const campaign = await upsertCampaignSnapshot();
  const res = await fetch(SERVER + '/api/effects/scans', {
    method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ campaign: toBackendCampaign(campaign), keyword, platforms: ['doubao','deepseek','kimi','qianwen','wenxin'] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '无法启动真实检测');
  const job = await pollEffectJob(data.jobId);
  await saveScanResults(job.results, campaign.id);
  await renderEffectsPage();
}
```

展示卡片必须把 `success`、`manual_required`、`failed` 分别着色；仅 `success` 统计到提及率。完整回答使用 `textContent` 或 `escapeHTML`，不得直接拼接不可信 HTML。截图仅在 `success` 且存在 `screenshot_path` 时显示“查看证据”按钮。

- [ ] **Step 3: 实现趋势统计**

```js
function effectSummary(scans) {
  const successful = scans.filter(s => s.status === 'success');
  const mentioned = successful.filter(s => s.brand_mentioned).length;
  return { articles: state.effects.articles.length, successful: successful.length, mentioned, rate: successful.length ? Math.round(mentioned * 100 / successful.length) : 0 };
}
```

按 `keyword + platform` 对成功记录以 `created_at` 倒序排序，对最近两条显示“新增提及”“丢失提及”“保持提及”或“暂无可比数据”。

- [ ] **Step 4: 用两套用户数据验证页面**

Run: 用户 A 创建项目并执行一条模拟 `manual_required` 记录和一条成功记录；用户 B 登录后访问效果页。

Expected: A 看到项目、文章数、成功率和证据；B 看不到 A 的任何项目、记录或截图；人工确认记录没有计入成功率。

- [ ] **Step 5: 提交效果页面**

```bash
git add geo-studio.html
git commit -m "feat: add AI search effect dashboard"
```

## Task 6: 下线头条 Cookie 和一键发布入口

**Files:**
- Modify: `geo-studio.html:740-855, 1779-2055`
- Modify: `geo-publisher/server.js:30-37, 330-380`

**Interfaces:**
- 页面 `getSelectedPlatforms()` 只返回 `zhihu`, `baijiahao`, `sohu`, `wechat`。
- `POST /api/publish` 对 `platform === 'toutiao'` 返回 HTTP 410 与人工发布提示。

- [ ] **Step 1: 写后端拒绝头条的失败测试**

```js
test('Toutiao publish is disabled', async () => {
  const response = await request(app).post('/api/publish').set(validAuth).send({ platform: 'toutiao', title: 'x', content: 'y' });
  assert.equal(response.statusCode, 410);
  assert.match(response.body.error, /人工发布/);
});
```

若当前项目没有 HTTP 测试依赖，则将 `createPublishValidation(platform)` 提取为纯函数并以 `node --test` 覆盖 410 错误对象，禁止为此引入大型测试框架。

- [ ] **Step 2: 移除前端头条配置和勾选项**

删除 HTML 中 `data-platform="toutiao"` 的 Cookie 配置块和 `value="toutiao"` 复选框；将配置说明改为“知乎、百家号、搜狐优先使用 Cookie 登录态”。从 `syncPlatformStatus`、凭据加载和清除 Cookie 的前端平台列表中移除 `toutiao`。

- [ ] **Step 3: 拒绝新的头条发布请求，但保留旧实现文件**

```js
if (platform === 'toutiao') {
  return res.status(410).json({ error: '头条自动发布已下线，请使用发布指引中的人工发布流程。' });
}
```

从 `MANUAL_LOGIN_PLATFORMS` 和 `COOKIE_DOMAINS` 中移除 `toutiao`；不要删除 `publishers/toutiao.js`、`toutiao-cover.js` 或用户目录中已有 Cookie 文件。

- [ ] **Step 4: 验证发布页行为**

Run: 打开一键发布页。

Expected: 不出现头条 Cookie、状态点或平台复选框；知乎、百家号、搜狐和公众号仍可选择；旧客户端发送头条请求返回清晰 410 JSON。

- [ ] **Step 5: 提交头条下线改动**

```bash
git add geo-studio.html geo-publisher/server.js
git commit -m "feat: retire Toutiao automated publishing UI"
```

## Task 7: 集成验证、部署与回归检查

**Files:**
- Modify: `README.md` - 添加效果检测的真实结果限制、Supabase 迁移和使用说明。

- [ ] **Step 1: 运行全部自动测试和静态检查**

Run: `node --test geo-publisher/effects/*.test.js geo-publisher/publishers/toutiao-cover.test.js`

Expected: PASS。

Run: `node --check geo-publisher/server.js`

Expected: 无输出，退出码 0。

- [ ] **Step 2: 本地端到端检查**

Run: 在 `geo-publisher` 目录执行 `node server.js`，打开 `http://127.0.0.1:3001/geo-studio.html`。

Expected: 登录后可看到投放效果入口；生成文章后能同步归因；真实检测显示可验证成功、人工确认或失败其中之一；头条不显示在配置与一键发布中。

- [ ] **Step 3: 部署前后验证**

Run: 推送 GitHub 后部署静态文件和发布服务，访问 `https://miaomiaoxiaoxianer.cn/geo/geo-studio.html`。

Expected: 页面可加载、Supabase RLS 隔离生效、效果页调用线上 `/api/effects/*` 成功；不在日志或页面输出 Cookie、访问令牌或 Supabase secret。

- [ ] **Step 4: 更新说明并提交**

```bash
git add README.md
git commit -m "docs: explain AI search effect tracking"
git push origin main
```
