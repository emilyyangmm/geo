/**
 * 百度百家号发布模块
 * 登录地址: https://baijiahao.baidu.com
 */

const { launchBrowser, saveCookies, loadCookies, waitForManualAction } = require('./base');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const BAIJIAHAO_COVER_UPLOAD_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '\u0070\u0064\u0064\u5546\u54c1\u56fe',
  '\u0030\u0030\u005f\u5546\u54c1\u5c01\u9762\u005f\u0039\u0030\u0030\u0078\u0039\u0030\u0030\u002e\u006a\u0070\u0067',
);
const BAIJIAHAO_COVER_PATH = path.resolve(__dirname, '..', '..', 'pdd商品图', '00_商品封面_900x900.jpg');

async function waitForAnySelector(page, selectors, timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const found = await findInFrames(page, selectors);
    if (found) return found;
    await page.waitForTimeout(500);
  }
  return null;
}

async function findInFrames(page, selectors) {
  for (const frame of page.frames()) {
    for (const selector of selectors) {
      try {
        const handle = await frame.$(selector);
        if (handle) return { frame, handle, selector };
      } catch {}
    }
  }
  return null;
}

function setClipboardText(text) {
  return new Promise((resolve, reject) => {
    const tmpPath = path.join(os.tmpdir(), `geo-baijiahao-${Date.now()}.txt`);
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

async function pastePlainText(frame, page, text) {
  await setClipboardText(text);
  await frame.evaluate(() => window.focus()).catch(() => {});
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyV');
  await page.keyboard.up('Control');
}

async function clickByText(page, texts) {
  const list = Array.isArray(texts) ? texts : [texts];
  return page.evaluate((targets) => {
    const isVisible = (node) => {
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 4 && rect.height > 4;
    };
    const nodes = [...document.querySelectorAll('button, a, label, span, div, [role="button"]')];
    for (const target of targets) {
      const matches = nodes
        .filter(node => {
          if (!isVisible(node)) return false;
          const text = (node.innerText || node.textContent || '').replace(/\s+/g, '');
          return text === target || text.includes(target);
        })
        .map(node => {
          const rect = node.getBoundingClientRect();
          const text = (node.innerText || node.textContent || '').replace(/\s+/g, '');
          const tag = node.tagName.toLowerCase();
          const interactive = tag === 'button' || tag === 'a' || tag === 'label' || node.getAttribute('role') === 'button';
          return { node, text, exact: text === target, interactive, area: rect.width * rect.height };
        })
        .filter(item => item.area < 120000);
      matches.sort((a, b) => {
        if (a.exact !== b.exact) return a.exact ? -1 : 1;
        if (a.interactive !== b.interactive) return a.interactive ? -1 : 1;
        return a.area - b.area;
      });
      const el = matches[0]?.node;
      if (el) {
        el.scrollIntoView({ block: 'center' });
        el.click();
        return target;
      }
    }
    return '';
  }, list);
}

async function clickVisibleButtonByText(page, texts) {
  const list = Array.isArray(texts) ? texts : [texts];
  return page.evaluate((targets) => {
    const isVisible = (node) => {
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 4 && rect.height > 4;
    };
    const nodes = [...document.querySelectorAll('button, [role="button"], a')];
    for (const target of targets) {
      const matches = nodes
        .filter(node => {
          if (!isVisible(node)) return false;
          const disabled = node.disabled || node.getAttribute('aria-disabled') === 'true' || String(node.className || '').includes('disabled');
          if (disabled) return false;
          const text = (node.innerText || node.textContent || '').replace(/\s+/g, '');
          return text === target || text.includes(target);
        })
        .map(node => {
          const rect = node.getBoundingClientRect();
          const text = (node.innerText || node.textContent || '').replace(/\s+/g, '');
          return { node, text, exact: text === target, area: rect.width * rect.height };
        })
        .filter(item => item.area < 80000);
      matches.sort((a, b) => {
        if (a.exact !== b.exact) return a.exact ? -1 : 1;
        return a.area - b.area;
      });
      const el = matches[0]?.node;
      if (el) {
        el.scrollIntoView({ block: 'center' });
        el.click();
        return (el.innerText || el.textContent || target).trim();
      }
    }
    return '';
  }, list);
}

async function clickBaijiahaoPublishButton(page) {
  return page.evaluate(() => {
    const isVisible = (node) => {
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 4 && rect.height > 4;
    };
    const normalize = text => (text || '').replace(/\s+/g, '');
    const buttons = [...document.querySelectorAll('button, [role="button"], a')]
      .filter(isVisible)
      .map(node => {
        const rect = node.getBoundingClientRect();
        const text = normalize(node.innerText || node.textContent);
        const disabled = node.disabled || node.getAttribute('aria-disabled') === 'true' || String(node.className || '').includes('disabled');
        return { node, rect, text, disabled };
      })
      .filter(item => !item.disabled && ['发布', '确认发布', '提交发布'].includes(item.text));
    buttons.sort((a, b) => {
      if (a.text !== b.text) {
        if (a.text.includes('确认') || a.text.includes('提交')) return -1;
        if (b.text.includes('确认') || b.text.includes('提交')) return 1;
      }
      if (Math.abs(a.rect.y - b.rect.y) > 8) return b.rect.y - a.rect.y;
      return b.rect.x - a.rect.x;
    });
    const target = buttons[0];
    if (!target) return null;
    target.node.scrollIntoView({ block: 'center' });
    const rect = target.node.getBoundingClientRect();
    return {
      text: target.text,
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      note: `${target.text}@${Math.round(rect.x)},${Math.round(rect.y)}`,
    };
  });
}

async function dismissBaijiahaoGuides(page, addLog) {
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);

  // Do not remove guide DOM nodes. Baijiahao's editor is React-driven and
  // aggressive DOM removal can detach the real title editor.
  const removed = [];
  /*
  const removed = await page.evaluate(() => {
    const isVisible = (node) => {
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 4 && rect.height > 4;
    };
    const normalize = text => (text || '').replace(/\s+/g, '');
    const guideWords = [
      '新增生图功能',
      'AI工具收起',
      'AI工具较强与润色收缩到这里',
      '图文新增一键填写功能',
      '欢迎使用AI助手',
      '热点灵感新鲜出炉',
      '意见反馈',
      '我知道了',
      '下一步',
      '上一步',
    ];
    const removable = new Set();

    for (const node of [...document.querySelectorAll('body *')]) {
      if (!isVisible(node)) continue;
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      const text = normalize(node.innerText || node.textContent || '');
      const position = style.position;
      const zIndex = Number.parseInt(style.zIndex, 10) || 0;

      const isLargeMask =
        (position === 'fixed' || position === 'absolute') &&
        rect.width > window.innerWidth * 0.55 &&
        rect.height > window.innerHeight * 0.45 &&
        zIndex >= 100;

      const isGuideText = guideWords.some(word => text.includes(word));
      if (!isLargeMask && !isGuideText) continue;

      let target = node;
      for (let i = 0; i < 5 && target.parentElement && target.parentElement !== document.body; i++) {
        const parent = target.parentElement;
        const parentRect = parent.getBoundingClientRect();
        const parentStyle = window.getComputedStyle(parent);
        const parentText = normalize(parent.innerText || parent.textContent || '');
        const parentZ = Number.parseInt(parentStyle.zIndex, 10) || 0;
        const parentFloats = parentStyle.position === 'fixed' || parentStyle.position === 'absolute' || parentZ >= 100;
        const parentLooksGuide = guideWords.some(word => parentText.includes(word));
        const parentReasonableSize = parentRect.width < window.innerWidth * 0.98 && parentRect.height < window.innerHeight * 0.98;

        if ((parentFloats || parentLooksGuide) && parentReasonableSize) {
          target = parent;
          continue;
        }
        break;
      }

      removable.add(target);
    }

    const removedTexts = [];
    for (const node of removable) {
      if (!node.isConnected || node === document.body || node === document.documentElement) continue;
      const rect = node.getBoundingClientRect();
      const text = normalize(node.innerText || node.textContent || '').slice(0, 30);
      if (rect.width < 8 || rect.height < 8) continue;
      node.remove();
      removedTexts.push(text || `${Math.round(rect.width)}x${Math.round(rect.height)}`);
    }
    return removedTexts;
  }).catch(() => []);
  */

  if (removed.length) {
    addLog(`已移除百家号引导浮层：${removed.length} 个`);
    await page.waitForTimeout(500);
  }

  for (let i = 0; i < 4; i++) {
    const clicked = await page.evaluate(() => {
      const isVisible = (node) => {
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 4 && rect.height > 4;
      };
      const normalize = text => (text || '').replace(/\s+/g, '');
      const buttons = [...document.querySelectorAll('button, [role="button"], a, span')]
        .filter(isVisible)
        .map(node => {
          const rect = node.getBoundingClientRect();
          const text = normalize(node.innerText || node.textContent || '');
          const priority =
            text === '完成' ? 0 :
            text === '我知道了' ? 0 :
            text === '跳过' ? 1 :
            text === '下一步' ? 2 :
            text === '关闭' || text === '×' ? 3 :
            9;
          return { node, rect, text, priority, area: rect.width * rect.height };
        })
        .filter(item => item.priority < 9 && item.area < 60000)
        .sort((a, b) => a.priority - b.priority || a.area - b.area);
      const item = buttons[0];
      if (!item) return '';
      const x = item.rect.left + item.rect.width / 2;
      const y = item.rect.top + item.rect.height / 2;
      const target = document.elementFromPoint(x, y) || item.node;
      target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y }));
      target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y }));
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y }));
      return item.text;
    }).catch(() => '');

    if (!clicked) break;
    addLog(`已点击百家号引导按钮：${clicked}`);
    await page.waitForTimeout(500);
  }

  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(200);
}

