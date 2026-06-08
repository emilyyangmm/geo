/**
 * 百度百家号发布模块
 * 登录地址: https://baijiahao.baidu.com
 */

const { launchBrowser, saveCookies, loadCookies, waitForManualAction } = require('./base');

async function publish({ title, content, summary, tags, creds, cookiePath, addLog }) {
  const browser = await launchBrowser();
  const page = await browser.newPage();

  try {
    addLog('打开百家号后台...');
    await page.goto('https://baijiahao.baidu.com/builder/rc/edit?type=news', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // 检测登录状态
    const currentUrl = page.url();
    if (currentUrl.includes('passport.baidu.com') || currentUrl.includes('login')) {
      addLog('需要登录，尝试加载 Cookie...');
      const hasCookies = await loadCookies(page, cookiePath);
      if (hasCookies) {
        await page.goto('https://baijiahao.baidu.com/builder/rc/edit?type=news', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
      }

      const stillOnLogin = page.url().includes('passport') || page.url().includes('login');
      if (stillOnLogin) {
        addLog('正在填写百度账号...');
        const userInput = await page.$('#TANGRAM__PSP_3__userName, input[name="userName"], #userName');
        if (userInput) {
          await userInput.click({ clickCount: 3 });
          await userInput.type(creds.username, { delay: 40 });
        }
        const pwdInput = await page.$('#TANGRAM__PSP_3__password, input[name="password"], #password');
        if (pwdInput) {
          await pwdInput.click();
          await pwdInput.type(creds.password, { delay: 40 });
        }
        const loginBtn = await page.$('#TANGRAM__PSP_3__submit, button[type="submit"], .login-btn');
        if (loginBtn) await loginBtn.click();

        addLog('已提交登录，请在浏览器中完成验证（百度可能需要扫码）...');
        await waitForManualAction(addLog, '请完成百度安全验证后继续', 90000);
        await saveCookies(page, cookiePath);
        addLog('登录成功，已保存 Cookie');

        await page.goto('https://baijiahao.baidu.com/builder/rc/edit?type=news', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
      } else {
        addLog('Cookie 有效，已自动登录');
      }
    }

    // 等待编辑器
    addLog('等待编辑器加载...');
    await page.waitForSelector('.textinput, input[placeholder*="标题"], .article-title', { timeout: 20000 });

    // 填写标题
    addLog('填写标题...');
    const titleInput = await page.$('.textinput, input[placeholder*="标题"], .article-title input');
    if (titleInput) {
      await titleInput.click({ clickCount: 3 });
      await titleInput.type(title, { delay: 30 });
    }

    await page.waitForTimeout(500);

    // 填写正文
    addLog('填写正文...');
    const editorEl = await page.$('.ql-editor, [contenteditable="true"], .ProseMirror, .public-DraftEditor-content');
    if (editorEl) {
      await editorEl.click();
      await page.waitForTimeout(300);
      const plainText = content.replace(/#{1,6}\s/g, '\n\n').replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1').trim();
      await page.keyboard.type(plainText, { delay: 5 });
    }

    // 填写摘要
    if (summary) {
      const abstractEl = await page.$('textarea[placeholder*="摘要"], .abstract-input textarea');
      if (abstractEl) {
        await abstractEl.click();
        await abstractEl.type(summary.slice(0, 200), { delay: 20 });
      }
    }

    addLog('内容填写完毕，准备发布...');
    await page.waitForTimeout(1000);

    // 发布
    const publishBtn = await page.$('button[class*="publish"]:not([disabled]), .publish-btn, [class*="submit-btn"]');
    if (!publishBtn) {
      addLog('未找到发布按钮，请手动点击发布');
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
