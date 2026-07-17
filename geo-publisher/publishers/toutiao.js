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

function createToutiaoNetworkMonitor(page) {
  const events = [];
  const onResponse = async (response) => {
    const request = response.request();
    const url = response.url();
    if (request.method() !== 'POST') return;
    if (!/\/mp\/agw\/article\/publish/i.test(url)) return;
    try {
      const text = await response.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {}
      const postData = request.postData() || '';
      events.push({
        at: Date.now(),
        status: response.status(),
        url,
        code: json?.code ?? json?.err_no ?? '',
        message: json?.message || json?.reason || '',
        hasContent: Boolean(json?.data?.content),
        payload: summarizeToutiaoPayload(postData),
        snippet: text.replace(/\s+/g, ' ').slice(0, 220),
      });
      if (events.length > 20) events.shift();
    } catch {}
  };
  page.on('response', onResponse);
  return {
    stop() {
      page.off('response', onResponse);
    },
    hasSaveSuccessSince(time) {
      return events.some(item => item.at >= time && item.code === 0 && item.hasContent);
    },
    lastFailureSince(time) {
      return [...events].reverse().find(item => item.at >= time && item.code && item.code !== 0);
    },
    snippets() {
      return events.slice(-6).map(item => `${item.status} code=${item.code || '-'} ${item.message || ''} payload=${item.payload} ${item.url.slice(0, 110)} ${item.snippet}`);
    },
  };
}

function summarizeToutiaoPayload(postData) {
  if (!postData) return 'empty';
  let value = postData;
  try {
    value = decodeURIComponent(postData);
  } catch {}
  const formSummary = summarizeFormPayload(postData);
  if (formSummary) return formSummary;
  const summary = [];
  const checks = [
    ['title', /"title"\s*:\s*"([^"]*)"/],
    ['pgc_id', /"pgc_id"\s*:\s*"?([^",}]*)/],
    ['article_id', /"article_id"\s*:\s*"?([^",}]*)/],
    ['cover', /"cover[^"]*"\s*:\s*(\[[\s\S]{0,80}?\]|\{[\s\S]{0,80}?\}|"[^"]*")/],
    ['content_len', /"content"\s*:\s*"([\s\S]*)"/],
  ];
  for (const [name, pattern] of checks) {
    const match = value.match(pattern);
    if (!match) continue;
    if (name === 'content_len') summary.push(`${name}=${match[1].length}`);
    else summary.push(`${name}=${String(match[1]).slice(0, 60)}`);
  }
  if (!summary.length) {
    const keys = [...value.matchAll(/"([^"]+)"\s*:/g)].map(m => m[1]).slice(0, 12);
    if (keys.length) summary.push(`keys=${keys.join(',')}`);
    else summary.push(value.slice(0, 160));
  }
  return summary.join(';');
}