async function clickBaijiahaoCoverTile(page) {
  const labelBox = await page.evaluate(() => {
    const isVisible = (node) => {
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 4 && rect.height > 4;
    };
    const normalize = text => (text || '').replace(/\s+/g, '');
    const label = [...document.querySelectorAll('label, span, div')]
      .find(node => isVisible(node) && normalize(node.innerText || node.textContent) === '设置封面');
    if (!label) return null;
    label.scrollIntoView({ block: 'center' });
    const rect = label.getBoundingClientRect();
    return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
  });
  if (labelBox) {
    await page.waitForTimeout(300);
    const fresh = await page.evaluate(() => {
      const isVisible = (node) => {
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 4 && rect.height > 4;
      };
      const normalize = text => (text || '').replace(/\s+/g, '');
      const label = [...document.querySelectorAll('label, span, div')]
        .find(node => isVisible(node) && normalize(node.innerText || node.textContent) === '设置封面');
      if (!label) return null;
      const rect = label.getBoundingClientRect();
      return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
    });
    if (fresh) {
      const x = fresh.x + fresh.w + 130;
      const y = fresh.y + 82;
      await page.mouse.click(x, y);
      await page.waitForTimeout(1000);
      const opened = await page.evaluate(() => /AI封图|正文\/本地上传|免费正版图库/.test(document.body.innerText || '')).catch(() => false);
      if (opened) return `封面框(label)@${Math.round(x)},${Math.round(y)}`;
    }
  }

  const layoutBox = await page.evaluate(() => {
    const isVisible = (node) => {
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width >= 120 && rect.height >= 90;
    };
    const normalize = text => (text || '').replace(/\s+/g, '');
    const all = [...document.querySelectorAll('div, button, [role="button"]')];
    const candidates = all
      .filter(isVisible)
      .map(node => {
        const rect = node.getBoundingClientRect();
        const text = normalize(node.innerText || node.textContent);
        const style = window.getComputedStyle(node);
        return {
          node,
          text,
          x: rect.x,
          y: rect.y,
          w: rect.width,
          h: rect.height,
          area: rect.width * rect.height,
          bg: style.backgroundColor,
          border: style.borderColor,
        };
      })
      .filter(item => {
        if (item.area > 120000) return false;
        if (item.text.includes('活动投稿') || item.text.includes('智能创作') || item.text.includes('创作声明')) return false;
        const looksLikeCoverText = item.text.includes('选择封面') || item.text.includes('设置封面') || item.text.includes('上传');
        const looksLikeCoverBox = item.w >= 150 && item.w <= 260 && item.h >= 100 && item.h <= 180 && item.x < 700;
        return looksLikeCoverText || looksLikeCoverBox;
      })
      .sort((a, b) => {
        const aText = a.text.includes('选择封面');
        const bText = b.text.includes('选择封面');
        if (aText !== bText) return aText ? -1 : 1;
        const aBox = a.w >= 150 && a.w <= 260 && a.h >= 100 && a.h <= 180;
        const bBox = b.w >= 150 && b.w <= 260 && b.h >= 100 && b.h <= 180;
        if (aBox !== bBox) return aBox ? -1 : 1;
        return b.area - a.area;
      });
    const target = candidates[0];
    if (!target) return null;
    target.node.scrollIntoView({ block: 'center' });
    const rect = target.node.getBoundingClientRect();
    return { x: rect.x, y: rect.y, w: rect.width, h: rect.height, text: target.text };
  });
  if (layoutBox) {
    await page.mouse.click(layoutBox.x + layoutBox.w / 2, layoutBox.y + layoutBox.h / 2);
    await page.waitForTimeout(800);
    const opened = await page.evaluate(() => /AI封图|正文\/本地上传|免费正版图库/.test(document.body.innerText || '')).catch(() => false);
    if (opened) return `封面框(layout)@${Math.round(layoutBox.x)},${Math.round(layoutBox.y)},${Math.round(layoutBox.w)}x${Math.round(layoutBox.h)}`;
  }

  const domClicked = await page.evaluate(() => {
    const isVisible = (node) => {
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 20 && rect.height > 20;
    };
    const normalize = text => (text || '').replace(/\s+/g, '');
    const nodes = [...document.querySelectorAll('div, button, [role="button"], span')].filter(isVisible);
    const matches = nodes
      .map(node => {
        const rect = node.getBoundingClientRect();
        const text = normalize(node.innerText || node.textContent);
        return { node, rect, text, area: rect.width * rect.height };
      })
      .filter(item => item.text.includes('选择封面') && item.area < 90000);
    matches.sort((a, b) => {
      const aExact = a.text === '选择封面';
      const bExact = b.text === '选择封面';
      if (aExact !== bExact) return aExact ? -1 : 1;
      return b.area - a.area;
    });
    const target = matches[0];
    if (!target) return '';
    target.node.scrollIntoView({ block: 'center' });
    const freshRect = target.node.getBoundingClientRect();
    const x = freshRect.left + freshRect.width / 2;
    const y = freshRect.top + freshRect.height / 2;
    const clickable = document.elementFromPoint(x, y) || target.node;
    const clickTarget = clickable.closest?.('button, [role="button"], a, div') || clickable;
    clickTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y }));
    clickTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y }));
    clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y }));
    return `选择封面@${Math.round(freshRect.x)},${Math.round(freshRect.y)},${Math.round(freshRect.width)}x${Math.round(freshRect.height)}`;
  });
  if (domClicked) {
    await page.waitForTimeout(800);
    const opened = await page.evaluate(() => /AI封图|正文\/本地上传|免费正版图库/.test(document.body.innerText || '')).catch(() => false);
    if (opened) return domClicked;
  }

  const box = await page.evaluate(() => {
    const isVisible = (node) => {
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 20 && rect.height > 20;
    };
    const normalize = text => (text || '').replace(/\s+/g, '');
    const matches = [...document.querySelectorAll('div, button, [role="button"], span')]
      .filter(isVisible)
      .map(node => {
        const rect = node.getBoundingClientRect();
        const text = normalize(node.innerText || node.textContent);
        return { text, x: rect.x, y: rect.y, w: rect.width, h: rect.height, area: rect.width * rect.height };
      })
      .filter(item => item.text.includes('选择封面') && item.area < 90000)
      .sort((a, b) => {
        const aExact = a.text === '选择封面';
        const bExact = b.text === '选择封面';
        if (aExact !== bExact) return aExact ? -1 : 1;
        return b.area - a.area;
      });
    return matches[0] || null;
  });
  if (!box) return domClicked || '';
  await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
  return `选择封面(mouse)@${Math.round(box.x)},${Math.round(box.y)},${Math.round(box.w)}x${Math.round(box.h)}`;
}

