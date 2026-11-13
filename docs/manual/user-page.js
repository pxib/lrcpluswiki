'use strict';
(() => {
  const api = window.ManualCommunity;
  const t = window.ManualCommunityText;
  const lang = document.documentElement.lang;
  const labels = {
    en: ['User page', 'User', 'This user page has no introduction yet.', 'No user selected.', 'User not found.', 'Public account information'],
    ja: ['利用者ページ', '利用者', 'この利用者ページにはまだ自己紹介がありません。', '利用者が選択されていません。', '利用者が見つかりません。', '公開アカウント情報'],
    ko: ['사용자 문서', '사용자', '이 사용자 문서에는 아직 소개가 없습니다.', '사용자가 선택되지 않았습니다.', '사용자를 찾을 수 없습니다.', '공개 계정 정보'],
    yue: ['用戶頁面', '用戶', '呢個用戶頁面暫時未有自我介紹。', '未選擇用戶。', '搵唔到呢個用戶。', '公開帳戶資料']
  };
  const text = labels[lang.startsWith('yue') ? 'yue' : lang] || labels.en;
  const heading = document.getElementById('user-heading');
  const status = document.getElementById('user-status');
  const details = document.getElementById('user-details');
  const retry = document.getElementById('user-retry');
  const tab = document.getElementById('user-tab');
  let generation = 0;
  const query = new URLSearchParams(location.search);
  const id = query.get('id');
  const name = query.get('name');
  tab.textContent = text[0];
  retry.textContent = t.refresh;
  document.getElementById('user-details-heading').textContent = text[5];
  document.getElementById('user-username-label').textContent = t.username;
  document.getElementById('user-introduction').textContent = text[2];
  function title(username) {
    heading.textContent = username ? `${text[1]}:${username}` : text[0];
    document.title = `${heading.textContent} — LRCPlus wiki`;
  }
  title();
  document.querySelectorAll('.language-switch a').forEach(anchor => {
    const url = new URL(anchor.href);
    if (id) url.searchParams.set('id', id);
    else if (name) url.searchParams.set('name', name);
    anchor.href = url.href;
  });
  async function load() {
    const version = ++generation;
    details.hidden = true;
    retry.hidden = true;
    document.getElementById('user-role').replaceChildren();
    document.getElementById('user-username').textContent = '';
    title();
    status.textContent = t.loading;
    if (!id && !name) { status.textContent = text[3]; return; }
    if ((id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) || (!id && !/^[A-Za-z0-9_]{3,30}$/.test(name))) {
      status.textContent = text[4]; return;
    }
    await api.ready;
    if (version !== generation) return;
    if (!api.client) { status.textContent = api.notice; return; }
    try {
      let request = api.client.from('profiles').select('id,username');
      request = id ? request.eq('id', id) : request.ilike('username', name.replace(/_/g, '\\_'));
      const {data, error} = await request.maybeSingle();
      if (version !== generation) return;
      if (error) throw error;
      if (!data) { status.textContent = text[4]; return; }
      title(data.username);
      document.getElementById('user-username').textContent = data.username;
      details.hidden = false;
      status.textContent = '';
      // Staff badges come from the public, verified-role RPC, never auth metadata.
      try {
        const roles = await api.client.rpc('community_staff_indicators', {p_users: [data.id]});
        if (version !== generation || roles.error || !Array.isArray(roles.data)) return;
        const indicator = api.staffIndicator(roles.data.find(row => row.user_id === data.id)?.role);
        if (indicator) document.getElementById('user-role').append(indicator);
      } catch { /* A profile remains readable without the optional moderation migration. */ }
    } catch {
      if (version !== generation) return;
      status.textContent = t.unavailable;
      retry.hidden = false;
    }
  }
  retry.addEventListener('click', load);
  window.addEventListener('pagehide', () => { generation++; });
  window.addEventListener('pageshow', event => { if (event.persisted) load(); });
  load();
})();
