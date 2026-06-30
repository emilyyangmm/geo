/**
 * 今日头条号发布模块
 * 登录地址: https://mp.toutiao.com
 */

const { launchBrowser, saveCookies, loadCookies, waitForManualAction, saveDebugSnapshot } = require('./base');
const fs = require('fs');
const path = require('path');

const TOUTIAO_COVER_PATH = path.resolve(__dirname, '..', '..', 'pdd商品图', '00_商品封面_900x900.jpg');

async function waitForAnySelector(page, selectors, timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    for (const frame of page.frames()) {
      for (const selector of selectors) {
        try {
          const handle = await frame.$(selector);
          if (handle) return { frame, handle, selector };
        } catch {}
      }
    }
    await page.waitForTimeout(500);
  }
  return null;
}

async function withFreshSelector(page, selectors, action, timeout = 20000) {
  const found = await waitForAnySelector(page, selectors, timeout);
  if (!found) return false;
  try {
    await action(found.frame, found.selector);
    return true;
  } catch (error) {
    if (!/context|detached|Execution context|Cannot find context/i.test(error.message || '')) {
      throw error;
    }
  }

  await page.waitForTimeout(1000);
  const retry = await waitForAnySelector(page, selectors, Math.min(timeout, 8000));
  if (!retry) return false;
  await action(retry.frame, retry.selector);
  return true;
}

async function waitForPageStable(page, timeout = 8000) {
  await Promise.race([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout }).catch(() => null),
    page.waitForTimeout(Math.min(timeout, 2500)),
  ]);
  await page.waitForTimeout(1000);
}

async function getPageDebug(page) {
  const buttons = await page.evaluate(() =>
    [...document.querySelectorAll('button, a, [role="button"]')]
      .map(el => (el.innerText || el.textContent || '').trim())
      .filter(Boolean)
      .slice(0, 30)
  ).catch(() => []);
  return `页面标题：${await page.title()}；frames: ${page.frames().map(f => f.url()).filter(Boolean).join(' | ')}；可见按钮/链接: ${buttons.join('、')}`;
}

const TOUTIAO_TITLE_SELECTORS = [
  '.title-input',
  'input[placeholder*="请输入文章标题"]',
  'textarea[placeholder*="请输入文章标题"]',
  'input[placeholder*="标题"]',
  'textarea[placeholder*="标题"]',
  '.byte-input input',
  '.byte-input textarea',
  '[contenteditable="true"][data-placeholder*="标题"]',
  '[contenteditable="true"][placeholder*="标题"]',
];

async function pastePlainText(page, text) {
  await page.evaluate(async value => {
    await navigator.clipboard.writeText(value);
  }, text);
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyV');
  await page.keyboard.up('Control');
}

async function clickByText(page, texts) {
  const list = Array.isArray(texts) ? texts : [texts];
  return page.evaluate((targets) => {
    const nodes = [...document.querySelectorAll('button, a, label, span, div, [role="button"], [class*="radio"], [class*="checkbox"]')];
    for (const target of targets) {
      const el = nodes.find(node => {
        const text = (node.innerText || node.textContent || '').replace(/\s+/g, '');
        return text === target || text.includes(target);
      });
      if (el) {
        el.scrollIntoView({ block: 'center' });
        el.click();
        return target;
      }
    }
    return '';
  }, list);
}