async function uploadBaijiahaoCover(page, addLog) {
  const coverPath = fs.existsSync(BAIJIAHAO_COVER_UPLOAD_PATH) ? BAIJIAHAO_COVER_UPLOAD_PATH : BAIJIAHAO_COVER_PATH;
  if (!fs.existsSync(coverPath)) {
    addLog('未找到百家号封面图文件，跳过封面上传');
    return false;
  }
  addLog('上传百家号封面...');
  await clickByText(page, '单图');
  const chooserPromise = page.waitForFileChooser({ timeout: 10000 }).catch(() => null);
  const clicked = await clickByText(page, ['选择封面', '设置封面', '上传封面']);
  const chooser = clicked ? await chooserPromise : null;
  if (chooser) {
    await chooser.accept([coverPath]);
    await page.waitForTimeout(2000);
    const confirm = await clickByText(page, ['确定', '完成', '使用', '保存']);
    if (confirm) {
      addLog(`已确认百家号封面：${confirm}`);
      await page.waitForTimeout(1500);
    } else {
      addLog('百家号封面已上传，请手动确认弹窗');
    }
    return true;
  }
  const fileInput = await waitForAnySelector(page, ['input[type="file"][accept*="image"]', 'input[type="file"]'], 3000);
  if (fileInput) {
    await fileInput.handle.uploadFile(coverPath);
    addLog('已通过文件输入框上传百家号封面');
    await page.waitForTimeout(2000);
    const confirm = await clickByText(page, ['确定', '完成', '使用', '保存']);
    if (confirm) addLog(`已确认百家号封面：${confirm}`);
    return true;
  }
  addLog('未找到百家号封面上传控件，请手动选择封面');
  return false;
}

