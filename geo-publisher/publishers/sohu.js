/**
 * 搜狐号发布模块
 * 登录地址: https://mp.sohu.com
 */

const { launchBrowser, saveCookies, loadCookies, waitForManualAction } = require('./base');

async function pastePlainText(page, text) {
  await page.evaluate(async value => {
    await navigator.clipboard.writeText(value);
  }, text);
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyV');
  await page.keyboard.up('Control');
}

async function clearSohuLoadingMask(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.el-loading-mask').forEach(node => node.remove());
  }).catch(() => {});
}

async function dismissSohuTips(page, addLog) {
  const clicked = await page.evaluate(() => {
    const isVisible = (node) => {
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 4 && rect.height > 4;
    };
    const candidates = [...document.querySelectorAll('button, a, div, span, i, [role="button"]')]
      .filter(isVisible)
      .map(node => ({
        node,
        text: (node.innerText || node.textContent || '').replace(/\s+/g, ''),
        className: String(node.className || ''),
        aria: node.getAttribute('aria-label') || '',
        rect: node.getBoundingClientRect(),
      }))
      .filter(item => (
        item.text === '我知道了' ||
        item.text === '知道了' ||
        item.text === '关闭' ||
        item.aria.includes('关闭') ||
        item.className.includes('close')
      ))
      .sort((a, b) => {
        const score = item => (item.text === '我知道了' ? 0 : item.text === '知道了' ? 1 : item.text === '关闭' ? 2 : 3);
        return score(a) - score(b);
      });
    const target = candidates[0]?.node;
    if (!target) return '';
    target.click();
    return candidates[0].text || candidates[0].aria || candidates[0].className;
  }).catch(() => '');
  if (clicked) {
    addLog(`已关闭搜狐引导弹窗：${clicked}`);
    await page.waitForTimeout(800);
  }
}

async function getSohuCookieHint(cookiePath) {
  try {
    const fs = require('fs');
    if (!fs.existsSync(cookiePath)) return '当前没有保存搜狐 Cookie';
    const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));
    const names = new Set(cookies.map(cookie => cookie.name));
    const missing = ['ppinf', 'pprdig', 'ppmdig'].filter(name => !names.has(name));
    if (missing.length) return `搜狐 Cookie 缺少登录态字段：${missing.join('、')}`;
    return '搜狐 Cookie 有登录态字段，但可能已过期或被搜狐后台拒绝';
  } catch {
    return '搜狐 Cookie 文件读取失败';
  }
}