function summarizeFormPayload(postData) {
  let params = null;
  try {
    params = new URLSearchParams(postData);
  } catch {
    return '';
  }
  const keys = [...params.keys()];
  if (!keys.length) return '';
  const interesting = [];
  for (const key of keys) {
    const raw = params.get(key) || '';
    let value = raw;
    try {
      value = decodeURIComponent(raw);
    } catch {}
    if (/title|content|article|abstract|cover|image|thumb|pgc|group|claim|source|word|declaration|wtt/i.test(key)) {
      if (/content|article/i.test(key)) interesting.push(`${key}_len=${value.length}`);
      else interesting.push(`${key}=${String(value).slice(0, 70)}`);
    }
  }
  if (interesting.length) return interesting.slice(0, 16).join(';');
  return `keys=${keys.slice(0, 16).join(',')}`;
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

  const coverState = await getToutiaoCoverSelection(page);
  if (changed.cover || coverState.selected) addLog(`封面已选单图${coverState.selected ? `（当前：${coverState.selected}）` : ''}`);
  if (coverState.selected && coverState.selected !== '单图') addLog(`头条封面选择可能未生效，当前检测为：${coverState.selected}`);
  if (fs.existsSync(TOUTIAO_COVER_PATH)) {
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
        addLog('未找到头条封面上传控件，头条可能无法保存草稿');
      }
    }
  } else {
    addLog(`默认封面文件不存在，头条可能无法保存草稿：${TOUTIAO_COVER_PATH}`);
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

async function getToutiaoCoverSelection(page) {
  await page.waitForTimeout(500);
  const selected = await page.evaluate(() => {
    function norm(el) {
      return (el?.innerText || el?.textContent || '').replace(/\s+/g, '');
    }
    function visible(el) {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    }
    const labels = [...document.querySelectorAll('label, span, div, [role="radio"]')]
      .filter(visible)
      .map(el => ({ el, text: norm(el), cls: String(el.className || '') }))
      .filter(item => ['单图', '三图', '无封面'].includes(item.text));
    const selected = labels.find(item => {
      const input = item.el.querySelector?.('input') || item.el.parentElement?.querySelector?.('input');
      const checked = input?.checked || item.el.getAttribute?.('aria-checked') === 'true' || /checked|selected/.test(item.cls);
      return checked;
    });
    return selected?.text || '';
  });
  return { selected };
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

async function clickFinalToutiaoPublish(page, addLog, networkMonitor) {
  addLog('尝试点击头条最终发布按钮...');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  await commitToutiaoEditorState(page, addLog);
  const draftReady = await waitForToutiaoDraftSaved(page, addLog, networkMonitor);
  if (!draftReady) {
    const draftResult = await saveToutiaoDraft(page, addLog);
    if (draftResult.ok) return { ok: true, url: draftResult.url || page.url(), draft: true };
    return { ok: false, reason: `头条草稿一直处于保存中，且存草稿失败：${draftResult.reason}` };
  }
  const responseSnippets = [];
  const onResponse = async (response) => {
    const request = response.request();
    const url = response.url();
    if (request.method() !== 'POST') return;
    if (!/(publish|article|graphic|create|submit|audit|mp\/agw|mp\/api)/i.test(url)) return;
    try {
      const text = (await response.text()).replace(/\s+/g, ' ').slice(0, 220);
      responseSnippets.push(`${response.status()} ${url.slice(0, 120)} ${text}`);
    } catch {
      responseSnippets.push(`${response.status()} ${url.slice(0, 160)}`);
    }
  };
  page.on('response', onResponse);

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
    await commitToutiaoEditorState(page, addLog);
    const retryDraftReady = await waitForToutiaoDraftSaved(page, addLog, networkMonitor);
    if (!retryDraftReady) {
      page.off('response', onResponse);
      const draftResult = await saveToutiaoDraft(page, addLog);
      if (draftResult.ok) return { ok: true, url: draftResult.url || page.url(), draft: true };
      return { ok: false, reason: `头条二次确认前草稿仍未保存完成，且存草稿失败：${draftResult.reason}` };
    }
    let retryClicked = await clickToutiaoPublishButton(page);
    if (retryClicked) {
      await page.waitForTimeout(1500);
      const stillOnPublishAfterTextClick = await page.evaluate(() => /预览并发布|草稿保存中/.test(document.body.innerText || '')).catch(() => false);
      if (stillOnPublishAfterTextClick) {
        const bottomClicked = await clickToutiaoBottomPrimaryButton(page);
        if (bottomClicked) retryClicked = bottomClicked;
      }
    } else {
      retryClicked = await clickToutiaoBottomPrimaryButton(page);
    }
    if (retryClicked) {
      addLog(`已再次点击按钮：${retryClicked}`);
      await Promise.race([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => null),
        page.waitForTimeout(4000),
      ]);
      await handleToutiaoPostClickDialogs(page, addLog);
    }
  }

  const successSignal = await waitForToutiaoSuccessSignal(page);
  page.off('response', onResponse);
  if (responseSnippets.length) {
    addLog(`头条发布接口片段：${responseSnippets.slice(-6).join(' || ')}`);
  }
  if (successSignal) return { ok: true, url: page.url(), signal: successSignal };

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

async function saveToutiaoDraft(page, addLog) {
  addLog('尝试改为保存头条草稿...');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
  await page.waitForTimeout(800);
  const clicked = await page.evaluate(() => {
    function visible(el) {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 30 && rect.height > 20 && style.display !== 'none' && style.visibility !== 'hidden';
    }
    const candidates = [...document.querySelectorAll('button, [role="button"], a')]
      .filter(visible)
      .map(el => {
        const rect = el.getBoundingClientRect();
        const text = (el.innerText || el.textContent || '').replace(/\s+/g, '');
        return { el, text, rect };
      })
      .filter(item => /存草稿|保存草稿|草稿/.test(item.text) && !/草稿保存中/.test(item.text))
      .sort((a, b) => b.rect.top - a.rect.top);
    const target = candidates[0];
    if (!target) return '';
    target.el.scrollIntoView({ block: 'center' });
    target.el.click();
    return target.text || '存草稿';
  }).catch(() => '');
  if (!clicked) return { ok: false, reason: '没有找到存草稿按钮' };
  addLog(`已点击头条按钮：${clicked}`);
  await page.waitForTimeout(5000);
  const state = await page.evaluate(() => {
    const text = document.body.innerText || '';
    if (/已保存|保存成功|草稿已保存|存草稿成功/.test(text)) return 'saved';
    if (/保存失败|失败|错误/.test(text)) return 'failed';
    if (/草稿保存中/.test(text)) return 'saving';
    return 'unknown';
  }).catch(() => 'unknown');
  if (state === 'saved' || state === 'unknown') {
    addLog('头条已尝试保存到草稿箱；如页面仍停留，请到头条草稿箱确认');
    return { ok: true, url: page.url() };
  }
  return { ok: false, reason: state === 'saving' ? '仍显示草稿保存中' : '页面提示保存失败' };
}

async function waitForToutiaoDraftSaved(page, addLog, networkMonitor, timeout = 45000) {
  const started = Date.now();
  let lastText = '';
  let nudged = false;
  let apiSaved = false;
  let apiFailure = '';
  const onResponse = async (response) => {
    const request = response.request();
    const url = response.url();
    if (request.method() !== 'POST') return;
    if (!/\/mp\/agw\/article\/publish/i.test(url)) return;
    try {
      const json = await response.json();
      if (json?.code === 0 && json?.data) {
        apiSaved = true;
      } else if (json?.code || json?.err_no) {
        apiFailure = json?.message || json?.reason || `code=${json?.code || json?.err_no}`;
      }
    } catch {}
  };
  page.on('response', onResponse);
  while (Date.now() - started < timeout) {
    const status = await page.evaluate(() => {
      const text = document.body.innerText || '';
      const match = text.match(/草稿保存中|已保存|保存失败|保存成功/);
      return match ? match[0] : '';
    }).catch(() => '');
    if (status && status !== lastText) {
      addLog(`头条草稿状态：${status}`);
      lastText = status;
    }
    if (status === '保存失败') {
      await page.waitForTimeout(3000);
    } else if (status === '已保存' || status === '保存成功' || !status) {
      await page.waitForTimeout(1200);
      page.off('response', onResponse);
      return true;
    }
    if (apiSaved) {
      addLog('头条保存接口已返回成功，继续发布');
      await page.waitForTimeout(5000);
      page.off('response', onResponse);
      return true;
    }
    if (networkMonitor?.hasSaveSuccessSince(started - 60000)) {
      addLog('头条保存接口此前已返回成功，继续发布');
      await page.waitForTimeout(5000);
      page.off('response', onResponse);
      return true;
    }
    if (!nudged && Date.now() - started > 12000) {
      nudged = true;
      await nudgeToutiaoAutosave(page, addLog);
    }
    await page.waitForTimeout(800);
  }
  page.off('response', onResponse);
  const networkFailure = networkMonitor?.lastFailureSince(started - 60000);
  if (networkFailure) addLog(`头条接口最近失败：${networkFailure.message || networkFailure.code}`);
  if (apiFailure) addLog(`头条保存接口失败：${apiFailure}`);
  addLog('头条草稿保存等待超时，已停止发布，避免保存失败');
  return false;
}

async function nudgeToutiaoAutosave(page, addLog) {
  try {
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    const clicked = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('button, a, span, div')]
        .map(el => {
          const rect = el.getBoundingClientRect();
          const text = (el.innerText || el.textContent || '').replace(/\s+/g, '');
          return { el, text, rect };
        })
        .filter(item => item.rect.width > 20 && item.rect.height > 16 && item.rect.top >= 0);
      const backTop = nodes.find(item => item.text.includes('回到顶部'));
      if (backTop) {
        backTop.el.click();
        return '回到顶部';
      }
      return '';
    });
    if (clicked) {
      addLog(`已点击头条保存触发点：${clicked}`);
      await page.waitForTimeout(1200);
    }
    await page.evaluate(() => {
      window.dispatchEvent(new Event('blur'));
      window.dispatchEvent(new Event('focus'));
    });
    addLog('已再次触发头条自动保存');
  } catch (error) {
    addLog(`触发头条自动保存失败：${error.message}`);
  }
}