async function configureToutiaoPublishOptions(page, addLog) {
  addLog('处理头条发布设置...');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(800);

  const changed = await page.evaluate(() => {
    function norm(el) {
      return (el?.innerText || el?.textContent || '').replace(/\s+/g, '');
    }

    function closestControl(node) {
      let cur = node;
      for (let i = 0; cur && i < 8; i++, cur = cur.parentElement) {
        const cls = String(cur.className || '').toLowerCase();
        const role = cur.getAttribute?.('role') || '';
        if (
          cur.tagName === 'LABEL' ||
          role === 'radio' ||
          role === 'checkbox' ||
          cls.includes('radio') ||
          cls.includes('checkbox') ||
          cls.includes('byte-radio') ||
          cls.includes('byte-checkbox') ||
          cls.includes('semi-radio') ||
          cls.includes('semi-checkbox')
        ) return cur;
      }
      return node;
    }

    function findTextNode(text) {
      const nodes = [...document.querySelectorAll('span, label, div, p, button, [role="radio"], [role="checkbox"]')]
        .filter(el => norm(el).includes(text))
        .sort((a, b) => norm(a).length - norm(b).length);
      return nodes[0] || null;
    }

    function clickText(text) {
      const node = findTextNode(text);
      if (!node) return false;
      const control = closestControl(node);
      control.scrollIntoView({ block: 'center' });
      const input = control.querySelector?.('input') || control.previousElementSibling?.querySelector?.('input') || control.parentElement?.querySelector?.('input');
      if (input && !input.checked) input.click();
      else control.click();
      return true;
    }

    function uncheckText(text) {
      const node = findTextNode(text);
      if (!node) return false;
      const control = closestControl(node);
      const input = control.querySelector?.('input') || control.previousElementSibling?.querySelector?.('input') || control.parentElement?.querySelector?.('input');
      if (input && input.checked) {
        input.click();
        return true;
      }
      control.scrollIntoView({ block: 'center' });
      const selected = control.getAttribute?.('aria-checked') === 'true' || String(control.className || '').includes('checked');
      if (selected) control.click();
      return true;
    }

    return {
      cover: clickText('单图'),
      ad: clickText('不投放广告'),
      first: uncheckText('头条首发'),
      rights: uncheckText('授权平台自动维权'),
      ai: clickText('引用AI虚构演绎'),
    };
  });

  if (changed.cover) addLog('封面已选单图');
  if (changed.cover && fs.existsSync(TOUTIAO_COVER_PATH)) {
    const uploadRect = await page.evaluate(() => {
      const bodyText = document.body.innerText || '';
      const coverStart = bodyText.indexOf('展示封面');
      const locationStart = bodyText.indexOf('添加位置');
      const nodes = [...document.querySelectorAll('div, span, button, [role="button"]')];
      const candidates = nodes
        .map(node => {
          const rect = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          const text = (node.innerText || node.textContent || '').trim();
          return {
            rect,
            text,
            dashed: [style.borderTopStyle, style.borderRightStyle, style.borderBottomStyle, style.borderLeftStyle].includes('dashed'),
            cls: String(node.className || '').toLowerCase(),
          };
        })
        .filter(({ rect, text, dashed, cls }) => {
          if (rect.width < 60 || rect.height < 60 || rect.width > 260 || rect.height > 220) return false;
          if (rect.top < 0) return false;
          if (text === '+') return true;
          if (dashed) return true;
          return cls.includes('upload') || cls.includes('cover');
        })
        .filter(({ rect }) => {
          // The cover upload box appears above "添加位置" and below "展示封面".
          if (coverStart < 0 || locationStart < 0) return true;
          const y = rect.top + window.scrollY;
          return y > 80;
        })
        .sort((a, b) => {
          const ay = a.rect.top + window.scrollY;
          const by = b.rect.top + window.scrollY;
          return ay - by || (a.rect.width * a.rect.height) - (b.rect.width * b.rect.height);
        });
      const target = candidates[0];
      if (!target) return null;
      return {
        x: target.rect.left + target.rect.width / 2,
        y: target.rect.top + target.rect.height / 2,
        width: target.rect.width,
        height: target.rect.height,
        text: target.text,
      };
    });

    const chooserPromise = page.waitForFileChooser({ timeout: 10000 }).catch(() => null);
    if (uploadRect) {
      addLog(`点击封面上传区域：${Math.round(uploadRect.width)}x${Math.round(uploadRect.height)}`);
      await page.mouse.click(uploadRect.x, uploadRect.y);
    }

    const chooser = uploadRect ? await chooserPromise : null;
    if (chooser) {
      await chooser.accept([TOUTIAO_COVER_PATH]);
      addLog('已上传头条封面图');
      await confirmToutiaoCoverUpload(page, addLog);
    } else {
      const fileInput = await waitForAnySelector(page, ['input[type="file"][accept*="image"]', 'input[type="file"]'], 2000);
      if (fileInput) {
        await fileInput.handle.uploadFile(TOUTIAO_COVER_PATH);
        addLog('已通过文件输入框上传头条封面图');
        await confirmToutiaoCoverUpload(page, addLog);
      } else {
        addLog('未找到头条封面上传控件，请手动确认封面');
      }
    }
  }
  if (changed.ad) addLog('广告已选不投放');
  if (changed.first) addLog('首发声明已取消');
  if (changed.rights) addLog('自动维权已取消');
  if (changed.ai) addLog('作品声明已选 AI 虚构演绎');
  const optionText = await page.evaluate(() => {
    const text = document.body.innerText || '';
    const start = text.indexOf('展示封面');
    return start >= 0 ? text.slice(start, start + 260).replace(/\s+/g, ' ') : '';
  }).catch(() => '');
  if (optionText) addLog(`发布设置快照：${optionText}`);
}

