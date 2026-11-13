'use strict';
(() => {
  const api = window.ManualCommunity;
  const t = window.ManualCommunityText;
  const panel = document.getElementById('moderation-panel');
  let roleGeneration = 0;
  let viewGeneration = 0;
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const button = (text, handler) => {
    const node = el('button', text);
    node.type = 'button';
    node.addEventListener('click', handler);
    return node;
  };
  function select(values) {
    const node = el('select');
    for (const value of values) {
      const option = el('option', t[value]);
      option.value = value;
      node.append(option);
    }
    return node;
  }
  function field(form, title, input) {
    const label = el('label', title);
    label.append(input);
    form.append(label);
  }
  function addReport(parent, type, id) {
    const popup = parent.querySelector('.talk-comment-popup');
    if (!popup) return;
    popup.append(button(t.report, () => {
      parent.querySelector('.community-report')?.remove();
      const form = el('form', '', 'community-composer community-report');
      form.setAttribute('method','dialog');
      const heading = el('h3', t.report);
      const status = el('p');
      status.setAttribute('role','status');
      status.tabIndex = -1;
      form.append(heading, el('p', t.reportPrivacy, 'account-notice'));
      const reason = select(['spam','harassment','inaccurate','other']);
      const details = el('textarea');
      details.maxLength = 2000;
      details.rows = 3;
      field(form,t.reason,reason);
      field(form,t.reportDetails,details);
      const submit = el('button',t.sendReport);
      submit.type = 'submit';
      const cancel = button(t.cancel,()=>form.remove());
      form.append(submit,cancel,status);
      parent.append(form);
      parent.querySelector('details').open = false;
      reason.focus();
      form.addEventListener('submit',async event => {
        event.preventDefault();
        if (submit.disabled || !form.reportValidity()) return;
        if (!api.session) { status.textContent = t.signInRequired; return; }
        submit.disabled = reason.disabled = details.disabled = true;
        status.textContent = t.busy;
        try {
          const {error} = await api.client.rpc('community_report',{p_type:type,p_target:id,p_reason:reason.value,p_details:details.value.trim()});
          if (error) throw error;
          details.value = '';
          status.textContent = t.reportSent;
          // Retain the acknowledgement and prevent accidental duplicate sends.
          submit.hidden = true;
        } catch(error) { status.textContent = api.errorText(error); }
        finally { submit.disabled = reason.disabled = details.disabled = false; status.focus(); }
      });
    }));
  }
  function addTopicControls(parent, row, onChanged) {
    if (!api.staffRole) return;
    const controls = el('div','','community-toolbar');
    const status = el('span');
    status.setAttribute('role','status');
    const lock = button(row.locked ? t.unlock : t.lock,async () => {
      lock.disabled = true;
      try {
        const {error} = await api.client.rpc('community_lock_topic',{p_topic:row.id,p_locked:!row.locked});
        if (error) throw error;
        onChanged();
      } catch(error) { status.textContent = api.errorText(error); }
      finally { lock.disabled = false; }
    });
    controls.append(lock,status);
    parent.append(controls);
  }
  window.ManualCommunityModeration = {addReport,addTopicControls};
  async function loadRole() {
    const version = ++roleGeneration;
    await api.ready;
    const id = api.session?.user.id;
    let role = null;
    if (api.client && id) {
      try {
        const {data,error} = await api.client.rpc('community_staff_role');
        if (!error && ['admin','moderator'].includes(data)) role = data;
      } catch { /* A missing migration never grants access. */ }
    }
    if (version !== roleGeneration || id !== api.session?.user.id) return;
    api.staffRole = role;
    window.dispatchEvent(new Event('moderationchange'));
    renderQueue();
  }
  async function renderQueue() {
    if (!panel) return;
    const version = ++viewGeneration;
    panel.replaceChildren();
    if (panel.hidden) return;
    const heading = el('h1',t.moderation);
    heading.id = 'moderation-heading';
    const status = el('p');
    status.setAttribute('role','status');
    panel.append(heading,status);
    if (!api.client || !api.session) { status.textContent = api.client ? t.signInRequired : api.notice; return; }
    if (!api.staffRole) { status.textContent = t.staffRequired; return; }
    const toolbar = el('div','','community-toolbar');
    const filter = select(['open','dismissed','removed']);
    filter.setAttribute('aria-label',t.moderation);
    toolbar.append(filter,button(t.refresh,()=>load(true)));
    const queue = el('div');
    const more = button(t.more,()=>load(false));
    panel.append(toolbar,queue,more);
    let offset = 0;
    let request = 0;
    filter.addEventListener('change',()=>load(true));
    async function load(reset) {
      const current = ++request;
      if (reset) { offset=0; queue.replaceChildren(); }
      more.disabled = true;
      status.textContent = t.busy;
      try {
        const {data,error} = await api.client.rpc('community_report_queue',{p_status:filter.value,p_offset:offset});
        if (error) throw error;
        if (version !== viewGeneration || current !== request) return;
        offset += data.length;
        more.hidden = data.length < 20;
        status.textContent = '';
        if (!offset) status.textContent = t.noReports;
        for (const row of data) {
          const item = el('section','','moderation-report');
          item.append(el('h2',t[row.reason] || t.other));
          item.append(el('p',`${t.reporter}: ${row.reporter || t.deleted} · ${t.author}: ${row.author || t.deleted}`));
          item.append(el('p',new Date(row.created_at).toLocaleString(document.documentElement.lang)));
          item.append(el('blockquote',row.content,'community-message'),el('p',row.details,'community-message'));
          const url = new URL(document.getElementById('manual-return').href);
          url.hash = `#${row.article_id}/talk/community-${row.target_type}-${row.target_id}`;
          const link = el('a',t.back);
          link.href = url.href;
          item.append(link);
          if (row.status==='open') {
            for (const action of ['dismiss','remove']) {
              const control = button(t[action],async () => {
                if (action==='remove' && !window.confirm(t.confirmRemove)) return;
                const group = [...item.querySelectorAll('button')];
                group.forEach(node=>{node.disabled=true;});
                try {
                  const {error} = await api.client.rpc('community_review_report',{p_report:row.id,p_action:action});
                  if (error) throw error;
                  if (version===viewGeneration) await load(true);
                } catch(error) { if (version===viewGeneration) status.textContent=api.errorText(error); }
                finally {group.forEach(node=>{node.disabled=false;});}
              });
              item.append(control);
            }
          }
          queue.append(item);
        }
      } catch(error) { if (version===viewGeneration && current===request) { status.textContent=api.errorText(error); more.hidden=true; } }
      finally {if (current===request) more.disabled=false;}
    }
    if (api.staffRole==='admin') {
      const section = el('section');
      const form = el('form','','community-composer');
      form.setAttribute('method','dialog');
      const username = el('input');
      username.required=true;
      username.pattern='[A-Za-z0-9_]{3,30}';
      const action = select(['moderator','admin','member','block','unblock']);
      const reason = el('textarea');
      reason.maxLength=2000;
      reason.rows=2;
      field(form,t.username,username);
      field(form,t.memberAction,action);
      field(form,t.reason,reason);
      const result = el('p');
      result.setAttribute('role','status');
      const submit = el('button',t.apply);
      submit.type='submit';
      form.append(submit,result);
      action.addEventListener('change',()=>{reason.required=action.value==='block';});
      form.addEventListener('submit',async event=>{
        event.preventDefault();
        if (submit.disabled || !form.reportValidity()) return;
        const payload={p_username:username.value.trim(),p_action:action.value,p_reason:reason.value.trim()};
        if (!window.confirm(`${t[payload.p_action]}: ${payload.p_username}?`)) return;
        submit.disabled=true;
        result.textContent=t.busy;
        try {
          const {error}=await api.client.rpc('community_manage_member',payload);
          if (error) throw error;
          if (version===viewGeneration) {result.textContent=t.saved;form.reset();reason.required=false;}
        } catch(error) {if (version===viewGeneration) result.textContent=api.errorText(error);}
        finally {submit.disabled=false;}
      });
      section.append(el('h2',t.manageMembers),form);
      panel.append(section);
    }
    await load(true);
  }
  window.addEventListener('communitychange',()=>{
    // Remove any old staff queue synchronously, before a different account loads.
    if (panel) {viewGeneration++;panel.replaceChildren();}
    loadRole();
  });
  window.addEventListener('accountmodechange',renderQueue);
  window.addEventListener('pagehide',()=>{viewGeneration++;panel?.replaceChildren();});
  window.addEventListener('pageshow',loadRole);
  loadRole();
})();
