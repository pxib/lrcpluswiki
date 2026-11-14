'use strict';
(() => {
  const l = window.ManualLocale?.text || (value => value);
  const api = window.ManualCommunity;
  const t = window.ManualCommunityText;
  const lang = document.documentElement.lang;
  const labels = {
    en: [l('User page'), l('User'), l('This user page has no introduction yet.'), l('No user selected.'), l('User not found.'), l('Public account information')],
    ja: ['利用者ページ', '利用者', 'この利用者ページにはまだ自己紹介がありません。', '利用者が選択されていません。', '利用者が見つかりません。', '公開アカウント情報'],
    ko: ['사용자 문서', '사용자', '이 사용자 문서에는 아직 소개가 없습니다.', '사용자가 선택되지 않았습니다.', '사용자를 찾을 수 없습니다.', '공개 계정 정보'],
    yue: ['用戶頁面', '用戶', '呢個用戶頁面暫時未有自我介紹。', '未選擇用戶。', '搵唔到呢個用戶。', '公開帳戶資料']
  };
  const text = labels[lang.startsWith('yue') ? 'yue' : lang] || labels.en;
  const translations = {
    en: [l('Joined'), l('Edit'), l('Preview'), l('Publish'), l('Introduction'), l('Supports headings (#), lists (-), **bold**, *italic*, and [links](https://example.com). Your introduction is public.'), l('Another edit changed this page. Copy your draft, then refresh before publishing.'), l('This page changed after it was reported. Review the current page or dismiss the old report.'), l('Leave without saving your changes?')],
    ja: ['登録日', '編集', 'プレビュー', '公開', '自己紹介', '見出し（#）、箇条書き（-）、**太字**、*斜体*、[リンク](https://example.com)に対応しています。自己紹介は公開されます。', 'ページが変更されました。下書きをコピーし、再読み込みしてから公開してください。', '報告後にページが変更されました。現在のページを確認するか、古い報告を却下してください。', '変更を保存せずに閉じますか？'],
    ko: ['가입일', '편집', '미리 보기', '게시', '소개', '제목(#), 목록(-), **굵게**, *기울임*, [링크](https://example.com)를 지원합니다. 소개는 공개됩니다.', '문서가 변경되었습니다. 초안을 복사한 후 새로고침하고 게시하세요.', '신고 이후 문서가 변경되었습니다. 현재 문서를 확인하거나 이전 신고를 기각하세요.', '변경 사항을 저장하지 않고 닫을까요?'],
    yue: ['加入日期', '編輯', '預覽', '發佈', '自我介紹', '支援標題（#）、列表（-）、**粗體**、*斜體*同[連結](https://example.com)。自我介紹會公開。', '頁面已經改咗。請先複製草稿，再重新整理後發佈。', '舉報後頁面已經改咗。請查看而家嘅頁面，或者駁回舊舉報。', '唔儲存修改就離開？']
  };
  const words = translations[lang.startsWith('yue') ? 'yue' : lang] || translations.en;
  const heading = document.getElementById('user-heading');
  const status = document.getElementById('user-status');
  const details = document.getElementById('user-details');
  const retry = document.getElementById('user-retry');
  const tab = document.getElementById('user-tab');
  let generation = 0;
  let profile = null;
  let page = null;
  let saving = false;
  let editingUser = null;
  const node = (tag, value, className) => {
    const result = document.createElement(tag);
    if (value) result.textContent = value;
    if (className) result.className = className;
    return result;
  };
  const button = (label, action) => {
    const result = node('button', label);
    result.type = 'button';
    result.addEventListener('click', action);
    return result;
  };
  const introduction = node('div', '', 'user-introduction');
  document.getElementById('user-introduction').replaceWith(introduction);
  introduction.id = 'user-introduction';
  const joined = node('dd');
  const joinedLabel = node('dt', words[0]);
  joined.hidden = joinedLabel.hidden = true;
  document.querySelector('.user-details').append(joinedLabel, joined);
  const menuWords = {
    en: [l('Copy link'), l('Link copied.'), l('Select the link below to copy it.'), l('User page permalink'), l('More user page options')],
    ja: ['リンクをコピー', 'コピーしました。', 'リンクを選択してコピーしてください。', '利用者ページの固定リンク', '利用者ページのその他の操作'],
    ko: ['링크 복사', '링크를 복사했습니다.', '아래 링크를 선택하여 복사하세요.', '사용자 문서 고유 링크', '사용자 문서 추가 작업'],
    yue: ['複製連結', '已複製連結。', '請選取下面嘅連結再複製。', '用戶頁面固定連結', '更多用戶頁面操作']
  }[lang.startsWith('yue') ? 'yue' : lang] || [l('Copy link'), l('Link copied.'), l('Select the link below to copy it.'), l('User page permalink'), l('More user page options')];
  const titleRow = node('div', '', 'user-page-title');
  const menu = node('details', '', 'talk-comment-menu');
  const summary = node('summary', '•••');
  summary.setAttribute('aria-label', menuWords[4]);
  const popup = node('div', '', 'talk-comment-popup');
  const copy = node('a', menuWords[0]);
  const copyStatus = node('span', '', 'talk-copy-status');
  copyStatus.setAttribute('role', 'status');
  copy.addEventListener('click', async event => {
    event.preventDefault();
    if (!profile) return;
    const url = api.userLink(profile.username, profile.id).href;
    let copied = false;
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
    } catch {
      const field = node('textarea', '', 'visually-hidden');
      field.value = url;
      field.readOnly = true;
      popup.append(field);
      field.select();
      try { copied = document.execCommand('copy'); } catch { /* Manual copy remains available. */ }
      field.remove();
      copy.focus({preventScroll: true});
    }
    copyStatus.textContent = copied ? menuWords[1] : menuWords[2];
    if (!copied) {
      let field = popup.querySelector('input');
      if (!field) {
        field = node('input');
        field.type = 'text';
        field.readOnly = true;
        field.setAttribute('aria-label', menuWords[3]);
        popup.append(field);
      }
      field.value = url;
      field.focus();
      field.select();
    }
  });
  menu.append(summary, popup);
  heading.before(titleRow);
  titleRow.append(menu, heading);
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      menu.open = false;
      summary.focus();
      event.stopPropagation();
    }
  });
  document.addEventListener('click', event => { if (!menu.contains(event.target)) menu.open = false; });
  const edit = button(words[1], () => {
    if (!canEdit()) return;
    if (!editor.hidden) { draft.focus(); return; }
    editingUser = api.session.user.id;
    draft.value = page.body;
    editor.hidden = false;
    edit.setAttribute('aria-expanded', 'true');
    preview.hidden = true;
    feedback.textContent = '';
    draft.focus();
  });
  const report = button(t.report, () => { menu.open = false; openReport(); });
  popup.append(copy, report, copyStatus);
  document.querySelector('.page-tabs').append(edit);
  edit.setAttribute('aria-controls', 'user-page-editor');
  edit.setAttribute('aria-expanded', 'false');
  const editor = node('form', '', 'community-composer user-page-editor');
  editor.setAttribute('method', 'dialog');
  editor.id = 'user-page-editor';
  editor.hidden = true;
  const caption = node('label', words[4]);
  const draft = node('textarea');
  draft.maxLength = 10000;
  draft.rows = 12;
  caption.append(draft);
  const feedback = node('p');
  feedback.setAttribute('role', 'status');
  feedback.tabIndex = -1;
  const preview = node('div', '', 'user-page-preview');
  preview.hidden = true;
  const showPreview = button(words[2], () => {
    window.ManualUserPageContent(preview, draft.value);
    preview.hidden = false;
  });
  const publish = node('button', words[3]);
  publish.type = 'submit';
  const cancel = button(t.cancel, () => {
    if (draft.value !== page?.body && !window.confirm(words[8])) return;
    closeEditor();
  });
  editor.append(caption, node('p', words[5], 'account-notice'), showPreview, publish, cancel, feedback, preview);
  details.before(editor);
  const reportHost = node('div', '', 'user-page-report');
  details.before(reportHost);
  function canEdit() { return Boolean(profile && page && api.session?.user.id === profile.id && !api.recovery); }
  function controls() {
    edit.hidden = !canEdit();
    edit.disabled = saving;
    report.hidden = !profile || !page?.body || !api.session || api.recovery;
    menu.hidden = !profile;
    if (profile) copy.href = api.userLink(profile.username, profile.id).href;
    else { menu.open = false; copyStatus.textContent = ''; popup.querySelector('input')?.remove(); }
    if (!canEdit() || (editingUser && editingUser !== api.session?.user.id)) closeEditor();
    if (!api.session || (reportHost.dataset.user && reportHost.dataset.user !== api.session.user.id)) reportHost.replaceChildren();
    editor.querySelectorAll('input,textarea,button').forEach(control => { control.disabled = saving || !canEdit(); });
  }
  function closeEditor() {
    editor.hidden = true;
    edit.setAttribute('aria-expanded', 'false');
    draft.value = '';
    preview.replaceChildren();
    preview.hidden = true;
    editingUser = null;
  }
  function display() {
    if (page?.body) window.ManualUserPageContent(introduction, page.body);
    else introduction.replaceChildren(node('p', text[2], 'note'));
  }
  editor.addEventListener('submit', async event => {
    event.preventDefault();
    if (saving || !canEdit() || editingUser !== api.session.user.id || !editor.reportValidity()) return;
    const version = generation;
    const user = editingUser;
    const body = draft.value;
    saving = true;
    controls();
    feedback.textContent = t.busy;
    try {
      const result = await api.client.rpc('community_save_user_page', {p_body: body, p_revision: page.revision});
      if (version !== generation || api.session?.user.id !== user) return;
      if (result.error) throw result.error;
      page = {body: body.trim(), revision: result.data};
      display();
      closeEditor();
      status.textContent = t.saved;
    } catch (error) {
      if (version === generation && api.session?.user.id === user) feedback.textContent = error?.message?.includes('edit_conflict') ? words[6] : api.errorText(error);
    } finally {
      saving = false;
      controls();
    }
  });
  function openReport() {
    if (!profile || !page?.body || !api.session) return;
    reportHost.replaceChildren();
    const user = api.session.user.id;
    reportHost.dataset.user = user;
    const target = profile.id;
    const version = generation;
    const form = node('form', '', 'community-composer');
    form.setAttribute('method', 'dialog');
    const reason = node('select');
    for (const value of ['spam', 'harassment', 'inaccurate', 'other']) {
      const option = node('option', t[value]); option.value = value; reason.append(option);
    }
    const label = node('label', t.reason); label.append(reason);
    const extra = node('textarea'); extra.maxLength = 2000; extra.rows = 3;
    const extraLabel = node('label', t.reportDetails); extraLabel.append(extra);
    const result = node('p'); result.setAttribute('role', 'status');
    const send = node('button', t.sendReport); send.type = 'submit';
    let pending = false;
    form.append(node('h2', t.report), node('p', t.reportPrivacy), label, extraLabel, send, button(t.cancel, () => reportHost.replaceChildren()), result);
    reportHost.append(form);
    reason.focus();
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (pending || api.session?.user.id !== user || !form.reportValidity()) return;
      pending = true; send.disabled = true; result.textContent = t.busy;
      try {
        const response = await api.client.rpc('community_report', {p_type: 'user_page', p_target: target, p_reason: reason.value, p_details: extra.value.trim()});
        if (version !== generation || api.session?.user.id !== user) return;
        if (response.error) throw response.error;
        extra.value = ''; result.textContent = t.reportSent; send.hidden = true;
      } catch (error) {
        if (version === generation && api.session?.user.id === user) result.textContent = api.errorText(error);
      } finally { pending = false; send.disabled = false; }
    });
  }
  const query = new URLSearchParams(location.search);
  const id = query.get('id');
  const name = query.get('name');
  tab.textContent = text[0];
  retry.textContent = t.refresh;
  document.getElementById('user-details-heading').textContent = text[5];
  document.getElementById('user-username-label').textContent = t.username;
  display();
  controls();
  function title(username) {
    heading.textContent = username ? `${text[1]}:${username}` : text[0];
    document.title = `${heading.textContent} — LRCPlus.wiki`;
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
    profile = null;
    page = null;
    closeEditor();
    reportHost.replaceChildren();
    joined.hidden = joinedLabel.hidden = true;
    controls();
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
      let request = api.client.from('profiles').select('id,username,joined_on');
      request = id ? request.eq('id', id) : request.ilike('username', name.replace(/_/g, '\\_'));
      let {data, error} = await request.maybeSingle();
      if (error && ['42703', 'PGRST204'].includes(error.code)) {
        request = api.client.from('profiles').select('id,username');
        const fallback = await (id ? request.eq('id', id) : request.ilike('username', name.replace(/_/g, '\\_'))).maybeSingle();
        data = fallback.data; error = fallback.error;
      }
      if (version !== generation) return;
      if (error) throw error;
      if (!data) { status.textContent = text[4]; return; }
      profile = data;
      if (/^[A-Za-z0-9_]{3,30}$/.test(data.username || '')) {
        const url = new URL(location.href);
        url.searchParams.delete('id');
        url.searchParams.set('name', data.username);
        history.replaceState(history.state, '', url.href);
        document.querySelectorAll('.language-switch a').forEach(anchor => {
          const localized = new URL(anchor.href);
          localized.searchParams.delete('id');
          localized.searchParams.set('name', data.username);
          anchor.href = localized.href;
        });
      }
      controls();
      title(data.username);
      document.getElementById('user-username').textContent = data.username;
      details.hidden = false;
      status.textContent = '';
      if (data.joined_on) {
        const date = new Date(`${data.joined_on}T00:00:00Z`);
        if (!Number.isNaN(date.getTime())) {
          const time = node('time', date.toLocaleDateString(lang, {year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC'}));
          time.dateTime = data.joined_on;
          joined.replaceChildren(time);
          joined.hidden = joinedLabel.hidden = false;
        }
      }
      try {
        const result = await api.client.from('user_pages').select('body,revision').eq('user_id', data.id).maybeSingle();
        if (version !== generation) return;
        if (result.error) throw result.error;
        page = result.data || {body: '', revision: 0};
        display();
        controls();
      } catch {
        if (version !== generation) return;
        status.textContent = t.featureUnavailable;
      }
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
  window.addEventListener('communitychange', controls);
  window.addEventListener('beforeunload', event => {
    if (!editor.hidden && draft.value !== page?.body) { event.preventDefault(); event.returnValue = ''; }
  });
  window.addEventListener('pagehide', () => { generation++; closeEditor(); reportHost.replaceChildren(); });
  window.addEventListener('pageshow', event => { if (event.persisted) load(); });
  load();
})();
