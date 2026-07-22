/**
 * 知乎专栏发布模块
 * 登录方式：账号密码 or Cookie缓存
 */

const { launchBrowser, saveCookies, loadCookies, waitForManualAction } = require('./base');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

async function isZhihuLoggedIn(page) {
  return page.evaluate(() =>
    document.cookie.includes('z_c0') ||
    !!document.querySelector('.AppHeader-userInfo, [data-za-detail-view-element_name="User"], [class*="Avatar"]')
  );
}

function canManuallyLoginToZhihu(platform = process.platform, display = process.env.DISPLAY) {
  return platform !== 'linux' || Boolean(display);
}

async function waitForZhihuLogin(page, addLog, timeout = 120000) {
  addLog(`请在弹出的知乎窗口完成滑块/短信验证（最多等待 ${timeout / 1000} 秒）...`);
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await isZhihuLoggedIn(page)) return true;
    await page.waitForTimeout(2000);
  }
  return false;
}

async function waitForAnySelector(page, selectors, timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    for (const selector of selectors) {
      const handle = await page.$(selector);
      if (handle) return handle;
    }
    await page.waitForTimeout(500);
  }
  return null;
}

async function fillZhihuTitle(page, title) {
  const titleBox = await waitForAnySelector(page, [
    '.TitleInput textarea',
    '.TitleInput input',
    '.TitleInput',
    'textarea[placeholder*="标题"]',
    'input[placeholder*="标题"]',
    '[contenteditable="true"][data-placeholder*="标题"]',
    '[contenteditable="true"][placeholder*="标题"]',
  ], 15000);
  if (!titleBox) return false;

  await titleBox.click({ clickCount: 3 });
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await page.keyboard.type(title, { delay: 30 });
  return true;
}

async function fillZhihuContent(page, content) {
  const editor = await waitForAnySelector(page, [
    '.editor-content',
    '.DraftEditor-editorContainer [contenteditable="true"]',
    '.public-DraftEditor-content',
    '.ProseMirror',
    '[contenteditable="true"]',
  ], 10000);
  if (!editor) return false;

  const plainText = content.replace(/#{1,6}\s/g, '\n\n').replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1').trim();
  await editor.click();
  await page.waitForTimeout(300);
  await page.keyboard.type(plainText, { delay: 5 });
  return true;
}

function setClipboardText(text) {
  return new Promise((resolve, reject) => {
    const tmpPath = path.join(os.tmpdir(), `geo-zhihu-${Date.now()}.txt`);
    fs.writeFileSync(tmpPath, text, 'utf8');
    const ps = spawn('powershell.exe', [
      '-NoProfile',
      '-Command',
      '[Console]::OutputEncoding=[Text.Encoding]::UTF8; [IO.File]::ReadAllText($env:GEO_CLIP_PATH, [Text.Encoding]::UTF8) | Set-Clipboard',
    ], {
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
      env: { ...process.env, GEO_CLIP_PATH: tmpPath },
    });
    let error = '';
    ps.stderr.on('data', chunk => { error += chunk.toString(); });
    ps.on('error', reject);
    ps.on('close', code => {
      try { fs.unlinkSync(tmpPath); } catch {}
      if (code === 0) resolve();
      else reject(new Error(error || `Set-Clipboard failed with code ${code}`));
    });
  });
}

async function pasteText(page, text) {
  let copied = false;
  try {
    await page.browser().defaultBrowserContext().overridePermissions('https://zhuanlan.zhihu.com', [
      'clipboard-read',
      'clipboard-write',
    ]);
    await page.evaluate(async value => {
      await navigator.clipboard.writeText(value);
    }, text);
    copied = true;
  } catch {}

  if (!copied && process.platform === 'win32') {
    await setClipboardText(text);
  }

  if (copied || process.platform === 'win32') {
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyV');
    await page.keyboard.up('Control');
    return;
  }

  await page.keyboard.type(text, { delay: 1 });
}

async function clickZhihuPublish(page) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(800);

  const clicked = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button, [role="button"]')];
    const candidates = buttons.filter(btn => {
      const text = (btn.innerText || btn.textContent || '').trim();
      const disabled = btn.disabled || btn.getAttribute('aria-disabled') === 'true';
      return !disabled && text === '发布';
    });
    const target = candidates[candidates.length - 1];
    if (!target) return false;
    target.scrollIntoView({ block: 'center' });
    target.click();
    return true;
  });
  if (!clicked) return false;

  try {
    await Promise.race([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 6000 }).catch(() => null),
      page.waitForTimeout(1500),
    ]);
    await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('button, [role="button"]')];
      const confirm = buttons.find(btn => {
        const text = (btn.innerText || btn.textContent || '').trim();
        return ['确认发布', '发布', '确定'].includes(text) && !btn.disabled;
      });
      if (confirm) confirm.click();
    });
  } catch (e) {
    if (!/Execution context was destroyed|Cannot find context|Target closed/i.test(e.message || '')) {
      throw e;
    }
  }
  return true;
}