async function useBaijiahaoAiCover(page, addLog, title = '') {
  addLog('尝试使用百家号 AI 封图...');

  const opened = await clickBaijiahaoCoverTile(page) || await clickByText(page, ['AI封图', '选择封面', '设置封面']);
  if (opened) {
    addLog(`已打开百家号封面面板：${opened}`);
    await page.waitForTimeout(1500);
  }

  const aiTab = await page.evaluate(() => {
    const isVisible = (node) => {
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 4 && rect.height > 4;
    };
    const normalize = text => (text || '').replace(/\s+/g, '');
    const nodes = [...document.querySelectorAll('button, [role="button"], a, span, div, label')];
    const target = nodes.find(node => isVisible(node) && normalize(node.innerText || node.textContent) === 'AI封图');
    if (!target) return '';
    target.scrollIntoView({ block: 'center' });
    target.click();
    return 'AI封图';
  }).catch(() => '');
  if (aiTab) {
    addLog('已切换到百家号 AI 封图');
    await page.waitForTimeout(1000);
  }

  const promptText = `生成一张适合百家号文章封面的横版配图，主题是：${title || '电动车电池安全选购指南'}。画面要清晰、专业、有科技感，包含电动车、电池安全、防护、选购指南等元素，不要出现夸张营销文字。`;
  const promptFilled = await page.evaluate((prompt) => {
    const isVisible = (node) => {
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 20 && rect.height > 16;
    };
    const inputs = [...document.querySelectorAll('textarea, input, [contenteditable="true"]')]
      .filter(isVisible)
      .map(node => {
        const rect = node.getBoundingClientRect();
        const placeholder = node.getAttribute('placeholder') || '';
        return { node, rect, placeholder };
      })
      .filter(item => /图片|生成|提示词|主题|描述|请输入/.test(item.placeholder) || item.rect.width > 300);
    inputs.sort((a, b) => b.rect.y - a.rect.y);
    const target = inputs[0]?.node;
    if (!target) return '';
    target.focus();
    if (target.isContentEditable) {
      document.execCommand('selectAll');
      document.execCommand('insertText', false, prompt);
    } else {
      target.value = prompt;
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return target.getAttribute('placeholder') || target.tagName;
  }, promptText).catch(() => '');

  if (promptFilled) {
    addLog(`已填写百家号 AI 封面提示词：${promptFilled}`);
    await page.waitForTimeout(500);
    const sent = await page.evaluate(() => {
      const isVisible = (node) => {
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 8 && rect.height > 8;
      };
      const inputs = [...document.querySelectorAll('textarea, input, [contenteditable="true"]')].filter(isVisible);
      const inputRect = inputs
        .map(node => node.getBoundingClientRect())
        .filter(rect => rect.width > 250)
        .sort((a, b) => b.y - a.y)[0];
      const candidates = [...document.querySelectorAll('button, [role="button"], svg, span, div')]
        .filter(isVisible)
        .map(node => {
          const rect = node.getBoundingClientRect();
          const text = (node.innerText || node.textContent || '').replace(/\s+/g, '');
          return { node, rect, text };
        })
        .filter(item => {
          if (item.text && /发送|生成|提交|确定/.test(item.text)) return true;
          if (!inputRect) return false;
          return item.rect.x > inputRect.right - 80 && item.rect.x < inputRect.right + 30 &&
            item.rect.y > inputRect.y - 10 && item.rect.y < inputRect.bottom + 10;
        })
        .sort((a, b) => {
          const aText = /发送|生成|提交|确定/.test(a.text);
          const bText = /发送|生成|提交|确定/.test(b.text);
          if (aText !== bText) return aText ? -1 : 1;
          return (a.rect.width * a.rect.height) - (b.rect.width * b.rect.height);
        });
      const target = candidates[0];
      if (!target) return '';
      const node = target.node.closest?.('button, [role="button"], a, div') || target.node;
      node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
      node.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
      node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return target.text || `button@${Math.round(target.rect.x)},${Math.round(target.rect.y)}`;
    }).catch(() => '');
    if (sent) {
      addLog(`已点击百家号 AI 封面生成按钮：${sent}`);
      await page.waitForTimeout(15000);
    } else {
      addLog('未找到百家号 AI 封面生成按钮，请手动点纸飞机生成');
    }
  }

  const action = await page.evaluate(() => {
    const isVisible = (node) => {
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 4 && rect.height > 4;
    };
    const normalize = text => (text || '').replace(/\s+/g, '');
    const nodes = [...document.querySelectorAll('button, [role="button"], a, span, div')];
    const candidates = [
      '根据全文智能生成封面',
      '一键智能生图',
      '智能生成封面',
      '生成AI图片',
      '生成封面',
      '立即生成',
      '重新生成',
    ];
    const target = nodes.find(node => {
      if (!isVisible(node)) return false;
      const text = normalize(node.innerText || node.textContent);
      if (!text) return false;
      if (text.includes('免费正版图库') || text.includes('正文/本地上传')) return false;
      return candidates.some(item => text === item || text.includes(item));
    });
    if (!target) return '';
    target.scrollIntoView({ block: 'center' });
    target.click();
    return normalize(target.innerText || target.textContent);
  }).catch(() => '');

  if (action) {
    addLog(`已触发百家号 AI 封面：${action}`);
    await page.waitForTimeout(12000);
  }

  const selected = await page.evaluate(() => {
    const isVisible = (node) => {
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 4 && rect.height > 4;
    };
    const normalize = text => (text || '').replace(/\s+/g, '');
    const nodes = [...document.querySelectorAll('button, [role="button"], a, span, div')];
    const target = nodes.find(node => {
      if (!isVisible(node)) return false;
      const text = normalize(node.innerText || node.textContent);
      if (!text) return false;
      if (text.includes('取消') || text.includes('关闭') || text === '×') return false;
      return ['使用', '选用', '确定', '完成', '保存', '设为封面'].some(item => text === item || text.includes(item));
    });
    if (!target) return '';
    target.scrollIntoView({ block: 'center' });
    target.click();
    return normalize(target.innerText || target.textContent);
  }).catch(() => '');

  if (selected) {
    addLog(`已选用百家号 AI 封面：${selected}`);
    await page.waitForTimeout(2000);
    return true;
  }

  const text = await page.evaluate(() => document.body.innerText || '').catch(() => '');
  if (/AI封图|根据全文智能生成封面|一键智能生图|请输入图片生成的提示词/.test(text)) {
    addLog('已进入百家号 AI 封图面板，但未找到可自动点击的生成/使用按钮');
    return false;
  }

  addLog('未检测到百家号 AI 封图入口');
  return false;
}

async function getBaijiahaoVisibleDiagnostics(page) {
  return page.evaluate(() => {
    const isVisible = (node) => {
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 4 && rect.height > 4;
    };
    const normalize = text => (text || '').replace(/\s+/g, ' ').trim();
    const nodes = [...document.querySelectorAll('button, [role="button"], a, label, span, div')].filter(isVisible);
    const lines = nodes
      .map(el => normalize(el.innerText || el.textContent))
      .filter(Boolean)
      .filter(text => text.length <= 80)
      .filter(text => /请选择|请上传|不能为空|失败|错误|认证|审核|发布成功|提交成功|封面不|图片不|格式|确认|确定|使用|选用/.test(text))
      .filter((text, index, arr) => arr.indexOf(text) === index)
      .slice(0, 12);
    const buttons = [...document.querySelectorAll('button, [role="button"], a')]
      .filter(isVisible)
      .map(el => normalize(el.innerText || el.textContent))
      .filter(Boolean)
      .filter(text => text.length <= 20)
      .filter((text, index, arr) => arr.indexOf(text) === index)
      .slice(0, 16);
    return { lines, buttons };
  }).catch(() => ({ lines: [], buttons: [] }));
}

async function confirmBaijiahaoPublish(page, addLog) {
  addLog('尝试确认百家号发布...');
  await dismissBaijiahaoGuides(page, addLog);
  const clicked = await clickBaijiahaoPublishButton(page) || await clickVisibleButtonByText(page, ['确认发布', '提交发布', '发布']);
  if (!clicked) return { ok: false, reason: '未找到发布按钮' };
  if (typeof clicked === 'object') {
    await page.mouse.click(clicked.x, clicked.y);
    addLog(`已点击百家号按钮：${clicked.note || clicked.text}`);
  } else {
    addLog(`已点击百家号按钮：${clicked}`);
  }
  await Promise.race([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => null),
    page.waitForTimeout(3000),
  ]);

  for (let i = 0; i < 3; i++) {
    const second = await clickBaijiahaoConfirm(page);
    if (!second) break;
    if (typeof second === 'object') {
      await page.mouse.click(second.x, second.y);
      addLog(`已点击百家号确认按钮：${second.text}`);
    } else {
      addLog(`已点击百家号确认按钮：${second}`);
    }
    await Promise.race([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => null),
      page.waitForTimeout(2500),
    ]);
    const quickStatus = await page.evaluate(() => {
      const text = document.body.innerText || '';
      if (/发布成功|提交成功|审核中|已发布|发布完成/.test(text)) return 'success';
      return '';
    }).catch(() => '');
    if (quickStatus === 'success') break;
  }

  const status = await page.evaluate(() => {
    const isVisible = (node) => {
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 4 && rect.height > 4;
    };
    const visibleText = [...document.querySelectorAll('body *')]
      .filter(isVisible)
      .map(el => el.innerText || el.textContent || '')
      .join('\n');
    const text = visibleText || document.body.innerText || '';
    if (/发布成功|提交成功|审核中|已发布|发布完成/.test(text)) return 'success';
    if (/AI封图|根据全文智能生成封面|一键智能生图|请输入图片生成的提示词/.test(text)) return 'cover';
    if (/请选择封面|请上传封面|封面不能为空|图片不正确|图片格式|请选择|请上传|不能为空|失败|错误|认证|审核不通过/.test(text)) return 'blocked';
    return 'unknown';
  }).catch(() => 'unknown');
  if (status === 'cover') {
    const aiCoverOk = await useBaijiahaoAiCover(page, addLog);
    if (aiCoverOk) return confirmBaijiahaoPublish(page, addLog);
  }
  if (status === 'success') return { ok: true, url: page.url() };
  if (!page.url().includes('/builder/rc/edit')) return { ok: true, url: page.url() };
  const debug = await getBaijiahaoVisibleDiagnostics(page);
  addLog(`百家号可见提示：${debug.lines.join(' | ') || '无明显错误提示'}`);
  addLog(`百家号可见按钮：${debug.buttons.join('、') || '无'}`);
  return { ok: false, reason: status === 'blocked' ? '页面提示仍需补充资料/认证' : '未检测到发布成功提示' };
}