async function commitToutiaoEditorState(page, addLog) {
  try {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const editableNodes = [...document.querySelectorAll('[contenteditable="true"], textarea, input')];
      for (const el of editableNodes) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.blur?.();
      }
      document.activeElement?.blur?.();
    });
    const target = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('button, [role="button"], a')]
        .map(el => {
          const rect = el.getBoundingClientRect();
          const text = (el.innerText || el.textContent || '').replace(/\s+/g, '');
          return { text, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, w: rect.width, h: rect.height };
        })
        .filter(item => /预览并发布|发布/.test(item.text) && item.w > 40 && item.h > 24)
        .sort((a, b) => b.y - a.y)[0];
      if (!buttons) return null;
      return { x: Math.max(20, buttons.x - 260), y: buttons.y };
    });
    if (target) await page.mouse.click(target.x, target.y);
    await page.waitForTimeout(1500);
    addLog('已提交头条编辑器状态，等待草稿保存');
  } catch (error) {
    addLog(`提交头条编辑器状态失败，继续检查草稿：${error.message}`);
  }
}

async function waitForToutiaoSuccessSignal(page, timeout = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const signal = await page.evaluate(() => {
      const text = document.body.innerText || '';
      const hit = text.match(/发布成功|发表成功|提交成功|提交审核|审核中|发布审核|内容已提交|等待审核/);
      return hit ? hit[0] : '';
    }).catch(() => '');
    if (signal) return signal;
    await page.waitForTimeout(250);
  }
  return '';
}