async function openSohuArticleEditor(page, addLog) {
  const editorUrl = 'https://mp.sohu.com/mpfe/v4/contentManagement/news/addarticle';
  const homeUrl = 'https://mp.sohu.com/mpfe/v4/contentManagement/first/page';

  // 搜狐后台会拦截直接打开编辑器的请求；先进入已登录首页再点“发布内容”更稳定。
  await page.goto(homeUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);
  await clearSohuLoadingMask(page);

  if (page.url().includes('/login') || page.url().includes('passport')) {
    return false;
  }
  if (page.url().includes('/news/addarticle')) return true;

  addLog(`搜狐首页登录态有效，当前页面：${page.url()}，从后台首页点击发布内容`);

  const clicked = await page.evaluate(() => {
    const isVisible = (node) => {
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 4 && rect.height > 4;
    };
    const candidates = [...document.querySelectorAll('button, a, div, span, [role="button"]')]
      .filter(isVisible)
      .map(node => {
        const rect = node.getBoundingClientRect();
        const text = (node.innerText || node.textContent || '').replace(/\s+/g, '');
        return { node, rect, text, area: rect.width * rect.height };
      })
      .filter(item => item.text === '发布内容' || item.text.includes('快来发布新内容'))
      .sort((a, b) => {
        if (a.text === '发布内容' && b.text !== '发布内容') return -1;
        if (b.text === '发布内容' && a.text !== '发布内容') return 1;
        return a.area - b.area;
      });
    const target = candidates[0]?.node;
    if (!target) return '';
    target.scrollIntoView({ block: 'center' });
    target.click();
    return candidates[0].text;
  });

  if (!clicked) {
    await page.mouse.click(675, 115).catch(() => {});
    addLog('未匹配到搜狐发布内容按钮文本，已点击黄色发布按钮区域');
  } else {
    addLog(`已点击搜狐入口：${clicked}`);
  }

  await Promise.race([
    page.waitForFunction(() => location.href.includes('/news/addarticle'), { timeout: 12000 }).catch(() => null),
    page.waitForTimeout(12000),
  ]);
  await clearSohuLoadingMask(page);
  if (page.url().includes('/login') || page.url().includes('passport')) {
    return false;
  }
  if (page.url().includes('/news/addarticle')) return true;

  addLog(`点击发布入口后仍未进入搜狐编辑器，当前页面：${page.url()}，最后尝试直接打开编辑器`);
  await page.goto(editorUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await clearSohuLoadingMask(page);
  return page.url().includes('/news/addarticle');
}

async function publish({ title, content, summary, tags, creds, cookiePath, addLog }) {
  const browser = await launchBrowser();
  const page = await browser.newPage();

  try {
    addLog('打开搜狐号...');
    await page.goto('https://mp.sohu.com/profile', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // 检测登录
    const needLogin = page.url().includes('passport') || page.url().includes('login') || await page.$('.passport-login');
    if (needLogin) {
      const hasCookies = await loadCookies(page, cookiePath);
      if (hasCookies) {
        await page.goto('https://mp.sohu.com/profile', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
      }

      const stillNeedLogin = page.url().includes('passport') || page.url().includes('login');
      if (stillNeedLogin) {
        addLog('Cookie 无效，需要手动登录搜狐号...');
        await page.goto('https://passport.sohu.com/web/signin.jsp', { waitUntil: 'domcontentloaded' });

        const userEl = await page.$('#account, input[name="account"], input[placeholder*="账号"]');
        if (userEl && creds.username) { await userEl.click(); await userEl.type(creds.username, { delay: 40 }); }

        const pwdEl = await page.$('#password, input[name="password"], input[type="password"]');
        if (pwdEl && creds.password) { await pwdEl.click(); await pwdEl.type(creds.password, { delay: 40 }); }

        addLog('请在弹出的浏览器中完成搜狐登录/验证码...');
        await waitForManualAction(addLog, '请完成搜狐号登录，登录成功后不要关闭浏览器窗口', 120000);
        await saveCookies(page, cookiePath);
        addLog('已保存搜狐号 Cookie，下次会优先自动登录');

        await page.goto('https://mp.sohu.com/profile', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
      }
    } else {
      addLog('已登录搜狐号');
    }

    // 进入发文页
    addLog('打开发文编辑器...');
    const editorReady = await openSohuArticleEditor(page, addLog);
    if (!editorReady) {
      addLog(`搜狐发文页要求重新登录，当前页面：${page.url()}`);
      addLog(await getSohuCookieHint(cookiePath));
      addLog('请在弹出的浏览器里完成搜狐登录/验证，登录后窗口会继续保留');
      await waitForManualAction(addLog, '等待手动登录搜狐号', 300000);
      await saveCookies(page, cookiePath);
      addLog('已保存搜狐号 Cookie，重新进入发文编辑器...');
      const retryReady = await openSohuArticleEditor(page, addLog);
      if (!retryReady) {
        addLog(`仍未进入搜狐发文编辑器，当前页面：${page.url()}`);
        await waitForManualAction(addLog, '等待手动进入搜狐发文编辑器', 300000);
        return { url: page.url(), manual: true };
      }
    }
    await page.waitForTimeout(2000);

    // 填写标题
    addLog('填写标题...');
    try {
      await clearSohuLoadingMask(page);
      await page.waitForSelector('input.article-title-input, .title-input, input[placeholder*="标题"], textarea[placeholder*="标题"]', { timeout: 15000 });
    } catch {
      addLog(`没有找到搜狐标题框，当前页面：${page.url()}`);
      addLog('请在弹出的浏览器里手动进入搜狐发文编辑器，窗口会保留 5 分钟');
      await waitForManualAction(addLog, '等待手动处理搜狐编辑器', 300000);
      return { url: page.url(), manual: true };
    }
    const titleEl = await page.$('input.article-title-input, .title-input, input[placeholder*="标题"], textarea[placeholder*="标题"]');
    if (titleEl) { await titleEl.click({ clickCount: 3 }); await titleEl.type(title, { delay: 30 }); }

    // 填写正文
    addLog('填写正文...');
    const editorEl = await page.$('.ql-editor, .ProseMirror, [contenteditable="true"]:not([placeholder*="标题"])');
    if (editorEl) {
      await editorEl.click();
      await page.waitForTimeout(300);
      const plain = content.replace(/#{1,6}\s/g, '\n\n').replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1').trim();
      await pastePlainText(page, plain);
    } else {
      addLog('没有找到搜狐正文编辑框，请手动确认内容');
      await waitForManualAction(addLog, '等待手动处理搜狐正文', 300000);
      return { url: page.url(), manual: true };
    }

    addLog('内容填写完毕，准备发布...');
    await page.waitForTimeout(1000);

    const publishBtn = await page.$('button[class*="publish"]:not([disabled]), .btn-publish, [class*="submit"]:not([disabled])');
    if (!publishBtn) {
      addLog('未找到发布按钮，请手动点击');
      await waitForManualAction(addLog, '等待手动发布', 120000);
    } else {
      await publishBtn.click();
      await page.waitForTimeout(3000);
    }

    await saveCookies(page, cookiePath);
    return { url: page.url() };

  } finally {
    await browser.close();
  }
}

async function publishFixed({ title, content, summary, tags, creds, cookiePath, addLog }) {
  const browser = await launchBrowser();
  const page = await browser.newPage();

  const isLoginUrl = () => page.url().includes('/login') || page.url().includes('passport');
  const plainContent = (content || '')
    .replace(/#{1,6}\s/g, '\n\n')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .trim();

  try {
    addLog('加载搜狐 Cookie，打开搜狐号后台首页...');
    const hasCookies = await loadCookies(page, cookiePath);
    if (!hasCookies) {
      addLog('本地没有搜狐 Cookie，请先保存搜狐 Cookie');
      return { url: page.url(), manual: true };
    }

    await page.goto('https://mp.sohu.com/mpfe/v4/contentManagement/first/page', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(8000);
    await clearSohuLoadingMask(page);

    if (isLoginUrl()) {
      addLog(`搜狐 Cookie 已加载，但后台仍要求登录，当前页面：${page.url()}`);
      addLog(await getSohuCookieHint(cookiePath));
      await waitForManualAction(addLog, '等待手动登录搜狐号', 300000);
      await saveCookies(page, cookiePath);
      return { url: page.url(), manual: true };
    }

    const backendReady = await page.evaluate(() => {
      const text = document.body?.innerText || '';
      return ['发布内容', '我的内容', '账号积分', '总阅读量', '搜狐号'].some(keyword => text.includes(keyword));
    }).catch(() => false);

    if (!backendReady) {
      addLog(`没有检测到搜狐号后台关键元素，当前页面：${page.url()}`);
      await waitForManualAction(addLog, '等待手动确认搜狐后台是否已加载', 300000);
      return { url: page.url(), manual: true };
    }

    addLog(`搜狐号后台已登录，当前页面：${page.url()}`);
    addLog('点击搜狐号“发布内容”入口...');

    const clickedEntry = await page.evaluate(() => {
      const isVisible = (node) => {
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 4 && rect.height > 4;
      };
      const candidates = [...document.querySelectorAll('button, a, div, span, [role="button"]')]
        .filter(isVisible)
        .map(node => ({
          node,
          text: (node.innerText || node.textContent || '').replace(/\s+/g, ''),
          area: node.getBoundingClientRect().width * node.getBoundingClientRect().height,
        }))
        .filter(item => item.text === '发布内容' || item.text.includes('快来发布新内容'))
        .sort((a, b) => {
          if (a.text === '发布内容' && b.text !== '发布内容') return -1;
          if (b.text === '发布内容' && a.text !== '发布内容') return 1;
          return a.area - b.area;
        });
      const target = candidates[0]?.node;
      if (!target) return '';
      target.scrollIntoView({ block: 'center' });
      target.click();
      return candidates[0].text;
    }).catch(() => '');

    if (clickedEntry) {
      addLog(`已点击搜狐入口：${clickedEntry}`);
    } else {
      await page.mouse.click(675, 115).catch(() => {});
      addLog('没匹配到“发布内容”文字，已点击黄色发布按钮区域');
    }

    await Promise.race([
      page.waitForFunction(() => location.href.includes('/news/addarticle'), { timeout: 15000 }).catch(() => null),
      page.waitForTimeout(15000),
    ]);
    await clearSohuLoadingMask(page);

    if (!page.url().includes('/news/addarticle')) {
      addLog(`点击入口后未进入编辑器，当前页面：${page.url()}，尝试直接打开编辑器`);
      await page.goto('https://mp.sohu.com/mpfe/v4/contentManagement/news/addarticle', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(6000);
      await clearSohuLoadingMask(page);
    }

    if (!page.url().includes('/news/addarticle') || isLoginUrl()) {
      addLog(`仍未进入搜狐发文编辑器，当前页面：${page.url()}`);
      await waitForManualAction(addLog, '等待手动进入搜狐发文编辑器', 300000);
      return { url: page.url(), manual: true };
    }

    addLog(`已进入搜狐发文编辑器：${page.url()}`);
    await dismissSohuTips(page, addLog);
    addLog('填写标题...');
    await page.waitForSelector('input[placeholder*="标题"], textarea[placeholder*="标题"], input.article-title-input, .title-input', { timeout: 20000 });
    const titleEl = await page.$('input[placeholder*="标题"], textarea[placeholder*="标题"], input.article-title-input, .title-input');
    if (!titleEl) throw new Error('没有找到搜狐标题框');
    await titleEl.click({ clickCount: 3 });
    await page.keyboard.press('Backspace').catch(() => {});
    await titleEl.type(title, { delay: 30 });

    addLog('填写正文...');
    await dismissSohuTips(page, addLog);
    await page.waitForSelector('.ql-editor, [contenteditable="true"]', { timeout: 20000 });
    const editorEl = await page.$('.ql-editor, [contenteditable="true"]');
    if (!editorEl) throw new Error('没有找到搜狐正文编辑框');
    await editorEl.evaluate(node => node.scrollIntoView({ block: 'center' })).catch(() => {});
    await editorEl.click();
    await page.waitForTimeout(300);
    await pastePlainText(page, plainContent);
    const bodyLength = await page.evaluate(() => {
      const editor = document.querySelector('.ql-editor, [contenteditable="true"]');
      return (editor?.innerText || editor?.textContent || '').trim().length;
    }).catch(() => 0);
    if (bodyLength < Math.min(50, plainContent.length)) {
      addLog('第一次填写正文未生效，尝试用编辑区坐标重新填写...');
      const box = await editorEl.boundingBox();
      if (box) {
        await page.mouse.click(box.x + Math.min(80, box.width / 2), box.y + Math.min(80, box.height / 2));
        await page.waitForTimeout(300);
        await pastePlainText(page, plainContent);
      }
    }

    addLog('搜狐标题和正文已填写，最终发布按钮请在弹出的浏览器里确认');
    await saveCookies(page, cookiePath);
    await waitForManualAction(addLog, '等待手动确认搜狐发布', 300000);
    return { url: page.url(), manual: true };
  } finally {
    await browser.close();
  }
}

module.exports = { publish: publishFixed };