async function confirmToutiaoCoverUpload(page, addLog) {
  await page.waitForTimeout(1500);
  const clicked = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('button, [role="button"], a')];
    const target = nodes.find(node => {
      const text = (node.innerText || node.textContent || '').replace(/\s+/g, '');
      const disabled = node.disabled || node.getAttribute('aria-disabled') === 'true' || String(node.className || '').includes('disabled');
      if (disabled) return false;
      return ['确定', '完成', '使用', '保存', '确认'].some(t => text === t || text.includes(t));
    });
    if (!target) return '';
    target.scrollIntoView({ block: 'center' });
    target.click();
    return (target.innerText || target.textContent || '').trim();
  });
  if (clicked) {
    addLog(`已确认封面上传：${clicked}`);
    await page.waitForTimeout(2500);
  } else {
    addLog('封面已上传，但未找到弹窗确认按钮，请手动确认封面');
  }
}

async function clickFinalToutiaoPublish(page, addLog) {
  addLog('尝试点击头条最终发布按钮...');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);

  const clicked = await clickToutiaoPublishButton(page);

  if (!clicked) return { ok: false, reason: '未找到可点击的发布按钮' };
  addLog(`已点击按钮：${clicked}`);
  await Promise.race([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => null),
    page.waitForTimeout(3000),
  ]);

  await page.waitForTimeout(2000);
  await handleToutiaoPostClickDialogs(page, addLog);

  const stillOnPublish = await page.evaluate(() => /预览并发布|发布更多收益|草稿保存中/.test(document.body.innerText || '')).catch(() => false);
  if (stillOnPublish && page.url().includes('/graphic/publish')) {
    addLog('头条授权弹窗处理后仍在发布页，重新点击预览并发布...');
    const retryClicked = await clickToutiaoPublishButton(page);
    if (retryClicked) {
      addLog(`已再次点击按钮：${retryClicked}`);
      await Promise.race([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => null),
        page.waitForTimeout(4000),
      ]);
      await handleToutiaoPostClickDialogs(page, addLog);
    }
  }

  await page.waitForTimeout(3000);

  const result = await page.evaluate(() => {
    const text = document.body.innerText || '';
    if (/发布成功|发表成功|提交成功|提交审核|审核中|已发布/.test(text)) return 'success-text';
    if (/草稿保存中|草稿|认证|实名认证|未完成|失败|错误|请选择|请上传|不能为空|不符合|违规|修改后/.test(text)) return 'blocked';
    return 'unknown';
  }).catch(() => 'unknown');

  if (result === 'success-text') return { ok: true, url: page.url() };
  const afterText = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 300)).catch(() => '');
  if (afterText) addLog(`头条发布后页面快照：${afterText}`);
  if (!page.url().includes('/graphic/publish') && !/草稿|发布|预览|标题|正文/.test(afterText)) {
    return { ok: true, url: page.url() };
  }
  return { ok: false, reason: result === 'blocked' ? '页面提示仍需补充资料/认证' : '未检测到发布成功提示' };
}

