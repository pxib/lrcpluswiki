'use strict';
(() => {
  const api = window.ManualCommunity;
  const t = window.ManualCommunityText;
  const host = document.getElementById('talk-panel');
  const live = document.createElement('section');
  live.className = 'community-talk';
  const body = document.getElementById('talk-body');
  body.before(live);
  let generation = 0;
  let activeArticle = '';
  let lastUser = null;
  let lastStaffRole = null;
  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function button(text, handler) {
    const node = el('button', text);
    node.type = 'button';
    node.addEventListener('click', handler);
    return node;
  }
  function loginLink() {
    const a = el('a', t.loginToPost);
    const lang = document.documentElement.lang;
    const file = lang.startsWith('yue') ? 'yue-account.html' : lang === 'ko' ? 'ko-account.html' : lang === 'ja' ? 'ja-account.html' : 'account.html';
    const url = new URL(file, location.href);
    url.searchParams.set('return', location.hash);
    url.hash = 'login';
    a.href = url.href;
    return a;
  }
  function composer(parent, article, topicId, version, onPosted) {
    parent.querySelector('.community-composer')?.remove();
    const form = el('form', '', 'community-composer');
    form.setAttribute('method', 'dialog');
    const title = el('input');
    if (!topicId) {
      const label = el('label', t.title);
      title.required = true;
      title.maxLength = 160;
      label.append(title);
      form.append(label);
    }
    const label = el('label', t.message);
    const message = el('textarea');
    message.required = true;
    message.maxLength = 10000;
    message.rows = 5;
    label.append(message);
    const submit = el('button', t.post);
    submit.type = 'submit';
    const cancel = button(t.cancel, () => form.remove());
    const status = el('p');
    status.setAttribute('role', 'status');
    form.append(label, el('p', t.publicNote, 'account-notice'), submit, cancel, status);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (submit.disabled || !form.reportValidity()) return;
      submit.disabled = cancel.disabled = true;
      title.disabled = message.disabled = true;
      status.textContent = t.busy;
      try {
        const payload = topicId ? { p_topic: topicId, p_body: message.value.trim() }
          : { p_article: article, p_title: title.value.trim(), p_body: message.value.trim() };
        const { error } = await api.client.rpc(topicId ? 'community_reply' : 'community_start_topic', payload);
        if (error) throw error;
        if (version !== generation) return;
        form.remove();
        await onPosted();
      } catch (error) {
        status.textContent = api.errorText(error);
      } finally {
        submit.disabled = cancel.disabled = false;
        title.disabled = message.disabled = false;
      }
    });
    parent.append(form);
    (topicId ? message : title).focus();
  }
  function signature(row, article, id) {
    const p = el('p', '', 'talk-signature');
    p.append('— ', el('b', row.profiles?.username || t.deleted), ' ');
    const a = el('a');
    a.href = `#${article}/talk/${id}`;
    const time = el('time', window.ManualTalkTimestamps.format(new Date(row.created_at), document.documentElement.lang));
    time.dateTime = row.created_at;
    a.append(time);
    p.append(a);
    return p;
  }
  function scrollToRequested() {
    const id = location.hash.split('/')[2];
    if (id?.startsWith('community-')) {
      const target = document.getElementById(id);
      if (target && live.contains(target)) target.scrollIntoView();
    }
  }
  function metadataLabels(comments, people) {
    const lang = document.documentElement.lang;
    const number = new Intl.NumberFormat(lang);
    const c = number.format(comments);
    const p = number.format(people);
    if (lang === 'ja') return [`${c}件のコメント`, `${p}人が議論に参加`];
    if (lang === 'ko') return [`댓글 ${c}개`, `토론 참여자 ${p}명`];
    if (lang.startsWith('yue')) return [`${c}個留言`, `${p}人參與討論`];
    return [`${c} comment${comments === 1 ? '' : 's'}`, `${p} ${people === 1 ? 'person' : 'people'} in discussion`];
  }
  async function render() {
    const version = ++generation;
    const parts = location.hash.slice(1).split('/');
    if (parts[1] !== 'talk' || host.hidden) { activeArticle = ''; return; }
    const article = parts[0];
    activeArticle = article;
    live.replaceChildren(el('h2', t.live));
    // The archived examples are not live accounts or reply targets.
    if (body.querySelector('.talk-topic') && !body.querySelector('.community-scripted-label')) body.prepend(el('p', t.scripted, 'note community-scripted-label'));
    const notice = el('p', t.loading);
    notice.setAttribute('role', 'status');
    live.append(notice);
    await api.ready;
    if (version !== generation) return;
    lastUser = api.session?.user.id || null;
    lastStaffRole = api.staffRole || null;
    if (!api.client) { notice.textContent = api.notice; return; }
    notice.textContent = '';
    const toolbar = el('div', '', 'community-toolbar');
    const start = button(t.newTopic, () => composer(live, article, null, version, render));
    start.hidden = !api.session;
    toolbar.append(api.session ? start : loginLink(), button(t.refresh, render));
    live.append(toolbar);
    const toc = el('details', '', 'toc');
    toc.id = 'community-contents';
    toc.open = true;
    toc.hidden = true;
    const topicList = el('ol');
    toc.append(el('summary', window.ManualTalkUI.contents), topicList);
    live.append(toc);
    const topics = el('div');
    live.append(topics);
    const more = button(t.more, loadTopics);
    live.append(more);
    let offset = 0;
    async function loadTopics() {
      more.disabled = true;
      notice.textContent = t.loading;
      try {
        const { data, error } = await api.client.from('community_topics')
          .select('*,profiles(username)').eq('article_id', article)
          .order('created_at', {ascending: true}).order('id', {ascending: true}).range(offset, offset + 19);
        if (error) throw error;
        if (version !== generation) return;
        offset += data.length;
        more.hidden = data.length < 20;
        notice.textContent = offset === 0 ? t.empty : '';
        for (const row of data) {
          const section = el('section', '', 'talk-topic');
          section.id = `community-topic-${row.id}`;
          const heading = el('h2', row.title);
          const topicLink = el('a', row.title);
          topicLink.href = `#${article}/talk/${section.id}`;
          const item = el('li');
          item.append(topicLink);
          topicList.append(item);
          toc.hidden = false;
          const permalink = el('a', '§', 'section-link');
          permalink.href = topicLink.href;
          permalink.setAttribute('aria-label', `${window.ManualTalkUI.permalink}: ${row.title}`);
          heading.append(' ', permalink);
          const metadata = el('p', '', 'talk-meta');
          metadata.hidden = true;
          const opening = el('div', '', 'talk-comment talk-depth-0');
          opening.append(el('p', row.body, 'community-message'), signature(row, article, section.id));
          const replyOptions = row.locked ? {} : api.session
            ? { onReply: () => composer(section, article, row.id, version, () => Promise.all([loadReplies(true), loadMetadata()])) }
            : { replyHref: loginLink().href };
          window.ManualTalkUI.addCommentActions(opening, topicLink.hash, replyOptions);
          window.ManualCommunityModeration?.addReport(opening, 'topic', row.id);
          section.append(heading, metadata, opening);
          if (row.locked) {
            section.append(el('p', t.locked, 'note'));
            opening.querySelector('.talk-actions > a').title = t.locked;
          }
          window.ManualCommunityModeration?.addTopicControls(section, row, render);
          const replies = el('div');
          section.append(replies);
          let replyOffset = 0;
          const replyStatus = el('p');
          replyStatus.setAttribute('role', 'status');
          const moreReplies = button(t.more, loadReplies);
          section.append(replyStatus, moreReplies);
          async function loadMetadata() {
            // Fetch only attribution, across all pages, so totals do not depend on visible replies.
            let count = 1;
            let offset = 0;
            const authors = new Set(row.author_id ? [row.author_id] : []);
            try {
              while (true) {
                const { data, error } = await api.client.from('community_comments').select('author_id')
                  .eq('topic_id', row.id).order('id', {ascending: true}).range(offset, offset + 999);
                if (error) throw error;
                if (version !== generation) return;
                count += data.length;
                data.forEach(reply => { if (reply.author_id) authors.add(reply.author_id); });
                offset += data.length;
                if (data.length < 1000) break;
              }
              metadata.replaceChildren(...metadataLabels(count, authors.size).map(label => el('span', label, 'talk-meta-item')));
              metadata.hidden = false;
            } catch { metadata.hidden = true; }
          }
          async function loadReplies(reset = false) {
            moreReplies.disabled = true;
            if (reset) { replyOffset = 0; replies.replaceChildren(); }
            try {
              const result = await api.client.from('community_comments').select('*,profiles(username)')
                .eq('topic_id', row.id).order('created_at', {ascending: true}).order('id', {ascending: true}).range(replyOffset, replyOffset + 49);
              if (result.error) throw result.error;
              if (version !== generation) return;
              replyOffset += result.data.length;
              moreReplies.hidden = result.data.length < 50;
              replyStatus.textContent = '';
              for (const reply of result.data) {
                const comment = el('div', '', 'talk-comment talk-depth-1');
                comment.id = `community-comment-${reply.id}`;
                comment.append(el('p', reply.deleted_at ? t.deletedComment : reply.body, reply.deleted_at ? 'community-message community-deleted' : 'community-message'), signature(reply, article, comment.id));
                window.ManualTalkUI.addCommentActions(comment, `#${article}/talk/${comment.id}`, replyOptions);
                if (!reply.deleted_at) {
                  window.ManualCommunityModeration?.addReport(comment, 'comment', reply.id);
                  window.ManualCommunityModeration?.addDeleteComment(comment, reply, () => Promise.all([loadReplies(true),loadMetadata()]));
                }
                if (row.locked) comment.querySelector('.talk-actions > a').title = t.locked;
                replies.append(comment);
              }
              scrollToRequested();
              if (location.hash.includes('/community-comment-') && !document.getElementById(location.hash.split('/')[2]) && !moreReplies.hidden) await loadReplies();
            } catch { replyStatus.textContent = t.unavailable; }
            finally { moreReplies.disabled = false; }
          }
          topics.append(section);
          await Promise.all([loadReplies(), loadMetadata()]);
          if (version !== generation) return;
        }
        scrollToRequested();
        if (location.hash.includes('/community-') && !document.getElementById(location.hash.split('/')[2]) && !more.hidden) await loadTopics();
      } catch { if (version === generation) notice.textContent = t.unavailable; }
      finally { more.disabled = false; }
    }
    await loadTopics();
  }
  // manual.js emits after it has replaced the scripted Talk DOM.
  window.addEventListener('manualroutechange', render);
  window.addEventListener('communitychange', () => {
    if (activeArticle && lastUser !== (api.session?.user.id || null)) render();
  });
  window.addEventListener('moderationchange', () => {
    if (activeArticle && lastStaffRole !== (api.staffRole || null)) render();
  });
  const browse = document.getElementById('talk-browse-link');
  browse.addEventListener('click', event => {
    if (!api.session || !api.client || !activeArticle) return;
    event.preventDefault();
    composer(live, activeArticle, null, generation, render);
    live.scrollIntoView();
  });
  render();
})();
