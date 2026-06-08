/**
 * 搜狐号发布模块
 * 登录地址: https://mp.sohu.com
 */

const { launchBrowser, saveCookies, loadCookies, waitForManualAction } = require('./base');

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
        addLog('填写搜狐账号密码...');
        await page.goto('https://passport.sohu.com/web/signin.jsp', { waitUntil: 'domcontentloaded' });

        const userEl = await page.$('#account, input[name="account"], input[placeholder*="账号"]');
        if (userEl) { await userEl.click(); await userEl.type(creds.username, { delay: 40 }); }

        const pwdEl = await page.$('#password, input[name="password"], input[type="password"]');
        if (pwdEl) { await pwdEl.click(); await pwdEl.type(creds.password, { delay: 40 }); }

        const btn = await page.$('#loginBtn, button[type="submit"], .login-btn');
        if (btn) await btn.click();

        addLog('等待验证（如需验证码请手动处理）...');
        await waitForManualAction(addLog, '请完成验证后继续', 60000);
        await saveCookies(page, cookiePath);
        addLog('登录成功，已保存 Cookie');

        await page.goto('https://mp.sohu.com/profile', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
      }
    } else {
      addLog('已登录搜狐号');
    }

    // 进入发文页
    addLog('打开发文编辑器...');
    await page.goto('https://mp.sohu.com/mcms/article/edit', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // 填写标题
    addLog('填写标题...');
    await page.waitForSelector('input.article-title-input, .title-input, input[placeholder*="标题"]', { timeout: 15000 });
    const titleEl = await page.$('input.article-title-input, .title-input, input[placeholder*="标题"]');
    if (titleEl) { await titleEl.click({ clickCount: 3 }); await titleEl.type(title, { delay: 30 }); }

    // 填写正文
    addLog('填写正文...');
    const editorEl = await page.$('.ql-editor, .ProseMirror, [contenteditable="true"]:not([placeholder*="标题"])');
    if (editorEl) {
      await editorEl.click();
      await page.waitForTimeout(300);
      const plain = content.replace(/#{1,6}\s/g, '\n\n').replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1').trim();
      await page.keyboard.type(plain, { delay: 5 });
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

module.exports = { publish };
