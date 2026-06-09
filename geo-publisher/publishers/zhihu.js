/**
 * 知乎专栏发布模块
 * 登录方式：账号密码 or Cookie缓存
 */

const { launchBrowser, saveCookies, loadCookies } = require('./base');

async function isZhihuLoggedIn(page) {
  return page.evaluate(() =>
    document.cookie.includes('z_c0') ||
    !!document.querySelector('.AppHeader-userInfo, [data-za-detail-view-element_name="User"], [class*="Avatar"]')
  );
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
      addLog('未登录，准备打开知乎登录页...');
      await page.goto('https://www.zhihu.com/signin', { waitUntil: 'networkidle2' });
      await page.waitForTimeout(1000);
      await page.waitForSelector('input[name="username"]', { timeout: 10000 });

      // 知乎登录接口风控很强，自动提交账号密码容易触发“参数请求异常 10001”。
      // 这里只预填账号，验证码、滑块、扫码、短信都交给用户在弹出的 Chrome 里完成。
      if (creds.username) {
        const userInput = await page.$('input[name="username"]');
        if (userInput) {
          await userInput.click({ clickCount: 3 });
          await userInput.type(creds.username, { delay: 50 });
        }
      }
      addLog('请在弹出的 Chrome 里手动完成知乎登录/滑块/短信验证...');

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
    const titleSelector = '.TitleInput';
    await page.waitForSelector(titleSelector, { timeout: 15000 });
    await page.click(titleSelector);
    await page.keyboard.selectAll();
    await page.type(titleSelector, title, { delay: 30 });

    // 填写正文
    addLog('填写正文...');
    const editorSelector = '.editor-content';
    await page.waitForSelector(editorSelector, { timeout: 10000 });
    await page.click(editorSelector);
    await page.waitForTimeout(500);

    // 将 Markdown 转为纯文本段落粘贴（知乎编辑器兼容性最好）
    const plainText = content.replace(/#+\s/g, '\n').replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1').trim();
    await page.evaluate((text) => {
      const editor = document.querySelector('.editor-content');
      if (editor) {
        editor.focus();
        document.execCommand('insertText', false, text);
      }
    }, plainText);

    addLog('正文已填写');

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
    const publishBtn = await page.$('.PublishPanel button.Button--primary, button.SubmitPanel-publishButton');
    if (!publishBtn) throw new Error('找不到发布按钮，请检查知乎编辑器是否已打开');
    await publishBtn.click();
    await page.waitForTimeout(2000);

    // 获取发布后 URL
    const url = page.url();
    await saveCookies(page, cookiePath);
    return { url };

  } finally {
    await browser.close();
  }
}

module.exports = { publish };
