# AI 引用一键采集 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提供一个 Chrome 扩展一键采集 AI 页面引用，并把采集文本一键导入 GEO 效果页。

**Architecture:** 扩展采用 Manifest V3，仅在用户点击工具栏按钮时读取当前页面的 HTTP/HTTPS 链接和可见标题，将去重后的 `标题 | URL` 文本写入剪贴板。GEO 效果页从剪贴板读取该文本，提取 URL 后填入现有来源输入框，仍由既有后端匹配已确认的发布记录。

**Tech Stack:** Chrome Manifest V3、原生 JavaScript、现有单页 `geo-studio.html`、Node 内置测试框架。

## Global Constraints

- 扩展不得读取 Cookie、账号信息、输入框内容或上传页面数据。
- 仅采集用户当前页面中 HTTP/HTTPS 链接和相邻可见文本。
- 不调用 AI 平台私有接口，不自动提问或发布。
- GEO 只将已确认发布记录用于引用效果统计。

---

### Task 1: Chrome 引用采集扩展

**Files:**
- Create: `geo-reference-collector/manifest.json`
- Create: `geo-reference-collector/background.js`
- Create: `geo-reference-collector/README.md`
- Test: `geo-reference-collector/background.test.js`

**Interfaces:**
- Produces: `collectReferenceLinks(links)`，输入 `{ title, href }[]`，输出去重后的 `标题 | URL` 文本。
- Produces: 点击扩展图标后将文本写入当前页剪贴板并显示采集数量。

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { collectReferenceLinks } = require('./background.js');

test('collectReferenceLinks keeps only unique HTTP links', () => {
  const result = collectReferenceLinks([
    { title: '资料 A', href: 'https://example.com/a' },
    { title: '资料 A 重复', href: 'https://example.com/a#section' },
    { title: '忽略', href: 'javascript:alert(1)' },
  ]);
  assert.equal(result, '资料 A | https://example.com/a');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test geo-reference-collector/background.test.js`  
Expected: FAIL because `background.js` does not exist.

- [ ] **Step 3: Write minimal implementation**

```js
function collectReferenceLinks(links) {
  const seen = new Set();
  return links.flatMap(({ title, href }) => {
    const url = new URL(href);
    if (!['http:', 'https:'].includes(url.protocol)) return [];
    url.hash = '';
    const normalized = url.toString();
    if (seen.has(normalized)) return [];
    seen.add(normalized);
    return [`${String(title || url.hostname).trim()} | ${normalized}`];
  }).join('\n');
}
```

Add a toolbar click handler that uses `chrome.scripting.executeScript` to collect `a[href]` elements from the active tab, then writes the resulting text through `navigator.clipboard.writeText` in the page context. Add a `README.md` with Chrome “加载已解压的扩展程序” installation steps.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test geo-reference-collector/background.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add geo-reference-collector
git commit -m "feat: add AI reference collector extension"
```

### Task 2: GEO 剪贴板导入

**Files:**
- Modify: `geo-studio.html` in the “记录一次真实 AI 搜索” card and its source-reference helpers.
- Test: `geo-publisher/effects/manual-publication.test.js`

**Interfaces:**
- Produces: `parseReferenceClipboard(text)`，输入剪贴板文本，输出去重后的来源 URL 字符串数组。
- Consumes: `#effectSourceRefs` 现有来源文本框。

- [ ] **Step 1: Write the failing test**

```js
test('effect page accepts title and URL lines from the collector', () => {
  assert.match(page, /function parseReferenceClipboard\(text\)/);
  assert.match(page, /navigator\.clipboard\.readText\(\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test geo-publisher/effects/manual-publication.test.js`  
Expected: FAIL because clipboard importer functions do not exist.

- [ ] **Step 3: Write minimal implementation**

```js
function parseReferenceClipboard(text) {
  const urls = String(text || '').match(/https?:\/\/[^\s|]+/g) || [];
  return [...new Set(urls.map(value => value.replace(/[),.]+$/, '')))];
}

async function importEffectSourcesFromClipboard() {
  const urls = parseReferenceClipboard(await navigator.clipboard.readText());
  if (!urls.length) throw new Error('剪贴板里没有可识别的参考链接');
  document.getElementById('effectSourceRefs').value = urls.join('\n');
}
```

Add a visible “从剪贴板导入引用” button beside the existing source input. Show an alert with the imported count or the precise failure reason.

- [ ] **Step 4: Run test and syntax check**

Run:

```powershell
node --test geo-publisher\effects\manual-publication.test.js
$html = Get-Content geo-studio.html -Raw -Encoding UTF8
([regex]::Matches($html, '<script[^>]*>([\s\S]*?)</script>', 'IgnoreCase') | ForEach-Object { $_.Groups[1].Value }) -join "`n" | Set-Content tmp\geo-studio-inline-check.js -Encoding UTF8
node --check tmp\geo-studio-inline-check.js
```

Expected: all tests PASS and no syntax output.

- [ ] **Step 5: Commit**

```bash
git add geo-studio.html geo-publisher/effects/manual-publication.test.js
git commit -m "feat: import collected AI reference links"
```

### Task 3: 部署与验证

**Files:**
- Modify: `/www/wwwroot/geo.miaomiaoxiaoxianer.cn/geo-studio.html` via deployment copy.

**Interfaces:**
- Consumes: tested `geo-studio.html` from Task 2.
- Produces: online effects page containing “从剪贴板导入引用”.

- [ ] **Step 1: Push source commits**

Run: `git push origin main`  
Expected: GitHub `emilyyangmm/geo` main contains the extension and GEO page changes.

- [ ] **Step 2: Deploy the GEO page**

Run:

```powershell
scp .\geo-studio.html root@106.53.141.12:/www/wwwroot/geo.miaomiaoxiaoxianer.cn/geo-studio.html
ssh root@106.53.141.12 "grep -F '从剪贴板导入引用' /www/wwwroot/geo.miaomiaoxiaoxianer.cn/geo-studio.html"
```

Expected: server prints the new button text.

- [ ] **Step 3: Verify online response**

Run: `curl.exe -k -I --max-time 20 https://geo.miaomiaoxiaoxianer.cn/geo-studio.html`  
Expected: `HTTP/1.1 200 OK`.

- [ ] **Step 4: Commit deployment documentation**

```bash
git add geo-reference-collector/README.md
git commit -m "docs: explain AI reference collector installation"
```

## Self-review

- Spec coverage: Task 1 handles one-click browser collection; Task 2 handles GEO import; Task 3 deploys and validates the user-facing page.
- Placeholder scan: no unfinished behavior or unspecified interface remains.
- Type consistency: collector emits `标题 | URL` lines; GEO parser accepts URL tokens from those lines and writes its existing newline-delimited source format.