async function clickToutiaoPublishButton(page) {
  return page.evaluate(() => {
    const nodes = [...document.querySelectorAll('button, [role="button"], a')];
    const candidates = nodes.filter(node => {
      const text = (node.innerText || node.textContent || '').replace(/\s+/g, '');
      const disabled = node.disabled || node.getAttribute('aria-disabled') === 'true' || node.className?.toString().includes('disabled');
      if (text.includes('定时') || text.includes('取消')) return false;
      return !disabled && ['预览并发布', '确认发布', '发布', '发表', '提交发布'].some(t => text === t || text.includes(t));
    });
    candidates.sort((a, b) => {
      const ta = (a.innerText || a.textContent || '').replace(/\s+/g, '');
      const tb = (b.innerText || b.textContent || '').replace(/\s+/g, '');
      const sa = ta.includes('预览并发布') ? 3 : ta.includes('确认发布') ? 2 : ta === '发布' ? 1 : 0;
      const sb = tb.includes('预览并发布') ? 3 : tb.includes('确认发布') ? 2 : tb === '发布' ? 1 : 0;
      return sb - sa;
    });
    const target = candidates[0];
    if (!target) return '';
    target.scrollIntoView({ block: 'center' });
    target.click();
    return (target.innerText || target.textContent || '').trim();
  });
}

async function handleToutiaoPostClickDialogs(page, addLog) {
  const confirmClicked = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('button, [role="button"], a')];
    const target = nodes.find(node => {
      const text = (node.innerText || node.textContent || '').replace(/\s+/g, '');
      const disabled = node.disabled || node.getAttribute('aria-disabled') === 'true' || node.className?.toString().includes('disabled');
      if (text.includes('取消') || text.includes('定时')) return false;
      return !disabled && ['确认发布', '发布'].some(t => text === t || text.includes(t));
    });
    if (!target) return '';
    target.scrollIntoView({ block: 'center' });
    target.click();
    return (target.innerText || target.textContent || '').trim();
  });
  if (confirmClicked && confirmClicked !== clicked) {
    addLog(`已点击二次确认按钮：${confirmClicked}`);
    await Promise.race([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => null),
      page.waitForTimeout(6000),
    ]);
  }

  for (let i = 0; i < 3; i++) {
    const modalClicked = await clickToutiaoModalConfirm(page).catch(() => '');
    if (!modalClicked) break;
    addLog(`已点击头条弹窗按钮：${modalClicked}`);
    await Promise.race([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => null),
      page.waitForTimeout(5000),
    ]);
  }
}

async function clickToutiaoModalConfirm(page) {
  return page.evaluate(() => {
    function isVisible(el) {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    }

    const containers = [...document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="Modal"], [class*="dialog"], [class*="Dialog"]')]
      .filter(isVisible)
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return (br.width * br.height) - (ar.width * ar.height);
      });
    const dialog = containers.find(el => /作品同步授权|确认|授权|发布/.test(el.innerText || el.textContent || ''));
    if (!dialog) return '';

    const buttons = [...dialog.querySelectorAll('button, [role="button"], a, span, div')]
      .filter(isVisible)
      .map(el => ({
        el,
        text: (el.innerText || el.textContent || '').replace(/\s+/g, ''),
        rect: el.getBoundingClientRect(),
        cls: String(el.className || ''),
      }))
      .filter(item => item.text && !/取消|关闭|稍后/.test(item.text));

    const target = buttons
      .filter(item => /确定|确认|同意|授权|继续|发布/.test(item.text))
      .sort((a, b) => (b.rect.top - a.rect.top) || (b.rect.left - a.rect.left))[0];
    if (!target) return '';
    target.el.scrollIntoView({ block: 'center' });
    target.el.click();
    return target.text;
  });
}