async function publish({ title, content, summary, tags, creds, cookiePath, addLog }) {
  const browser = await launchBrowser();
  const page = await browser.newPage();

  try {
    addLog('打开知乎...');
    await page.goto('https://www.zhihu.com', { waitUntil: 'domcontentloaded' });

    // 尝试加载 Cookie
    const hasCookies = await loadCookies(page, cookiePath);
    if (hasCookies) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      addLog('已加载登录缓存，检查登录状态...');
    }

    // 检查是否已登录
    const isLoggedIn = await isZhihuLoggedIn(page);

    if (!isLoggedIn) {
      if (!canManuallyLoginToZhihu()) {
        throw new Error('知乎 Cookie 已加载，但服务器校验后仍是未登录状态。线上服务器无法弹出可操作的登录窗口，请重新从已登录的 zhihu.com 导出完整 Cookie 后保存。');
      }
      addLog('未登录，准备打开知乎登录页...');
      await page.goto('https://www.zhihu.com/signin', { waitUntil: 'networkidle2' });
      await page.waitForTimeout(1000);
      // 知乎登录接口风控很强，自动提交账号密码容易触发“参数请求异常 10001”。
      // 这里不预填、不点击提交，只等待用户在弹出的 Chrome 里完整手动登录。
      addLog('请在弹出的 Chrome 里完整手动登录知乎；这个窗口会保存登录态，下次优先复用...');

      const loginOk = await waitForZhihuLogin(page, addLog, 120000);
      if (!loginOk) throw new Error('未检测到知乎登录成功，请确认滑块/短信验证完成后页面已跳转');
      await saveCookies(page, cookiePath);
      addLog('登录成功，已保存 Cookie');
    } else {
      addLog('Cookie 有效，已自动登录');
    }

    // 打开写文章页面
    addLog('打开专栏编辑器...');
    await page.goto('https://zhuanlan.zhihu.com/write', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // 填写标题
    addLog('填写标题...');
    const titleFilled = await fillZhihuTitle(page, title);
    if (!titleFilled) {
      throw new Error(`找不到知乎标题输入框。当前页面：${page.url()}，页面标题：${await page.title()}`);
    }

    // 填写正文
    addLog('填写正文...');
    const editorSelector = '.editor-content, .DraftEditor-editorContainer [contenteditable="true"], .public-DraftEditor-content, .ProseMirror, [contenteditable="true"]';
    await page.waitForSelector(editorSelector, { timeout: 10000 });
    await page.click(editorSelector);
    await page.waitForTimeout(500);

    const plainText = content.replace(/#{1,6}\s/g, '\n\n').replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1').trim();
    await pasteText(page, plainText);
    await page.waitForTimeout(1500);

    const insertedLength = await page.evaluate((selector) => {
      const editor = document.querySelector(selector);
      return (editor?.innerText || editor?.textContent || '').trim().length;
    }, editorSelector);
    addLog(`正文已填写，检测到约 ${insertedLength} 字`);
    if (insertedLength < Math.min(plainText.length * 0.6, plainText.length - 80)) {
      addLog('检测到正文可能未完整写入，请在弹出的浏览器里确认内容');
    }

    // 封面/摘要（可选）
    if (summary) {
      const summaryBtn = await page.$('[data-za-element="CoverAndSummaryButton"]');
      if (summaryBtn) {
        await summaryBtn.click();
        await page.waitForTimeout(500);
        const summaryInput = await page.$('textarea[placeholder*="摘要"]');
        if (summaryInput) {
          await summaryInput.click();
          await summaryInput.type(summary.slice(0, 200), { delay: 20 });
        }
      }
    }

    // 发布
    addLog('点击发布按钮...');
    const published = await clickZhihuPublish(page);
    if (!published) {
      addLog('没有自动找到知乎发布按钮，请在弹出的浏览器里手动检查/发布，窗口会保留 5 分钟');
      await saveCookies(page, cookiePath);
      await waitForManualAction(addLog, '等待手动处理知乎编辑器', 300000);
      return { url: page.url(), manual: true };
    }
    addLog('已点击知乎发布按钮，如出现确认弹窗请手动处理');
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => page.waitForTimeout(3000));

    // 获取发布后 URL
    const url = page.url();
    await saveCookies(page, cookiePath);
    return { url };

  } finally {
    await browser.close();
  }
}

module.exports = { publish, canManuallyLoginToZhihu };
