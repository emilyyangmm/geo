/**
 * 基础工具：Cookie 存储、Puppeteer 浏览器启动、Markdown 转换
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const { marked } = require('marked');

function findChromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    `${process.env.LOCALAPPDATA || ''}\\Google\\Chrome\\Application\\chrome.exe`,
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);

  const executablePath = candidates.find(p => fs.existsSync(p));
  if (!executablePath) {
    throw new Error('找不到 Chrome/Edge 浏览器，请先安装 Chrome，或设置 CHROME_PATH 环境变量');
  }
  return executablePath;
}

// 启动浏览器（使用系统 Chrome，无需单独下载）
async function launchBrowser() {
  const executablePath = findChromeExecutable();
  return puppeteer.launch({
    executablePath,
    headless: false,
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'],
  });
}

// 保存 Cookie
async function saveCookies(page, cookiePath) {
  const cookies = await page.cookies();
  fs.writeFileSync(cookiePath, JSON.stringify(cookies, null, 2));
}

// 加载 Cookie（如已保存则跳过登录）
async function loadCookies(page, cookiePath) {
  if (!fs.existsSync(cookiePath)) return false;
  try {
    const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));
    if (!cookies.length) return false;
    await page.setCookie(...cookies);
    return true;
  } catch {
    return false;
  }
}

// Markdown 转 HTML
function mdToHtml(md) {
  return marked.parse(md || '');
}

// 等待并点击
async function clickSelector(page, selector, timeout = 8000) {
  await page.waitForSelector(selector, { timeout });
  await page.click(selector);
}

// 等待并输入
async function typeInSelector(page, selector, text, timeout = 8000) {
  await page.waitForSelector(selector, { timeout });
  await page.click(selector);
  await page.type(selector, text, { delay: 30 });
}

// 粘贴内容到富文本区（比逐字输入快）
async function pasteContent(page, selector, html) {
  await page.waitForSelector(selector, { timeout: 10000 });
  await page.click(selector);
  await page.evaluate((sel, content) => {
    const el = document.querySelector(sel);
    if (el) {
      el.focus();
      document.execCommand('selectAll');
      document.execCommand('insertHTML', false, content);
    }
  }, selector, html);
}

// 等待手动操作（让用户处理验证码）
async function waitForManualAction(addLog, message, timeout = 60000) {
  addLog(`⚠️ ${message}（等待 ${timeout/1000} 秒）`);
  await new Promise(r => setTimeout(r, timeout));
}

module.exports = { launchBrowser, saveCookies, loadCookies, mdToHtml, clickSelector, typeInSelector, pasteContent, waitForManualAction };
