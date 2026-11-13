/* Compare the loaded document with the currently published deployment. */
'use strict';
(() => {
  const l = window.ManualLocale?.text || (value => value);
  const current = document.querySelector('meta[name="wiki-build"]')?.content;
  if (!current || !/^https?:$/.test(location.protocol)) return;
  const lang = document.documentElement.lang;
  const text = lang === 'ja' ? ['更新があります。', '再読み込み']
    : lang === 'ko' ? ['업데이트가 있습니다.', '새로고침']
    : lang.startsWith('yue') ? ['有新版本。', '重新載入']
    : [l('An update is available.'), l('Refresh')];
  let checking = false;
  let announced = false;
  let lastCheck = 0;
  async function check() {
    if (document.hidden || checking || announced || Date.now() - lastCheck < 60000) return;
    checking = true;
    lastCheck = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(new URL('version.json', location.href), {
        cache: 'no-store', signal: controller.signal
      });
      if (!response.ok) return;
      const latest = await response.json();
      if (typeof latest.build !== 'string' || !latest.build.trim() || latest.build === current) return;
      const notice = document.createElement('div');
      notice.className = 'wiki-update';
      notice.setAttribute('role', 'status');
      const message = document.createElement('span');
      message.textContent = text[0];
      const refresh = document.createElement('button');
      refresh.type = 'button';
      refresh.textContent = text[1];
      refresh.addEventListener('click', () => location.reload());
      notice.append(message, refresh);
      document.body.append(notice);
      announced = true;
    } catch { /* Offline and failed checks should never interrupt the wiki. */ }
    finally {
      clearTimeout(timeout);
      checking = false;
    }
  }
  window.addEventListener('focus', check);
  window.addEventListener('online', check);
  document.addEventListener('visibilitychange', check);
  setInterval(check, 5 * 60000);
  check();
})();
