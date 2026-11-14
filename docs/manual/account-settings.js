'use strict';
(() => {
  const l = window.ManualLocale?.text || (value => value);
  const api = window.ManualCommunity;
  const t = window.ManualCommunityText;
  const panel = document.getElementById('settings-panel');
  let generation = 0;
  let loadedId = null;
  let user = null;
  let busy = false;
  const forms = [];
  const node = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  const heading = node('h1', t.settings);
  heading.id = 'settings-heading';
  const gate = node('p');
  gate.setAttribute('role', 'status');
  const login = node('a', t.login);
  const loginUrl = new URL(location.href);
  loginUrl.searchParams.set('next', 'settings');
  loginUrl.hash = 'login';
  login.href = loginUrl.href;
  login.hidden = true;
  const details = node('div', '', 'account-settings');
  details.hidden = true;
  const list = node('dl', '', 'account-details');
  const username = node('dd');
  const email = node('dd');
  const verified = node('p');
  list.append(node('dt', t.username), username, node('dt', t.email), email);
  details.append(node('h2', t.accountDetails), list, verified, node('p', t.usernameFixed, 'account-notice'));
  panel.append(heading, gate, login, details);
  const retry = node('button', t.refresh);
  retry.type = 'button';
  retry.hidden = true;
  retry.addEventListener('click', () => { loadedId = null; render(); });
  gate.after(retry);
  function field(form, id, title, type, autocomplete) {
    const wrapper = node('div', '', 'account-field');
    const label = node('label', title);
    label.htmlFor = id;
    const input = node('input');
    Object.assign(input, { id, type, autocomplete, required: true, disabled: true });
    if (autocomplete === 'new-password') input.minLength = 12;
    wrapper.append(label, input);
    form.append(wrapper);
    return input;
  }
  function section(id, title) {
    const section = node('section');
    const heading = node('h2', title);
    const form = node('form', '', 'account-form');
    form.id = `settings-${id}-form`;
    form.setAttribute('method', 'dialog');
    const status = node('p', '', 'account-feedback');
    status.setAttribute('role', 'status');
    status.tabIndex = -1;
    const submit = node('button', title, 'account-submit');
    submit.type = 'submit';
    section.append(heading, status, form);
    details.append(section);
    forms.push(form);
    return {form, status, submit};
  }
  const emailSection = section('email', t.changeEmail);
  const newEmail = field(emailSection.form, 'settings-email', t.newEmail, 'email', 'email');
  const emailPassword = field(emailSection.form, 'settings-email-password', t.currentPassword, 'password', 'current-password');
  emailSection.form.append(emailSection.submit);
  const passwordSection = section('password', t.changePassword);
  const currentPassword = field(passwordSection.form, 'settings-current-password', t.currentPassword, 'password', 'current-password');
  const newPassword = field(passwordSection.form, 'settings-new-password', t.newPassword, 'password', 'new-password');
  const confirm = field(passwordSection.form, 'settings-confirm-password', t.confirm, 'password', 'new-password');
  passwordSection.form.append(node('p', t.passwordHelp, 'account-notice'), passwordSection.submit);
  const sessions = section('sessions', t.otherSessions);
  sessions.form.append(sessions.submit);
  const deletionText = {
    en: ['Delete account', 'Permanently delete your account? This cannot be undone.', 'Your login, profile, and introduction will be removed. Discussion text stays with its account attribution removed. Private report snapshots and moderation history may remain. Delete individual replies first if you want their public text removed.', 'Your account has been deleted.'],
    ja: ['アカウントを削除', 'アカウントを完全に削除しますか？元に戻せません。', 'ログイン情報、プロフィール、自己紹介を削除します。議論の本文はアカウントとの関連付けを解除して残ります。非公開の報告内容や管理履歴が残る場合があります。返信の公開本文も削除したい場合は、先に個別に削除してください。', 'アカウントを削除しました。'],
    ko: ['계정 삭제', '계정을 영구적으로 삭제하시겠습니까? 되돌릴 수 없습니다.', '로그인 정보, 프로필과 소개가 삭제됩니다. 토론 내용은 계정 연결이 해제된 상태로 남습니다. 비공개 신고 자료와 관리 기록은 남을 수 있습니다. 댓글의 공개 내용도 지우려면 먼저 각 댓글을 삭제하세요.', '계정이 삭제되었습니다.'],
    yue: ['刪除帳戶', '永久刪除你嘅帳戶？呢個操作無法復原。', '登入資料、個人檔案同自我介紹會被刪除。討論文字會保留，但會移除帳戶關聯。私人舉報內容同管理紀錄可能會保留。如果想移除回覆嘅公開文字，請先逐一刪除回覆。', '你嘅帳戶已刪除。'],
    zh: ['删除账户', '永久删除你的账户？此操作无法撤销。', '登录信息、个人资料和自我介绍将被删除。讨论文字会保留，但会移除账户关联。私密举报快照和管理记录可能保留。如需移除回复的公开文字，请先逐条删除回复。', '你的账户已删除。'],
    'zh-hant': ['刪除帳戶', '永久刪除你的帳戶？此操作無法復原。', '登入資訊、個人資料和自我介紹將被刪除。討論文字會保留，但會移除帳戶關聯。私人檢舉快照和管理紀錄可能保留。如需移除回覆的公開文字，請先逐一刪除回覆。', '你的帳戶已刪除。'],
    cs: ['Smazat účet', 'Trvale smazat účet? Tuto akci nelze vrátit zpět.', 'Přihlašovací údaje, profil a představení budou odstraněny. Text diskusí zůstane bez propojení s účtem. Soukromé kopie hlášení a historie moderování mohou zůstat zachovány. Chcete-li odstranit veřejný text odpovědí, nejprve je jednotlivě smažte.', 'Váš účet byl smazán.'],
    vi: ['Xóa tài khoản', 'Xóa vĩnh viễn tài khoản của bạn? Không thể hoàn tác thao tác này.', 'Thông tin đăng nhập, hồ sơ và phần giới thiệu sẽ bị xóa. Nội dung thảo luận vẫn được giữ lại nhưng không còn liên kết với tài khoản. Bản chụp báo cáo riêng tư và lịch sử kiểm duyệt có thể được giữ lại. Nếu muốn xóa nội dung công khai của các phản hồi, hãy xóa từng phản hồi trước.', 'Tài khoản của bạn đã được xóa.']
  };
  const deletion = deletionText[document.documentElement.lang.startsWith('yue') ? 'yue' : document.documentElement.lang.toLowerCase()] || deletionText.en;
  const deleteSection = section('delete-account', deletion[0]);
  const deletePassword = field(deleteSection.form, 'settings-delete-password', t.currentPassword, 'password', 'current-password');
  deleteSection.form.prepend(node('p', deletion[2], 'account-notice'));
  deleteSection.form.append(deleteSection.submit);
  // Preferences uses a horizontal section selector, as in MediaWiki's Help:Preferences.
  const labels = {
    en: [l('User profile'), l('Password and security')],
    ja: ['利用者情報', 'パスワードとセキュリティ'],
    ko: ['사용자 정보', '비밀번호 및 보안'],
    yue: ['用戶資料', '密碼同保安']
  };
  const lang = document.documentElement.lang;
  const captions = labels[lang.startsWith('yue') ? 'yue' : lang] || labels.en;
  const tabs = node('div', '', 'preferences-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', t.settings);
  const profile = node('div', '', 'preferences-panel');
  const security = node('div', '', 'preferences-panel');
  profile.append(...details.childNodes);
  security.append(passwordSection.form.parentElement, sessions.form.parentElement, deleteSection.form.parentElement);
  details.append(tabs, profile, security);
  const sections = [profile, security];
  const tabButtons = sections.map((section, index) => {
    section.id = `preferences-panel-${index}`;
    section.setAttribute('role', 'tabpanel');
    section.setAttribute('aria-labelledby', `preferences-tab-${index}`);
    const tab = node('button', captions[index]);
    tab.type = 'button';
    tab.id = `preferences-tab-${index}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', section.id);
    tab.addEventListener('click', () => selectTab(index));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') next = 1 - index;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = 1;
      if (next === undefined) return;
      event.preventDefault();
      selectTab(next);
      tabButtons[next].focus();
    });
    tabs.append(tab);
    return tab;
  });
  function selectTab(index) {
    sections.forEach((section, i) => { section.hidden = i !== index; });
    tabButtons.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
    });
  }
  selectTab(0);
  function controls() {
    const disabled = busy || !user || !api.client || api.session?.user.id !== user.id || panel.hidden;
    forms.forEach(form => form.querySelectorAll('input,button').forEach(control => { control.disabled = disabled; }));
  }
  function clear() {
    generation++;
    loadedId = null;
    user = null;
    username.textContent = email.textContent = verified.textContent = '';
    details.hidden = true;
    forms.forEach(form => form.reset());
    [emailSection, passwordSection, sessions, deleteSection].forEach(({status}) => { status.textContent = ''; });
    controls();
  }
  async function render() {
    if (panel.hidden) { clear(); return; }
    await api.ready;
    if (panel.hidden) return;
    const id = api.session?.user.id;
    login.hidden = !api.client || Boolean(id);
    retry.hidden = true;
    if (!api.client || !id) {
      clear();
      gate.textContent = api.client ? t.signInRequired : api.notice;
      return;
    }
    if (loadedId === id) { controls(); return; }
    clear();
    loadedId = id;
    const version = generation;
    gate.textContent = t.busy;
    try {
      const result = await api.client.auth.getUser();
      if (result.error) throw result.error;
      if (version !== generation || panel.hidden || api.session?.user.id !== id) return;
      if (result.data.user?.id !== id) throw new Error('Account changed');
      const profile = await api.client.from('profiles').select('username').eq('id', id).single();
      if (profile.error) throw profile.error;
      if (version !== generation || panel.hidden || api.session?.user.id !== id) return;
      user = result.data.user;
      username.textContent = profile.data.username;
      email.textContent = user.email;
      verified.textContent = user.email_confirmed_at ? t.verified : t.unverified;
      details.hidden = false;
      gate.textContent = '';
      controls();
    } catch {
      if (version !== generation) return;
      loadedId = null;
      gate.textContent = t.unavailable;
      retry.hidden = false;
    }
  }
  function bind(section, run) {
    section.form.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy || !user || panel.hidden || !section.form.reportValidity()) return;
      if (section === passwordSection && newPassword.value !== confirm.value) {
        section.status.textContent = t.mismatch;
        return;
      }
      const version = generation;
      const id = user.id;
      busy = true;
      controls();
      section.form.setAttribute('aria-busy', 'true');
      section.status.textContent = t.busy;
      try {
        const result = await run(id);
        if (result.error) throw result.error;
        if (version !== generation) return;
        section.form.reset();
        section.status.textContent = section === emailSection ? t.emailPending : section === passwordSection ? t.passwordChanged : t.otherSessionsEnded;
      } catch (error) {
        if (version === generation) section.status.textContent = api.errorText(error);
      } finally {
        busy = false;
        section.form.setAttribute('aria-busy', 'false');
        controls();
        if (version === generation) section.status.focus();
      }
    });
  }
  async function reauthenticate(password, id) {
    const result = await api.client.auth.signInWithPassword({ email: user.email, password });
    if (result.error) throw result.error;
    if (result.data.user?.id !== id || api.session?.user.id !== id || user?.id !== id || panel.hidden) throw new Error('Account changed');
  }
  bind(emailSection, async id => {
    const address = newEmail.value.trim();
    await reauthenticate(emailPassword.value, id);
    const callback = new URL(location.pathname, location.origin);
    callback.hash = 'settings';
    return api.client.auth.updateUser({email: address}, {emailRedirectTo: callback.href});
  });
  bind(passwordSection, async id => {
    const password = newPassword.value;
    await reauthenticate(currentPassword.value, id);
    return api.client.auth.updateUser({password});
  });
  bind(sessions, () => api.client.auth.signOut({scope: 'others'}));
  deleteSection.form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !user || !api.client || panel.hidden || api.session?.user.id !== user.id || !deleteSection.form.reportValidity()) return;
    if (!window.confirm(deletion[1])) return;
    const id = user.id;
    const version = generation;
    const password = deletePassword.value;
    deletePassword.value = '';
    busy = true;
    controls();
    deleteSection.form.setAttribute('aria-busy', 'true');
    deleteSection.status.textContent = t.busy;
    try {
      const result = await api.client.functions.invoke('delete-account', {body: {password, confirmation: 'DELETE'}});
      if (result.error) {
        const detail = await result.error.context?.json?.().catch(() => null);
        if (version === generation) deleteSection.status.textContent = detail?.error === 'invalid_credentials' ? t.invalid : detail?.error === 'rate_limit' ? t.rateLimit : t.unavailable;
        return;
      }
      if (!result.data?.deleted) throw new Error('Deletion not confirmed');
      // Never sign out a different account that signed in while this request ran.
      if (api.session?.user.id !== id) return;
      await api.client.auth.signOut({scope: 'local'}).catch(() => {});
      if (api.session?.user.id === id) {
        api.session = null;
        api.staffRole = null;
        window.dispatchEvent(new Event('communitychange'));
      }
      gate.textContent = deletion[3];
      gate.tabIndex = -1;
      gate.focus();
    } catch {
      if (version === generation) deleteSection.status.textContent = t.unavailable;
    } finally {
      busy = false;
      deleteSection.form.setAttribute('aria-busy', 'false');
      controls();
      if (version === generation) deleteSection.status.focus();
    }
  });
  window.addEventListener('accountmodechange', render);
  window.addEventListener('communitychange', render);
  window.addEventListener('pagehide', clear);
  window.addEventListener('pageshow', render);
  render();
})();
