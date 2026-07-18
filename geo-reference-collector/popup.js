function visiblePageLinks() {
  return [...document.querySelectorAll('a[href]')]
    .filter((link) => {
      const rect = link.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && link.href && !link.href.startsWith(location.origin);
    })
    .map((link) => ({
      title: (link.innerText || link.getAttribute('aria-label') || link.textContent || '').replace(/\s+/g, ' ').trim(),
      href: link.href,
    }));
}

async function collectCurrentPageReferences() {
  const status = document.getElementById('status');
  const button = document.getElementById('collectButton');
  button.disabled = true;
  status.textContent = '正在采集当前页面…';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('没有找到当前浏览器页面');
    const injected = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: visiblePageLinks });
    const text = GeoReferenceCollector.collectReferenceLinks(injected[0]?.result || []);
    if (!text) throw new Error('当前页没有可识别的外部参考链接');
    await navigator.clipboard.writeText(text);
    status.textContent = `已采集 ${text.split('\n').length} 条引用并复制。回到 GEO 点击“从剪贴板导入引用”。`;
  } catch (error) {
    status.textContent = `采集失败：${error.message}`;
  } finally {
    button.disabled = false;
  }
}

document.getElementById('collectButton').addEventListener('click', collectCurrentPageReferences);
