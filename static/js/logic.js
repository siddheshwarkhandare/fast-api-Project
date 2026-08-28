(function(){
  "use strict";

  const els = {
    apiBase: document.getElementById('apiBase'),
    statusDot: document.getElementById('statusDot'),
    statusText: document.getElementById('statusText'),
    rows: document.getElementById('patientRows'),
    emptyState: document.getElementById('emptyState'),
    tableWrap: document.getElementById('tableWrap'),
    toasts: document.getElementById('toasts'),
    drawer: document.getElementById('drawer'),
    overlay: document.getElementById('overlay'),
    drawerTitle: document.getElementById('drawerTitle'),
    form: document.getElementById('patientForm'),
    idField: document.getElementById('idField'),
    f_id: document.getElementById('f_id'),
    f_name: document.getElementById('f_name'),
    f_city: document.getElementById('f_city'),
    f_age: document.getElementById('f_age'),
    f_gender: document.getElementById('f_gender'),
    f_height: document.getElementById('f_height'),
    f_weight: document.getElementById('f_weight'),
    genderHint: document.getElementById('genderHint'),
    sortResults: document.getElementById('sortResults'),
  };

  let mode = 'create'; // or 'edit'
  let editingId = null;
  let cache = {}; // last loaded /view payload

  function apiBase(){ return els.apiBase.value.trim().replace(/\/$/, ''); }

  function toast(msg, type){
    const t = document.createElement('div');
    t.className = 'toast ' + (type === 'error' ? 'err' : 'ok');
    t.textContent = msg;
    els.toasts.appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3800);
  }

  function extractMessage(data, fallback){
    if (!data) return fallback;
    if (typeof data.detail === 'string') return data.detail;
    if (Array.isArray(data.detail)) return data.detail.map(d => d.msg || JSON.stringify(d)).join('; ');
    if (data.message) return data.message;
    if (data.massage) return data.massage;
    return fallback;
  }

  async function api(path, options){
    options = options || {};
    let res, data = null;
    try{
      res = await fetch(apiBase() + path, {
        headers: {'Content-Type': 'application/json'},
        ...options
      });
    }catch(e){
      throw new Error('Could not reach the API at ' + apiBase() + '. Check the API base URL, that the server is running, and CORS.');
    }
    try{ data = await res.json(); }catch(e){ /* no body */ }
    if (!res.ok){
      throw new Error(extractMessage(data, 'Request failed with HTTP ' + res.status));
    }
    return data;
  }

  // ---------- Connection check ----------
  async function checkConnection(){
    els.statusDot.className = 'dot';
    els.statusText.textContent = 'checking…';
    try{
      await api('/about');
      els.statusDot.className = 'dot ok';
      els.statusText.textContent = 'connected';
    }catch(e){
      els.statusDot.className = 'dot bad';
      els.statusText.textContent = 'offline';
    }
  }

  // ---------- BMI (computed client-side; the API never stores it) ----------
  function bmiOf(p){
    const h = parseFloat(p.height), w = parseFloat(p.weight);
    if (!h || !w) return null;
    return Math.round((w / (h*h)) * 10) / 10;
  }
  function verdictOf(bmi){
    if (bmi == null) return {label: '—', cls: ''};
    if (bmi < 18.5) return {label: 'Underweight', cls: 'under'};
    if (bmi < 25) return {label: 'Normal', cls: 'normal'};
    if (bmi < 30) return {label: 'Overweight', cls: 'over'};
    return {label: 'Obese', cls: 'obese'};
  }

  function escapeHtml(s){
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function renderRow(id, p){
    const bmi = bmiOf(p);
    const v = verdictOf(bmi);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="id">${escapeHtml(id)}</td>
      <td>${escapeHtml(p.name)}</td>
      <td>${escapeHtml(p.city)}</td>
      <td class="mono">${escapeHtml(p.age)}</td>
      <td>${escapeHtml(p.gender)}</td>
      <td class="mono">${p.height ?? '—'}</td>
      <td class="mono">${p.weight ?? '—'}</td>
      <td class="mono">${bmi ?? '—'}</td>
      <td>${v.label !== '—' ? `<span class="badge ${v.cls}">${v.label}</span>` : '—'}</td>
      <td class="actions-cell">
        <button class="icon-btn" data-action="edit" data-id="${escapeHtml(id)}" title="Edit">
          <svg width="14" height="14" viewBox="0 0 14 14"><path d="M9.5 1.5l3 3-8 8-3.5 1 1-3.5z" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linejoin="round"/></svg>
        </button>
        <button class="icon-btn danger" data-action="delete" data-id="${escapeHtml(id)}" title="Delete">
          <svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 4h10M5.5 4V2.5h3V4M3.5 4l.7 8h5.6l.7-8" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </td>`;
    return tr;
  }

  async function loadPatients(){
    els.rows.innerHTML = `<tr><td colspan="10" style="color:var(--muted); font-family:var(--mono); font-size:13px;">Loading…</td></tr>`;
    els.emptyState.style.display = 'none';
    try{
      const data = await api('/view');
      cache = data || {};
      const ids = Object.keys(cache);
      els.rows.innerHTML = '';
      if (ids.length === 0){
        els.emptyState.style.display = 'block';
      } else {
        ids.forEach(id => els.rows.appendChild(renderRow(id, cache[id])));
      }
    }catch(e){
      els.rows.innerHTML = '';
      els.emptyState.style.display = 'block';
      toast(e.message, 'error');
    }
  }

  // ---------- Drawer ----------
  function openDrawer(m, id){
    mode = m;
    editingId = id || null;
    els.form.reset();
    els.genderHint.textContent = '';
    els.genderHint.className = 'field-hint';

    if (m === 'create'){
      els.drawerTitle.textContent = 'New patient';
      els.idField.style.display = '';
      els.f_id.disabled = false;
      els.f_id.required = true;
      els.f_gender.querySelector('option[value=""]').textContent = 'Select…';
      els.f_gender.value = '';
    } else {
      els.drawerTitle.textContent = 'Edit ' + id;
      els.idField.style.display = 'none';
      els.f_id.disabled = true;
      els.f_id.required = false;
      const p = cache[id] || {};
      els.f_name.value = p.name ?? '';
      els.f_city.value = p.city ?? '';
      els.f_age.value = p.age ?? '';
      els.f_height.value = p.height ?? '';
      els.f_weight.value = p.weight ?? '';
      els.f_gender.querySelector('option[value=""]').textContent = '— no change —';
      els.f_gender.value = '';
      els.genderHint.innerHTML = '<span class="label-warn">⚠ Known backend bug: changing gender via edit currently returns a validation error. Leave as "no change" unless you want to see it fail. Details below the code.</span>';
    }
    els.overlay.classList.add('show');
    els.drawer.classList.add('show');
  }
  function closeDrawer(){
    els.overlay.classList.remove('show');
    els.drawer.classList.remove('show');
  }
  document.getElementById('openCreate').addEventListener('click', () => openDrawer('create'));
  document.getElementById('emptyCreateBtn').addEventListener('click', () => openDrawer('create'));
  document.getElementById('closeDrawer').addEventListener('click', closeDrawer);
  document.getElementById('cancelForm').addEventListener('click', closeDrawer);
  els.overlay.addEventListener('click', closeDrawer);

  document.getElementById('submitForm').addEventListener('click', async () => {
    if (mode === 'create'){
      const id = els.f_id.value.trim();
      if (!id || !els.f_name.value.trim() || !els.f_city.value.trim() || !els.f_age.value || !els.f_gender.value || !els.f_height.value || !els.f_weight.value){
        toast('Fill in every field to create a patient — none of them are optional on this endpoint.', 'error');
        return;
      }
      const body = {
        id, name: els.f_name.value.trim(), city: els.f_city.value.trim(),
        age: Number(els.f_age.value), gender: els.f_gender.value,
        height: Number(els.f_height.value), weight: Number(els.f_weight.value)
      };
      try{
        await api('/create', {method: 'POST', body: JSON.stringify(body)});
        toast('Patient ' + id + ' created.');
        closeDrawer();
        loadPatients();
      }catch(e){ toast(e.message, 'error'); }
    } else {
      const body = {};
      if (els.f_name.value.trim()) body.name = els.f_name.value.trim();
      if (els.f_city.value.trim()) body.city = els.f_city.value.trim();
      if (els.f_age.value) body.age = Number(els.f_age.value);
      if (els.f_gender.value) body.gender = els.f_gender.value;
      if (els.f_height.value) body.height = Number(els.f_height.value);
      if (els.f_weight.value) body.weight = Number(els.f_weight.value);
      try{
        await api('/edit/' + encodeURIComponent(editingId), {method: 'PUT', body: JSON.stringify(body)});
        toast('Patient ' + editingId + ' updated.');
        closeDrawer();
        loadPatients();
      }catch(e){ toast(e.message, 'error'); }
    }
  });

  // ---------- Row actions (edit / delete) ----------
  els.rows.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'edit'){
      openDrawer('edit', id);
    } else if (btn.dataset.action === 'delete'){
      if (btn.dataset.confirming === '1'){
        try{
          await api('/delete/' + encodeURIComponent(id), {method: 'DELETE'});
          toast('Patient ' + id + ' deleted.');
          loadPatients();
        }catch(e){ toast(e.message, 'error'); }
        return;
      }
      btn.dataset.confirming = '1';
      const original = btn.innerHTML;
      btn.innerHTML = '✓';
      btn.title = 'Click again to confirm delete';
      setTimeout(() => { btn.dataset.confirming = '0'; btn.innerHTML = original; btn.title = 'Delete'; }, 3000);
    }
  });

  // ---------- Lookup by ID ----------
  document.getElementById('lookupBtn').addEventListener('click', async () => {
    const id = document.getElementById('lookupId').value.trim();
    if (!id) return;
    try{
      await api('/patients/' + encodeURIComponent(id));
      toast('Found ' + id + ' — scroll to the patient index.');
      const row = els.rows.querySelector(`button[data-id="${CSS.escape(id)}"]`)?.closest('tr');
      if (row){ row.scrollIntoView({behavior:'smooth', block:'center'}); row.style.background = 'var(--teal-wash)'; setTimeout(() => row.style.background = '', 1200); }
    }catch(e){ toast(e.message, 'error'); }
  });

  // ---------- Sort inspector ----------
  document.getElementById('runSort').addEventListener('click', async () => {
    const sortBy = document.getElementById('sortBy').value;
    const order = document.getElementById('sortOrder').value;
    els.sortResults.innerHTML = '<div style="color:var(--muted); font-family:var(--mono); font-size:13px;">Running…</div>';
    try{
      const data = await api('/sort?sort_by=' + sortBy + '&order=' + order);
      if (!Array.isArray(data) || data.length === 0){
        els.sortResults.innerHTML = '<div style="color:var(--muted); font-size:13px;">No results.</div>';
        return;
      }
      const rows = data.map(p => `<tr>
        <td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.city)}</td>
        <td class="mono">${p.height ?? '—'}</td><td class="mono">${p.weight ?? '—'}</td>
      </tr>`).join('');
      els.sortResults.innerHTML = `<table><thead><tr><th>Name</th><th>City</th><th class="mono">Height</th><th class="mono">Weight</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="field-hint" style="margin-top:8px;">Raw output of GET /sort — this endpoint doesn't return patient IDs, so they're omitted here.</div>`;
    }catch(e){
      els.sortResults.innerHTML = '';
      toast(e.message, 'error');
    }
  });

  // ---------- Refresh / init ----------
  document.getElementById('refreshBtn').addEventListener('click', () => { loadPatients(); checkConnection(); });
  els.apiBase.addEventListener('change', () => { checkConnection(); loadPatients(); });

  checkConnection();
  loadPatients();
})();