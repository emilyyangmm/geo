/**
 * 基础工具：Cookie 存储、Puppeteer 浏览器启动、Markdown 转换
 */

let puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const os = require('os');
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
    `${process.env.LOCALAPPDATA || ''}\\Microsoft\\Edge\\Application\\msedge.exe`,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);

  return candidates.find(p => fs.existsSync(p)) || null;
}

// 启动浏览器：优先使用系统 Chrome/Edge；找不到时尝试 Puppeteer 自带浏览器。
async function launchBrowser() {
  const executablePath = findChromeExecutable();
  const userDataDir = process.env.CHROME_USER_DATA_DIR || path.join(os.tmpdir(), `geo-publisher-browser-${Date.now()}-${process.pid}`);
  if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

  const launchOptions = {
    userDataDir,
    headless: false,
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'],
  };

  if (executablePath) {
    return puppeteer.launch({ ...launchOptions, executablePath });
  }

  try {
    puppeteer = require('puppeteer');
    return puppeteer.launch(launchOptions);
  } catch (error) {
    throw new Error([
      '找不到 Chrome/Edge 浏览器。',
      '请安装 Chrome/Edge，或在 geo-publisher 目录运行 npm install 安装 Puppeteer 自带浏览器，或设置 CHROME_PATH 环境变量。',
      `原始错误：${error.message}`,
    ].join(' '));
  }
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