async function clickBaijiahaoConfirm(page) {
  return page.evaluate(() => {
    const isVisible = (node) => {
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 4 && rect.height > 4;
    };
    const nodes = [...document.querySelectorAll('button, [role="button"], a')];
    const candidates = nodes.filter(node => {
      if (!isVisible(node)) return false;
      const text = (node.innerText || node.textContent || '').replace(/\s+/g, '');
      const disabled = node.disabled || node.getAttribute('aria-disabled') === 'true' || String(node.className || '').includes('disabled');
      if (disabled) return false;
      if (text.includes('取消') || text.includes('关闭') || text === '×') return false;
      return ['确认发布', '确定发布', '提交发布', '确认', '确定'].some(t => text === t || text.includes(t));
    });
    const target = candidates[candidates.length - 1];
    if (!target) return null;
    target.scrollIntoView({ block: 'center' });
    const rect = target.getBoundingClientRect();
    return {
      text: (target.innerText || target.textContent || '').trim(),
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  });
}

async function focusHandle(frame, handle) {
  await frame.evaluate(el => {
    el.scrollIntoView({ block: 'center' });
    if (typeof el.focus === 'function') el.focus();
  }, handle);
}

async function clickBaijiahaoPlaceholder(page, pattern, addLog) {
  const box = await page.evaluate((source) => {
    const re = new RegExp(source);
    const isVisible = (node) => {
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 4 && rect.height > 4;
    };
    const normalize = text => (text || '').replace(/\s+/g, '');
    const candidates = [...document.querySelectorAll('input, textarea, [contenteditable="true"], div, span')]
      .filter(isVisible)
      .map(node => {
        const rect = node.getBoundingClientRect();
        const text = normalize(node.innerText || node.textContent || node.getAttribute('placeholder') || node.getAttribute('aria-label') || '');
        const placeholder = normalize(node.getAttribute('placeholder') || node.getAttribute('data-placeholder') || node.getAttribute('aria-label') || '');
        return { node, rect, text, placeholder, area: rect.width * rect.height, tag: node.tagName };
      })
      .filter(item => re.test(item.text) || re.test(item.placeholder))
      .filter(item => item.area < 900000)
      .sort((a, b) => {
        const aExact = re.test(a.placeholder) || a.text === source.replace(/\\/g, '');
        const bExact = re.test(b.placeholder) || b.text === source.replace(/\\/g, '');
        if (aExact !== bExact) return aExact ? -1 : 1;
        return a.area - b.area;
      });
    const target = candidates[0];
    if (!target) return null;
    target.node.scrollIntoView({ block: 'center' });
    const rect = target.node.getBoundingClientRect();
    return { x: rect.left + Math.min(rect.width / 2, 120), y: rect.top + rect.height / 2, w: rect.width, h: rect.height, text: target.text || target.placeholder };
  }, pattern.source);
  if (!box) {
    const fallback = await page.evaluate((source) => {
      const isTitle = source.includes('标题');
      const editor = [...document.querySelectorAll('div')]
        .map(node => {
          const rect = node.getBoundingClientRect();
          const text = (node.innerText || node.textContent || '').replace(/\s+/g, '');
          return { node, rect, text, area: rect.width * rect.height };
        })
        .filter(item => item.rect.width > 700 && item.rect.width < 1000 && item.rect.height > 500 && item.text.includes('请输入正文'))
        .sort((a, b) => a.area - b.area)[0];
      if (!editor) return null;
      editor.node.scrollIntoView({ block: 'start' });
      const rect = editor.node.getBoundingClientRect();
      return isTitle
        ? { x: rect.left + 120, y: rect.top + 110, note: 'title-fallback' }
        : { x: rect.left + 120, y: rect.top + 210, note: 'body-fallback' };
    }, pattern.source);
    if (!fallback) {
      addLog(`没有找到百家号占位区域：${pattern}`);
      return false;
    }
    await page.mouse.click(fallback.x, fallback.y);
    await page.waitForTimeout(300);
    addLog(`已用百家号坐标兜底定位：${fallback.note}@${Math.round(fallback.x)},${Math.round(fallback.y)}`);
    return true;
  }
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(300);
  return true;
}

async function fillBaijiahaoTitleAndBody(page, title, content, addLog) {
  addLog('填写标题...');
  const titleClicked = await clickBaijiahaoPlaceholder(page, /请输入标题|标题/, addLog);
  if (!titleClicked) throw new Error('没有找到百家号标题输入位置');
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await page.keyboard.type(title, { delay: 20 });
  await page.waitForTimeout(500);

  const titleSnapshot = await page.evaluate(() => {
    const active = document.activeElement;
    return (active?.innerText || active?.textContent || active?.value || '').replace(/\s+/g, '').slice(0, 120);
  }).catch(() => '');
  addLog(`标题已填写：${titleSnapshot.slice(0, 40) || title.slice(0, 40)}`);

  addLog('填写正文...');
  const bodyClicked = await clickBaijiahaoPlaceholder(page, /请输入正文|正文/, addLog);
  if (!bodyClicked) throw new Error('没有找到百家号正文输入位置');
  await page.waitForTimeout(300);
  const plainText = content.replace(/#{1,6}\s/g, '\n\n').replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1').trim();
  await setClipboardText(plainText);
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyV');
  await page.keyboard.up('Control');
  await page.waitForTimeout(1000);

  const verify = await page.evaluate((expectedTitle) => {
    const normalize = text => (text || '').replace(/\s+/g, '');
    const body = normalize(document.body.innerText || '');
    const titleIndex = body.indexOf(normalize(expectedTitle).slice(0, 12));
    const textCount = body.length;
    return { titleIndex, textCount };
  }, title).catch(() => ({ titleIndex: -1, textCount: 0 }));
  addLog(`正文已填写，页面文本约 ${verify.textCount} 字`);
}

async function findBaijiahaoEditorBoxV2(page) {
  return page.evaluate(() => {
    const isVisible = (node) => {
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 50 && rect.height > 50;
    };
    const normalize = text => (text || '').replace(/\s+/g, '');
    const titleText = '\u8bf7\u8f93\u5165\u6807\u9898';
    const bodyText = '\u8bf7\u8f93\u5165\u6b63\u6587';
    const candidates = [...document.querySelectorAll('div')]
      .filter(isVisible)
      .map(node => {
        const rect = node.getBoundingClientRect();
        const text = normalize(node.innerText || node.textContent || '');
        return { node, rect, text, area: rect.width * rect.height };
      })
      .filter(item => item.rect.width > 650 && item.rect.width < 1100 && item.rect.height > 350)
      .filter(item => item.text.includes(titleText) || item.text.includes(bodyText))
      .sort((a, b) => a.area - b.area);
    const target = candidates[0];
    if (!target) return null;
    target.node.scrollIntoView({ block: 'start' });
    const rect = target.node.getBoundingClientRect();
    return { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
  });
}

async function waitForBaijiahaoEditorReady(page, timeout = 45000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const ready = await page.evaluate(() => {
      const text = document.body.innerText || '';
      const hasTitle = text.includes('\u8bf7\u8f93\u5165\u6807\u9898');
      const hasBody = text.includes('\u8bf7\u8f93\u5165\u6b63\u6587');
      const titleEditor = [...document.querySelectorAll('[contenteditable="true"]')]
        .some(node => {
          const rect = node.getBoundingClientRect();
          return rect.width > 300 && rect.height > 20 && rect.top < 320;
        });
      return hasTitle && hasBody && titleEditor;
    }).catch(() => false);
    const blankFrames = page.frames().filter(frame => frame !== page.mainFrame() && frame.url() === 'about:blank');
    let bodyFrame = blankFrames[blankFrames.length - 1] || null;
    const frameReady = !!bodyFrame;
    if (ready && frameReady) return bodyFrame;
    await page.waitForTimeout(1000);
  }
  throw new Error('百家号编辑器加载超时：没有等到标题框和正文 iframe');
}

async function clickBaijiahaoEditorAreaV2(page, area, addLog) {
  if (area === 'title') {
    const clickedTitle = await page.evaluate(() => {
      const candidates = [...document.querySelectorAll('[contenteditable="true"]')]
        .map(node => {
          const rect = node.getBoundingClientRect();
          return { node, rect, area: rect.width * rect.height };
        })
        .filter(item => item.rect.width > 300 && item.rect.height > 20 && item.rect.top < 320)
        .sort((a, b) => a.rect.top - b.rect.top || b.area - a.area);
      const target = candidates[0]?.node;
      if (!target) return null;
      target.scrollIntoView({ block: 'center' });
      target.focus();
      const rect = target.getBoundingClientRect();
      return { x: rect.left + 20, y: rect.top + rect.height / 2 };
    });
    if (clickedTitle) {
      await page.mouse.click(clickedTitle.x, clickedTitle.y);
      await page.waitForTimeout(300);
      addLog(`已定位百家号标题输入框：${Math.round(clickedTitle.x)},${Math.round(clickedTitle.y)}`);
      return true;
    }
  }

  const box = await findBaijiahaoEditorBoxV2(page);
  if (!box) {
    const viewport = page.viewport() || { width: 1365, height: 768 };
    const point = area === 'title'
      ? { x: Math.round(viewport.width * 0.36), y: 205 }
      : { x: Math.round(viewport.width * 0.36), y: 295 };
    await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(300);
    addLog(`已用固定坐标定位百家号${area === 'title' ? '标题' : '正文'}区域：${point.x},${point.y}`);
    return true;
  }
  const point = area === 'title'
    ? { x: box.x + 120, y: box.y + 95 }
    : { x: box.x + 120, y: box.y + 190 };
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(300);
  addLog(`已定位百家号${area === 'title' ? '标题' : '正文'}区域：${Math.round(point.x)},${Math.round(point.y)}`);
  return true;
}

async function setBaijiahaoTitle(page, title) {
  return page.evaluate((value) => {
    const editors = [...document.querySelectorAll('[contenteditable="true"]')]
      .map(node => {
        const rect = node.getBoundingClientRect();
        return { node, rect, area: rect.width * rect.height };
      })
      .filter(item => item.rect.width > 200 && item.rect.height > 18)
      .sort((a, b) => a.rect.top - b.rect.top || b.area - a.area);
    const target = editors[0]?.node;
    if (!target) return false;
    target.scrollIntoView({ block: 'center' });
    target.focus();
    target.textContent = value;
    target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, title);
}

async function setBaijiahaoBody(frame, content) {
  return frame.evaluate((value) => {
    if (!document.body) return false;
    const escapeHtml = (text) => text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    const paragraphs = value
      .split(/\n{2,}|\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => `<p>${escapeHtml(line)}</p>`)
      .join('');
    document.body.innerHTML = paragraphs || '<p><br></p>';
    document.body.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    document.body.dispatchEvent(new Event('change', { bubbles: true }));
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
    return true;
  }, content);
}

async function clickBaijiahaoBodyArea(page) {
  const point = await page.evaluate(() => {
    const isVisible = (node) => {
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 20 && rect.height > 20;
    };
    const iframeHolder = [...document.querySelectorAll('.edui-editor-iframeholder, iframe')]
      .filter(isVisible)
      .map(node => {
        const rect = node.getBoundingClientRect();
        return { x: rect.left, y: rect.top, w: rect.width, h: rect.height, area: rect.width * rect.height };
      })
      .filter(rect => rect.w > 300 && rect.h > 180)
      .sort((a, b) => b.area - a.area)[0];
    if (iframeHolder) return { x: iframeHolder.x + 110, y: iframeHolder.y + 35 };

    const placeholder = [...document.querySelectorAll('div, span')]
      .filter(isVisible)
      .map(node => {
        const rect = node.getBoundingClientRect();
        const text = (node.innerText || node.textContent || '').replace(/\s+/g, '');
        return { text, x: rect.left, y: rect.top, w: rect.width, h: rect.height };
      })
      .find(item => item.text.includes('\u8bf7\u8f93\u5165\u6b63\u6587'));
    if (placeholder) return { x: placeholder.x + 20, y: placeholder.y + 20 };
    return null;
  });
  if (!point) return false;
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(300);
  return true;
}

async function fillBaijiahaoTitleAndBodyV2(page, title, content, addLog) {
  const bodyFrame = await waitForBaijiahaoEditorReady(page);
  await dismissBaijiahaoGuides(page, addLog);

  addLog('填写标题...');
  const titleWritten = await setBaijiahaoTitle(page, title);
  if (!titleWritten) throw new Error('没有找到百家号标题输入位置');
  await page.waitForTimeout(500);
  addLog(`标题已填写：${title.slice(0, 40)}`);
  await dismissBaijiahaoGuides(page, addLog);

  addLog('填写正文...');
  const plainText = content.replace(/#{1,6}\s/g, '\n\n').replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1').trim();
  const bodyClicked = await clickBaijiahaoBodyArea(page);
  if (!bodyClicked) throw new Error('没有找到百家号正文点击区域');
  await setClipboardText(plainText);
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyV');
  await page.keyboard.up('Control');
  await page.waitForTimeout(800);
  let bodyWritten = await bodyFrame.evaluate((expectedBodyStart) => {
    const text = (document.body.innerText || '').replace(/\s+/g, '');
    return text.includes(expectedBodyStart.replace(/\s+/g, '').slice(0, 20));
  }, plainText).catch(() => false);
  if (!bodyWritten) bodyWritten = await setBaijiahaoBody(bodyFrame, plainText);
  if (!bodyWritten) throw new Error('没有找到百家号正文 iframe');
  await page.waitForTimeout(1000);
  await dismissBaijiahaoGuides(page, addLog);
  const check = await page.evaluate((expectedTitle) => {
    const text = (document.body.innerText || '').replace(/\s+/g, '');
    const titleOk = text.includes(expectedTitle.replace(/\s+/g, '').slice(0, 12));
    const isVisible = (node) => {
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 4 && rect.height > 4;
    };
    const visibleGuideText = [...document.querySelectorAll('body *')]
      .filter(isVisible)
      .map(node => node.innerText || node.textContent || '')
      .join('\n');
    const guideOpen = /新增生图功能|AI工具收起|我知道了|下一步/.test(visibleGuideText);
    return { titleOk, guideOpen };
  }, title).catch(() => ({ titleOk: false, guideOpen: false }));
  check.bodyOk = await bodyFrame.evaluate((expectedBodyStart) => {
    const text = (document.body.innerText || '').replace(/\s+/g, '');
    return text.includes(expectedBodyStart.replace(/\s+/g, '').slice(0, 20));
  }, plainText).catch(() => false);

  if (check.guideOpen) addLog('检测到百家号仍有可见引导/助手提示，但标题正文已完成校验，继续保留窗口给你确认');
  if (!check.titleOk) throw new Error('标题没有写入百家号编辑器');
  if (!check.bodyOk) throw new Error('正文没有写入百家号编辑器');
  addLog(`正文已填写，约 ${plainText.length} 字`);
}

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
        addLog('Cookie 无效，需要手动登录百度/百家号...');
        const userInput = await page.$('#TANGRAM__PSP_3__userName, input[name="userName"], #userName');
        if (userInput && creds.username) {
          await userInput.click({ clickCount: 3 });
          await userInput.type(creds.username, { delay: 40 });
        }

        addLog('请在弹出的浏览器中用扫码/短信/安全验证完成百度登录...');
        await waitForManualAction(addLog, '请完成百家号登录，登录成功后不要关闭浏览器窗口', 120000);
        await saveCookies(page, cookiePath);
        addLog('已保存百家号 Cookie，下次会优先自动登录');

        await page.goto('https://baijiahao.baidu.com/builder/rc/edit?type=news', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
      } else {
        addLog('Cookie 有效，已自动登录');
      }
    }

    // 等待编辑器并按固定节奏填写：标题 -> 正文
    addLog('等待编辑器加载...');
    await page.waitForTimeout(2000);
    await dismissBaijiahaoGuides(page, addLog);
    await fillBaijiahaoTitleAndBodyV2(page, title, content, addLog);
    const shotDir = path.resolve(__dirname, '..', '..', 'tmp', 'baijiahao-runtime');
    if (!fs.existsSync(shotDir)) fs.mkdirSync(shotDir, { recursive: true });
    const shotPath = path.join(shotDir, `filled-${Date.now()}.png`);
    await page.screenshot({ path: shotPath, fullPage: false }).catch(() => null);
    addLog(`百家号填写后截图：${shotPath}`);
    await dismissBaijiahaoGuides(page, addLog);
    const coverOk = await uploadBaijiahaoCover(page, addLog);
    if (coverOk) {
      addLog('百家号封面已处理，最终发布前请肉眼确认封面是否匹配文章');
    } else {
      addLog('百家号封面未自动完成，请在弹出的浏览器里手动选择封面');
    }
    const coverShotPath = path.join(shotDir, `cover-${Date.now()}.png`);
    await page.screenshot({ path: coverShotPath, fullPage: false }).catch(() => null);
    addLog(`百家号封面处理后截图：${coverShotPath}`);

    addLog('百家号标题、正文、封面已处理，开始点击发布...');
    const autoPublishResult = await confirmBaijiahaoPublish(page, addLog);
    await saveCookies(page, cookiePath);
    if (autoPublishResult.ok) return { url: autoPublishResult.url || page.url() };

    addLog(`百家号未确认发布成功：${autoPublishResult.reason}`);
    addLog('请在弹出的浏览器里手动确认最终发布，窗口会保留 5 分钟');
    await waitForManualAction(addLog, '等待手动发布', 300000);
    return { url: page.url(), manual: true };

    // 填写摘要
    if (summary) {
      const abstractEl = await findInFrames(page, ['textarea[placeholder*="摘要"], .abstract-input textarea']);
      if (abstractEl) {
        await focusHandle(abstractEl.frame, abstractEl.handle);
        await page.keyboard.type(summary.slice(0, 200), { delay: 20 });
      }
    }

    await dismissBaijiahaoGuides(page, addLog);
    addLog('开始处理百家号封面...');
    const aiCover = await useBaijiahaoAiCover(page, addLog, title);
    if (!aiCover) {
      addLog('百家号 AI 封面未完成，尝试本地封面上传...');
      await uploadBaijiahaoCover(page, addLog);
    }
    addLog('百家号封面处理步骤结束');
    await clickByText(page, ['采用AI生成内容']);

    addLog('内容填写完毕，准备发布...');
    await page.waitForTimeout(1000);

    const publishResult = await confirmBaijiahaoPublish(page, addLog);
    await saveCookies(page, cookiePath);
    if (publishResult.ok) return { url: publishResult.url || page.url() };

    addLog(`百家号未确认发布成功：${publishResult.reason}`);
    addLog('请在弹出的浏览器里手动确认最终发布，窗口会保留 5 分钟');
    await waitForManualAction(addLog, '等待手动发布', 300000);
    return { url: page.url(), manual: true };

  } finally {
    await browser.close();
  }
}

module.exports = { publish };