async function clickToutiaoPublishButton(page) {
  const target = await page.evaluate(() => {
    function visible(el) {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 40 && rect.height > 24 && rect.width < 220 && rect.height < 80 &&
        style.display !== 'none' && style.visibility !== 'hidden' && rect.top >= 0;
    }
    const nodes = [...document.querySelectorAll('button, [role="button"], a')];
    const candidates = nodes.filter(visible).map(node => {
      const text = (node.innerText || node.textContent || '').replace(/\s+/g, '');
      const rect = node.getBoundingClientRect();
      const disabled = node.disabled || node.getAttribute('aria-disabled') === 'true' || node.className?.toString().includes('disabled');
      return { node, text, rect, disabled };
    }).filter(item => {
      if (item.disabled || item.text.includes('定时') || item.text.includes('取消')) return false;
      return ['预览并发布', '确认发布', '发布', '发表', '提交发布'].some(t => item.text === t || item.text.includes(t));
    });
    candidates.sort((a, b) => {
      const score = item => {
        let s = 0;
        if (item.text === '预览并发布') s += 1000;
        else if (item.text.includes('预览并发布')) s += 900;
        else if (item.text === '确认发布') s += 800;
        else if (item.text === '发布') s += 600;
        s += item.rect.top > window.innerHeight - 200 ? 100 : 0;
        s += item.rect.left / 1000;
        s -= (item.rect.width * item.rect.height) / 100000;
        return s;
      };
      return score(b) - score(a);
    });
    const target = candidates[0];
    if (!target) return null;
    return {
      text: target.text,
      x: target.rect.left + target.rect.width / 2,
      y: target.rect.top + target.rect.height / 2,
      width: target.rect.width,
      height: target.rect.height,
    };
  });
  if (!target) return '';
  await page.mouse.click(target.x, target.y);
  return `${target.text}@${Math.round(target.x)},${Math.round(target.y)}`;
}

async function clickToutiaoBottomPrimaryButton(page) {
  const target = await page.evaluate(() => {
    function visible(el) {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 40 && rect.height > 24 && rect.width < 220 && rect.height < 80 &&
        style.display !== 'none' && style.visibility !== 'hidden';
    }
    const nodes = [...document.querySelectorAll('button, [role="button"], a')]
      .filter(visible)
      .map(el => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        const text = (el.innerText || el.textContent || '').replace(/\s+/g, '');
        return {
          el,
          text,
          rect,
          bg: style.backgroundColor || '',
          color: style.color || '',
          cls: String(el.className || ''),
        };
      })
      .filter(item => {
        if (item.text.includes('取消') || item.text.includes('定时')) return false;
        const inBottomBar = item.rect.top > window.innerHeight - 180;
        const looksRed = /rgb\((2[0-5]\d|1\d\d),\s*([0-9]|[1-9]\d),\s*([0-9]|[1-9]\d)\)/.test(item.bg);
        return inBottomBar && (looksRed || /预览并发布|确认发布|发布/.test(item.text));
      })
      .sort((a, b) => {
        const score = item => (/预览并发布|确认发布/.test(item.text) ? 1000 : 0) + item.rect.left + item.rect.width;
        return score(b) - score(a);
      });
    const target = nodes[0];
    if (!target) return null;
    return {
      text: target.text || '底部主按钮',
      x: target.rect.left + target.rect.width / 2,
      y: target.rect.top + target.rect.height / 2,
      width: target.rect.width,
      height: target.rect.height,
    };
  });
  if (!target) return '';
  await page.mouse.click(target.x, target.y);
  return `${target.text}@${Math.round(target.x)},${Math.round(target.y)}`;
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
  if (confirmClicked) {
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
  const networkMonitor = createToutiaoNetworkMonitor(page);

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

    const publishResult = await clickFinalToutiaoPublish(page, addLog, networkMonitor);
    await saveCookies(page, cookiePath);
    if (publishResult.ok) return { url: publishResult.url || page.url() };

    addLog(`头条未确认发布成功：${publishResult.reason}`);
    const networkSnippets = networkMonitor.snippets();
    if (networkSnippets.length) addLog(`头条接口记录：${networkSnippets.join(' || ')}`);
    await saveDebugSnapshot(page, 'toutiao', 'publish-blocked', addLog);
    addLog('头条仍停在发布页，已保存截图；线上服务器无法人工点确认');
    await waitForManualAction(addLog, '等待手动确认头条发布', 300000);
    return { url: page.url(), manual: true };

  } finally {
    networkMonitor.stop();
    await browser.close();
  }
}

module.exports = { publish };