async function publish({ title, content, summary, tags, creds, cookiePath, addLog }) {
  const browser = await launchBrowser();
  const page = await browser.newPage();

  try {
    addLog('打开头条号后台...');
    await page.goto('https://mp.toutiao.com/profile_v4/graphic/publish', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // 检查是否需要登录。头条有时先跳到登录 URL，但登录框稍后才渲染。
    const needLogin = page.url().includes('/auth/page/login') ||
      await page.$('input[name="mobile"], .login-page, [class*="login"], [class*="Login"]');
    if (needLogin) {
      addLog('检测到未登录，尝试加载 Cookie...');
      const hasCookies = await loadCookies(page, cookiePath);
      if (hasCookies) {
        await Promise.allSettled([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }),
          page.reload({ waitUntil: 'domcontentloaded' }),
        ]);
        await waitForPageStable(page, 6000);
      }

      const stillNeedLogin = await page.$('input[name="mobile"], [class*="login-form"]').catch(async (error) => {
        if (/Execution context|context was destroyed|Cannot find context/i.test(error.message || '')) {
          await waitForPageStable(page, 8000);
          return page.$('input[name="mobile"], [class*="login-form"]').catch(() => null);
        }
        throw error;
      });
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
    const titleReady = await waitForAnySelector(page, TOUTIAO_TITLE_SELECTORS, 20000);
    if (!titleReady) {
      addLog(`没有找到头条标题框，当前页面可能是草稿箱/首页：${page.url()}`);
      addLog(await getPageDebug(page));
      addLog('请在弹出的浏览器里手动进入“发文章/发布文章”页，窗口会保留 5 分钟');
      await waitForManualAction(addLog, '等待手动处理头条编辑器', 300000);
      return { url: page.url(), manual: true };
    }

    // 填写标题
    addLog('填写标题...');
    const titleFilled = await withFreshSelector(page, TOUTIAO_TITLE_SELECTORS, async (frame, selector) => {
      await frame.click(selector, { clickCount: 3 });
      await page.keyboard.down('Control');
      await page.keyboard.press('KeyA');
      await page.keyboard.up('Control');
      await page.keyboard.type(title, { delay: 30 });
    }, 12000);
    if (!titleFilled) throw new Error('头条标题框加载后又失效，未能填写标题');

    await page.waitForTimeout(500);

    // 填写正文（头条使用富文本编辑器）
    addLog('填写正文...');
    const editorFrame = page.frames().find(f => f.url().includes('edit')) || page;

    // 尝试找到编辑区域
    const editorSelectors = [
      '.public-DraftEditor-content',
      '.ProseMirror',
      '.ql-editor',
      '[contenteditable="true"]',
    ];
    const plainText = content.replace(/#{1,6}\s/g, '\n\n').replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1').trim();
    const editorFilled = await withFreshSelector(page, editorSelectors, async (frame, selector) => {
      await frame.click(selector);
      await page.waitForTimeout(300);
      await pastePlainText(page, plainText);
    }, 12000);
    if (!editorFilled) {
      addLog(`没有找到头条正文编辑框，当前页面：${page.url()}`);
      addLog(await getPageDebug(page));
      await waitForManualAction(addLog, '等待手动处理头条正文', 300000);
      return { url: page.url(), manual: true };
    }

    // 填写摘要（如有）
    if (summary) {
      const summaryArea = await page.$('textarea[placeholder*="摘要"], textarea[placeholder*="简介"]');
      if (summaryArea) {
        await summaryArea.click();
        await summaryArea.type(summary.slice(0, 140), { delay: 20 });
      }
    }

    await configureToutiaoPublishOptions(page, addLog);

    const publishResult = await clickFinalToutiaoPublish(page, addLog);
    await saveCookies(page, cookiePath);
    if (publishResult.ok) return { url: publishResult.url || page.url() };

    addLog(`头条未确认发布成功：${publishResult.reason}`);
    await saveDebugSnapshot(page, 'toutiao', 'publish-blocked', addLog);
    addLog('头条仍停在发布页，已保存截图；线上服务器无法人工点确认');
    await waitForManualAction(addLog, '等待手动确认头条发布', 300000);
    return { url: page.url(), manual: true };

  } finally {
    await browser.close();
  }
}

module.exports = { publish };
