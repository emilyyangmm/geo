/**
 * 今日头条号发布模块
 * 登录地址: https://mp.toutiao.com
 */

const { launchBrowser, saveCookies, loadCookies, waitForManualAction } = require('./base');

async function publish({ title, content, summary, tags, creds, cookiePath, addLog }) {
  const browser = await launchBrowser();
  const page = await browser.newPage();

  try {
    addLog('打开头条号后台...');
    await page.goto('https://mp.toutiao.com/profile_v4/graphic/publish', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // 检查是否需要登录
    const needLogin = await page.$('input[name="mobile"], .login-page, [class*="login"]');
    if (needLogin) {
      addLog('检测到未登录，尝试加载 Cookie...');
      const hasCookies = await loadCookies(page, cookiePath);
      if (hasCookies) {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
      }

      const stillNeedLogin = await page.$('input[name="mobile"], [class*="login-form"]');
      if (stillNeedLogin) {
        addLog('Cookie 无效，需要手动登录头条号...');
        await page.goto('https://mp.toutiao.com/auth/page/login', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1500);

        // 头条号通常需要短信验证码/扫码/滑块验证，账号只做预填，后续交给用户手动完成。
        const mobileInput = await page.$('input[name="mobile"], input[placeholder*="手机号"], input[placeholder*="账号"]');
        if (mobileInput && creds.username) {
          await mobileInput.click();
          await mobileInput.type(creds.username, { delay: 50 });
        }

        addLog('请在弹出的浏览器中用短信验证码/扫码完成头条号登录...');
        await waitForManualAction(addLog, '请完成头条号登录，登录成功后不要关闭浏览器窗口', 120000);
        await saveCookies(page, cookiePath);
        addLog('已保存头条号 Cookie，下次会优先自动登录');

        await page.goto('https://mp.toutiao.com/profile_v4/graphic/publish', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
      } else {
        addLog('Cookie 有效，已自动登录');
      }
    }

    // 等待编辑器加载
    addLog('等待编辑器加载...');
    await page.waitForSelector('.title-input, input[placeholder*="请输入文章标题"]', { timeout: 20000 });

    // 填写标题
    addLog('填写标题...');
    const titleInput = await page.$('.title-input, input[placeholder*="请输入文章标题"]');
    if (titleInput) {
      await titleInput.click({ clickCount: 3 });
      await titleInput.type(title, { delay: 30 });
    }

    await page.waitForTimeout(500);

    // 填写正文（头条使用富文本编辑器）
    addLog('填写正文...');
    const editorFrame = page.frames().find(f => f.url().includes('edit')) || page;

    // 尝试找到编辑区域
    await page.waitForSelector('.public-DraftEditor-content, .ProseMirror, .ql-editor, [contenteditable="true"]', { timeout: 10000 });
    const editor = await page.$('.public-DraftEditor-content, .ProseMirror, .ql-editor, [contenteditable="true"]');
    if (editor) {
      await editor.click();
      await page.waitForTimeout(300);
      // 用纯文本填充
      const plainText = content.replace(/#{1,6}\s/g, '\n\n').replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1').trim();
      await page.keyboard.type(plainText, { delay: 5 });
    }

    // 填写摘要（如有）
    if (summary) {
      const summaryArea = await page.$('textarea[placeholder*="摘要"], textarea[placeholder*="简介"]');
      if (summaryArea) {
        await summaryArea.click();
        await summaryArea.type(summary.slice(0, 140), { delay: 20 });
      }
    }

    addLog('内容已填写，准备发布...');
    await page.waitForTimeout(1000);

    // 点击发布按钮
    const publishBtn = await page.$('button[class*="publish"]:not([disabled]), .publish-btn, button[class*="submit"]:not([disabled])');
    if (!publishBtn) {
      addLog('请在浏览器中手动点击发布按钮完成发布');
      await waitForManualAction(addLog, '等待手动发布', 120000);
    } else {
      await publishBtn.click();
      await page.waitForTimeout(3000);
    }

    const url = page.url();
    await saveCookies(page, cookiePath);
    return { url };

  } finally {
    await browser.close();
  }
}

module.exports = { publish };
