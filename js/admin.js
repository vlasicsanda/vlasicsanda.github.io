/* Administracija — sprema sadržaj izravno u GitHub repozitorij preko GitHub API-ja.
   Fotografije se prije spremanja automatski smanjuju (max 1600 px, JPEG). */
'use strict';

const FILES = {
  settings: 'data/settings.json',
  works: 'data/works.json',
  collections: 'data/collections.json',
  news: 'data/news.json'
};

const STATUS_NAMES = {
  'dostupna': 'Dostupna',
  'rezervirana': 'Rezervirana',
  'prodana': 'Prodana',
  'po-narudzbi': 'Po narudžbi'
};

const PRICE_MODES = {
  'show': 'Prikaži cijenu',
  'inquiry': 'Prikaži "Na upit"',
  'hidden': 'Sakrij cijenu'
};

const THEMES = [
  { id: 'white-cube', name: 'White cube', desc: 'Kustoski minimalizam — bijelo, zrak, fokus na djela', colors: ['#ffffff', '#1a1a18', '#9a9a94'] },
  { id: 'atelier', name: 'Atelijer', desc: 'Editorial stil — veliki serif, asimetrija, krem tonovi', colors: ['#f6f2ea', '#241f16', '#c2683f'] },
  { id: 'noir', name: 'Tamna galerija', desc: 'Slike pod reflektorom — tamno i zlatno', colors: ['#121212', '#c9a86a', '#e8e2d6'] },
  { id: 'kino', name: 'Kino', desc: 'Naslovnica: svaka slika preko cijelog ekrana', colors: ['#0e1216', '#dfe8ee', '#8d99a3'] },
  { id: 'mozaik', name: 'Mozaik', desc: 'Slike rub do ruba u prirodnom omjeru', colors: ['#ffffff', '#141414', '#c2683f'] }
];
const THEME_LEGACY = { museum: 'white-cube', minimal: 'white-cube', mediterranean: 'atelier', dark: 'noir' };

let cfg = null;
try { cfg = JSON.parse(localStorage.getItem('sv-admin')); } catch (e) { }

const db = {}, shas = {}, pending = {};
let tab = 'works';

const app = document.getElementById('app');
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function slug(s) {
  return String(s).toLowerCase()
    .replace(/[čć]/g, 'c').replace(/š/g, 's').replace(/ž/g, 'z').replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function uniqueId(base, key) {
  const s = slug(base) || 'stavka';
  let id = s, i = 2;
  while (db[key].some(x => x.id === id)) id = s + '-' + (i++);
  return id;
}

function encB64(str) {
  const b = new TextEncoder().encode(str);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}

function decB64(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(arr);
}

/* ===== GitHub API ===== */

async function gh(method, path, body) {
  const url = 'https://api.github.com/repos/' + cfg.owner + '/' + cfg.repo + '/contents/' + path +
    (method === 'GET' ? '?ref=' + encodeURIComponent(cfg.branch) + '&t=' + Date.now() : '');
  const r = await fetch(url, {
    method,
    cache: 'no-store',
    headers: { 'Authorization': 'Bearer ' + cfg.token, 'Accept': 'application/vnd.github+json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (r.status === 401) throw new Error('Token nije važeći ili je istekao. Napravi novi token i prijavi se ponovno.');
  if (r.status === 404 && method === 'GET') throw new Error('Datoteka nije pronađena: ' + path + '. Provjeri korisničko ime, repozitorij i granu.');
  if (!r.ok) {
    let d = '';
    try { d = (await r.json()).message || ''; } catch (e) { }
    throw new Error('GitHub greška (' + r.status + '): ' + d);
  }
  return r.json();
}

async function loadAll() {
  for (const k of Object.keys(FILES)) {
    const r = await gh('GET', FILES[k]);
    shas[k] = r.sha;
    db[k] = JSON.parse(decB64(r.content));
  }
}

async function saveFile(key, msg) {
  const res = await gh('PUT', FILES[key], {
    message: msg,
    content: encB64(JSON.stringify(db[key], null, 2)),
    sha: shas[key],
    branch: cfg.branch
  });
  shas[key] = res.content.sha;
  toast('Spremljeno ✓ Promjena će biti vidljiva na stranici za oko 1 minutu.');
}

function resizeImage(file, maxDim, quality) {
  maxDim = maxDim || 1600; quality = quality || 0.85;
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, maxDim / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Ne mogu pročitati fotografiju.')); };
    img.src = url;
  });
}

async function uploadDataUrl(dataUrl, baseName, message) {
  const name = 'images/' + Date.now() + '-' + (slug(baseName) || 'foto') + '.jpg';
  await gh('PUT', name, { message: message || 'Nova fotografija', content: dataUrl.split(',')[1], branch: cfg.branch });
  return name;
}

async function uploadImageFile(file) {
  const dataUrl = await resizeImage(file);
  return uploadDataUrl(dataUrl, file.name.replace(/\.[^.]+$/, ''));
}

/* ===== Uvoz iz Google Photos dijeljenog albuma =====
   Admin zapiše zahtjev u data/import-request.json; GitHub Action u repozitoriju
   (.github/workflows/uvoz-google-photos.yml) skine fotografije i doda radove,
   a admin dotad provjerava rezultat. */

const IMPORT_REQUEST = 'data/import-request.json';

/* ===== Polje za fotografiju (upload ili URL) ===== */

function imageField(key, current) {
  const isUrl = current && /^https?:/.test(current);
  return `<div class="img-field">
    <img id="img-prev-${key}" src="${esc(current || '')}"${current ? '' : ' hidden'} alt="">
    <span class="file-btn">📷 Odaberi fotografiju s uređaja
      <input type="file" id="img-file-${key}" accept="image/*" hidden></span>
    <input type="url" id="img-url-${key}" placeholder="…ili zalijepi internetsku adresu (URL) fotografije" value="${isUrl ? esc(current) : ''}">
  </div>`;
}

function bindImageField(key) {
  $('#img-file-' + key).addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    pending[key] = f;
    const p = $('#img-prev-' + key);
    p.src = URL.createObjectURL(f);
    p.hidden = false;
    $('#img-url-' + key).value = '';
  });
}

async function resolveImage(key, current) {
  if (pending[key]) {
    const path = await uploadImageFile(pending[key]);
    delete pending[key];
    return path;
  }
  const u = $('#img-url-' + key).value.trim();
  return u || current || '';
}

/* ===== Pomoćni UI ===== */

let toastTimer = null;
function toast(msg) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 5000);
}

function setBusy(on) {
  let el = $('#busy');
  if (!el) { el = document.createElement('div'); el.id = 'busy'; el.className = 'busy'; el.textContent = 'Spremam…'; document.body.appendChild(el); }
  el.hidden = !on;
}

function collectionName(id) {
  const c = db.collections.find(x => x.id === id);
  return c ? c.name : '';
}

function priceSummary(w) {
  if (w.priceMode === 'hidden') return 'cijena skrivena';
  if (w.priceMode === 'inquiry') return 'na upit';
  return w.price || 'bez cijene';
}

/* ===== Prijava ===== */

function renderLogin(errorMsg) {
  let owner = '', repo = '';
  if (cfg) { owner = cfg.owner || ''; repo = cfg.repo || ''; }
  if (!owner && location.hostname.endsWith('.github.io')) {
    owner = location.hostname.split('.')[0];
    repo = location.pathname.split('/').filter(Boolean)[0] || '';
  }
  app.innerHTML = `<div class="login">
    <h1>Administracija</h1>
    <p class="small">Prijava za uređivanje web stranice. Podatke za prijavu dobiješ jednom i spremaju se na ovom uređaju.</p>
    ${errorMsg ? `<div class="error">${esc(errorMsg)}</div>` : ''}
    <label>GitHub korisničko ime<input id="l-owner" value="${esc(owner)}" autocapitalize="none"></label>
    <label>Naziv repozitorija<input id="l-repo" value="${esc(repo)}" autocapitalize="none"></label>
    <label>Pristupni token<input id="l-token" type="password" autocapitalize="none"></label>
    <details style="margin-bottom:14px"><summary class="small">Napredno</summary>
      <label style="margin-top:10px">Grana (branch)<input id="l-branch" value="${esc((cfg && cfg.branch) || 'main')}"></label>
    </details>
    <button class="btn" id="l-submit">Prijavi se</button>
    <p class="small" style="margin-top:14px">Kako napraviti token piše u datoteci README.md (korak 3).</p>
  </div>`;
  $('#l-submit').addEventListener('click', async () => {
    cfg = {
      owner: $('#l-owner').value.trim(),
      repo: $('#l-repo').value.trim(),
      token: $('#l-token').value.trim(),
      branch: $('#l-branch').value.trim() || 'main'
    };
    if (!cfg.owner || !cfg.repo || !cfg.token) { renderLogin('Ispuni sva polja.'); return; }
    app.innerHTML = '<p style="text-align:center;padding:40px">Provjeravam podatke…</p>';
    try {
      await loadAll();
      localStorage.setItem('sv-admin', JSON.stringify(cfg));
      renderMain();
    } catch (e) {
      renderLogin(e.message);
    }
  });
}

/* ===== Glavni raspored ===== */

function renderMain() {
  app.innerHTML = `
    <header class="topbar">
      <div><strong>Administracija</strong> — ${esc(db.settings.siteTitle)}</div>
      <div class="topbar-actions">
        <a href="index.html" target="_blank">Otvori stranicu ↗</a>
        <button class="link" id="logout">Odjava</button>
      </div>
    </header>
    <nav class="tabs" id="tabs">
      <button data-tab="works">🖼️ Radovi</button>
      <button data-tab="collections">📁 Kolekcije</button>
      <button data-tab="news">📰 Novosti</button>
      <button data-tab="settings">⚙️ Postavke</button>
    </nav>
    <main class="content" id="content"></main>`;
  $('#logout').addEventListener('click', () => {
    if (confirm('Odjaviti se s ovog uređaja?')) { localStorage.removeItem('sv-admin'); location.reload(); }
  });
  $('#tabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-tab]');
    if (b) { tab = b.dataset.tab; renderTab(); }
  });
  renderTab();
}

function renderTab() {
  Object.keys(pending).forEach(k => delete pending[k]);
  $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  ({ works: renderWorks, collections: renderCollections, news: renderNews, settings: renderSettings }[tab])();
}

/* ===== Radovi ===== */

function renderWorks() {
  const c = $('#content');
  c.innerHTML = `<div class="bar">
      <button class="btn" id="add-work">＋ Dodaj rad</button>
      <button class="btn-sm" id="import-gp">⬇ Uvezi iz Google Photosa</button>
      <input id="w-search" type="search" placeholder="Pretraži radove…">
    </div>
    <div id="w-list"></div>`;

  const draw = () => {
    const term = $('#w-search').value.trim().toLowerCase();
    const list = db.works.filter(w => !term ||
      String(w.title).toLowerCase().includes(term) || String(w.code).toLowerCase().includes(term));
    $('#w-list').innerHTML = list.length ? list.map(w => `<div class="row">
      <img class="thumb" src="${esc(w.image || 'images/bez-fotografije.svg')}" alt="">
      <div class="row-main">
        <strong>${esc(w.title)}</strong>
        <span class="small">${esc(w.code || '—')} · ${esc(collectionName(w.collection) || 'bez kolekcije')} · ${esc(priceSummary(w))}</span>
      </div>
      <select data-status="${esc(w.id)}">${Object.keys(STATUS_NAMES).map(s =>
        `<option value="${s}"${w.status === s ? ' selected' : ''}>${STATUS_NAMES[s]}</option>`).join('')}</select>
      <button class="btn-sm" data-edit="${esc(w.id)}">Uredi</button>
      <button class="btn-sm danger" data-del="${esc(w.id)}">Obriši</button>
    </div>`).join('') : '<p class="small">Nema radova. Klikni „Dodaj rad".</p>';
  };

  $('#add-work').addEventListener('click', () => workForm(null));
  $('#import-gp').addEventListener('click', importForm);
  $('#w-search').addEventListener('input', draw);

  $('#w-list').addEventListener('click', async e => {
    const edit = e.target.closest('[data-edit]');
    if (edit) { workForm(db.works.find(w => w.id === edit.dataset.edit)); return; }
    const del = e.target.closest('[data-del]');
    if (del) {
      const w = db.works.find(x => x.id === del.dataset.del);
      if (!confirm('Obrisati rad „' + w.title + '"? Ovo se ne može poništiti.')) return;
      db.works = db.works.filter(x => x !== w);
      setBusy(true);
      try { await saveFile('works', 'Obrisan rad: ' + w.title); draw(); }
      catch (err) { alert('Greška pri spremanju: ' + err.message); }
      finally { setBusy(false); }
    }
  });

  $('#w-list').addEventListener('change', async e => {
    const sel = e.target.closest('select[data-status]');
    if (!sel) return;
    const w = db.works.find(x => x.id === sel.dataset.status);
    w.status = sel.value;
    setBusy(true);
    try { await saveFile('works', 'Promijenjen status: ' + w.title + ' → ' + STATUS_NAMES[w.status]); }
    catch (err) { alert('Greška pri spremanju: ' + err.message); }
    finally { setBusy(false); }
  });

  draw();
}

function workForm(existing) {
  const w = existing || {
    title: '', code: '', dimensions: '', technique: '', description: '',
    price: '', priceMode: 'show', status: 'dostupna',
    collection: (db.collections[0] && db.collections[0].id) || '', image: '', featured: false
  };
  const c = $('#content');
  c.innerHTML = `<div class="card">
    <h2 style="margin-top:0">${existing ? 'Uredi rad' : 'Novi rad'}</h2>
    <div class="form-grid">
      <label class="full">Naziv rada *<input id="w-title" value="${esc(w.title)}"></label>
      <label class="full">Fotografija${imageField('work', w.image)}</label>
      <label>Šifra<input id="w-code" value="${esc(w.code)}" placeholder="npr. SV-007"></label>
      <label>Dimenzije<input id="w-dim" value="${esc(w.dimensions)}" placeholder="npr. 50 × 70 cm"></label>
      <label>Tehnika<input id="w-tech" value="${esc(w.technique || '')}" placeholder="npr. akril na platnu"></label>
      <label>Kolekcija<select id="w-collection">${db.collections.map(k =>
        `<option value="${esc(k.id)}"${w.collection === k.id ? ' selected' : ''}>${esc(k.name)}</option>`).join('')}</select></label>
      <label>Status<select id="w-status">${Object.keys(STATUS_NAMES).map(s =>
        `<option value="${s}"${w.status === s ? ' selected' : ''}>${STATUS_NAMES[s]}</option>`).join('')}</select></label>
      <label>Cijena<input id="w-price" value="${esc(w.price)}" placeholder="npr. 350 €"></label>
      <label>Prikaz cijene<select id="w-pricemode">${Object.keys(PRICE_MODES).map(m =>
        `<option value="${m}"${w.priceMode === m ? ' selected' : ''}>${PRICE_MODES[m]}</option>`).join('')}</select></label>
      <label class="full">Opis<textarea id="w-desc">${esc(w.description)}</textarea></label>
      <label class="check full"><input type="checkbox" id="w-featured"${w.featured ? ' checked' : ''}> Istakni na naslovnici</label>
    </div>
    <div class="actions">
      <button class="btn" id="w-save">Spremi</button>
      <button class="btn gray" id="w-cancel">Odustani</button>
    </div>
  </div>`;
  bindImageField('work');
  $('#w-cancel').addEventListener('click', renderTab);
  $('#w-save').addEventListener('click', async () => {
    const title = $('#w-title').value.trim();
    if (!title) { alert('Upiši naziv rada.'); return; }
    setBusy(true);
    try {
      const image = await resolveImage('work', existing ? existing.image : '');
      const target = existing || {
        id: uniqueId($('#w-code').value.trim() || title, 'works'),
        created: new Date().toISOString().slice(0, 10)
      };
      Object.assign(target, {
        title,
        code: $('#w-code').value.trim(),
        dimensions: $('#w-dim').value.trim(),
        technique: $('#w-tech').value.trim(),
        description: $('#w-desc').value.trim(),
        price: $('#w-price').value.trim(),
        priceMode: $('#w-pricemode').value,
        status: $('#w-status').value,
        collection: $('#w-collection').value,
        image,
        featured: $('#w-featured').checked
      });
      if (!existing) db.works.unshift(target);
      await saveFile('works', (existing ? 'Uređen rad: ' : 'Dodan rad: ') + title);
      renderTab();
    } catch (err) {
      alert('Greška pri spremanju: ' + err.message);
    } finally { setBusy(false); }
  });
}

function importForm() {
  $('#content').innerHTML = `<div class="card">
    <h2 style="margin-top:0">Uvoz iz Google Photosa</h2>
    <p class="small">U aplikaciji Google Photos otvori album → <strong>Dijeli</strong> →
      <strong>Kopiraj vezu</strong> i zalijepi je ovdje. Sve fotografije iz albuma trajno se
      kopiraju na stranicu (već uvezene se preskaču), a nakon uvoza svakoj slici upiši naziv,
      cijenu i kolekciju. Uvoz obično traje 1–2 minute — ne zatvaraj ovu stranicu dok traje.</p>
    <label>Link na album<input id="gp-link" type="url" placeholder="https://photos.app.goo.gl/…" autocapitalize="none"></label>
    <p id="gp-status" class="small"></p>
    <div class="actions">
      <button class="btn" id="gp-start">Uvezi fotografije</button>
      <button class="btn gray" id="gp-cancel">Natrag</button>
    </div>
  </div>`;
  $('#gp-cancel').addEventListener('click', renderTab);
  $('#gp-start').addEventListener('click', runImport);
}

async function runImport() {
  const link = $('#gp-link').value.trim();
  const status = msg => { const el = $('#gp-status'); if (el) el.textContent = msg; };
  if (!/^https:\/\/(photos\.app\.goo\.gl|photos\.google\.com)\//.test(link)) {
    alert('Zalijepi link za dijeljenje Google Photos albuma (počinje s https://photos.app.goo.gl/…).');
    return;
  }
  const startBtn = $('#gp-start');
  startBtn.disabled = true;
  setBusy(true);
  try {
    status('Pokrećem uvoz…');
    let sha = null;
    try { sha = (await gh('GET', IMPORT_REQUEST)).sha; } catch (e) { }
    const body = {
      message: 'Zahtjev za uvoz iz Google Photosa',
      content: encB64(JSON.stringify({ url: link, status: 'pending', requestedAt: new Date().toISOString() }, null, 2)),
      branch: cfg.branch
    };
    if (sha) body.sha = sha;
    await gh('PUT', IMPORT_REQUEST, body);

    const started = Date.now();
    const deadline = started + 6 * 60 * 1000;
    while (Date.now() < deadline) {
      status('Uvozim fotografije — obično traje 1–2 minute… (' + Math.round((Date.now() - started) / 1000) + ' s)');
      await new Promise(r => setTimeout(r, 8000));
      let st;
      try { st = JSON.parse(decB64((await gh('GET', IMPORT_REQUEST)).content)); }
      catch (e) { continue; }
      if (st.status === 'error') throw new Error(st.error || 'Nepoznata greška.');
      if (st.status === 'done') {
        const w = await gh('GET', FILES.works);
        shas.works = w.sha;
        db.works = JSON.parse(decB64(w.content));
        alert('Uvezeno ' + st.imported + ' fotografija.' +
          (st.skipped ? ' Preskočeno jer su već uvezene: ' + st.skipped + '.' : '') +
          (st.imported ? '\n\nSada svakoj slici klikni „Uredi" i upiši naziv, cijenu i kolekciju.' : ''));
        renderTab();
        return;
      }
    }
    throw new Error('Uvoz traje predugo. Pričekaj koju minutu pa osvježi — ako radova nema, pokušaj ponovno (već uvezene fotografije se ne dupliciraju).');
  } catch (e) {
    status('');
    alert('Uvoz nije uspio: ' + e.message);
    startBtn.disabled = false;
  } finally {
    setBusy(false);
  }
}

/* ===== Kolekcije ===== */

function renderCollections() {
  const c = $('#content');
  c.innerHTML = `<div class="bar"><button class="btn" id="add-col">＋ Dodaj kolekciju</button></div>
    <div id="c-list"></div>`;

  const draw = () => {
    $('#c-list').innerHTML = db.collections.map(k => {
      const count = db.works.filter(w => w.collection === k.id).length;
      return `<div class="row">
        <div class="row-main"><strong>${esc(k.name)}</strong>
          <span class="small">${count} radova${k.description ? ' · ' + esc(k.description) : ''}</span></div>
        <button class="btn-sm" data-edit="${esc(k.id)}">Uredi</button>
        <button class="btn-sm danger" data-del="${esc(k.id)}">Obriši</button>
      </div>`;
    }).join('') || '<p class="small">Nema kolekcija.</p>';
  };

  $('#add-col').addEventListener('click', () => colForm(null));
  $('#c-list').addEventListener('click', async e => {
    const edit = e.target.closest('[data-edit]');
    if (edit) { colForm(db.collections.find(k => k.id === edit.dataset.edit)); return; }
    const del = e.target.closest('[data-del]');
    if (del) {
      const k = db.collections.find(x => x.id === del.dataset.del);
      const count = db.works.filter(w => w.collection === k.id).length;
      if (count > 0) { alert('Kolekcija „' + k.name + '" sadrži ' + count + ' radova. Prvo premjesti radove u drugu kolekciju.'); return; }
      if (!confirm('Obrisati kolekciju „' + k.name + '"?')) return;
      db.collections = db.collections.filter(x => x !== k);
      setBusy(true);
      try { await saveFile('collections', 'Obrisana kolekcija: ' + k.name); draw(); }
      catch (err) { alert('Greška pri spremanju: ' + err.message); }
      finally { setBusy(false); }
    }
  });
  draw();
}

function colForm(existing) {
  const k = existing || { name: '', description: '' };
  $('#content').innerHTML = `<div class="card">
    <h2 style="margin-top:0">${existing ? 'Uredi kolekciju' : 'Nova kolekcija'}</h2>
    <label>Naziv *<input id="c-name" value="${esc(k.name)}"></label>
    <label>Kratki opis<input id="c-desc" value="${esc(k.description || '')}"></label>
    <div class="actions">
      <button class="btn" id="c-save">Spremi</button>
      <button class="btn gray" id="c-cancel">Odustani</button>
    </div>
  </div>`;
  $('#c-cancel').addEventListener('click', renderTab);
  $('#c-save').addEventListener('click', async () => {
    const name = $('#c-name').value.trim();
    if (!name) { alert('Upiši naziv kolekcije.'); return; }
    setBusy(true);
    try {
      const target = existing || { id: uniqueId(name, 'collections') };
      target.name = name;
      target.description = $('#c-desc').value.trim();
      if (!existing) db.collections.push(target);
      await saveFile('collections', (existing ? 'Uređena kolekcija: ' : 'Dodana kolekcija: ') + name);
      renderTab();
    } catch (err) {
      alert('Greška pri spremanju: ' + err.message);
    } finally { setBusy(false); }
  });
}

/* ===== Novosti ===== */

function renderNews() {
  const c = $('#content');
  c.innerHTML = `<div class="bar"><button class="btn" id="add-news">＋ Nova objava</button></div>
    <div id="n-list"></div>`;

  const draw = () => {
    const list = db.news.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    $('#n-list').innerHTML = list.map(n => `<div class="row">
      <div class="row-main"><strong>${esc(n.title)}</strong><span class="small">${esc(n.date)}</span></div>
      <button class="btn-sm" data-edit="${esc(n.id)}">Uredi</button>
      <button class="btn-sm danger" data-del="${esc(n.id)}">Obriši</button>
    </div>`).join('') || '<p class="small">Nema objava.</p>';
  };

  $('#add-news').addEventListener('click', () => newsForm(null));
  $('#n-list').addEventListener('click', async e => {
    const edit = e.target.closest('[data-edit]');
    if (edit) { newsForm(db.news.find(n => n.id === edit.dataset.edit)); return; }
    const del = e.target.closest('[data-del]');
    if (del) {
      const n = db.news.find(x => x.id === del.dataset.del);
      if (!confirm('Obrisati objavu „' + n.title + '"?')) return;
      db.news = db.news.filter(x => x !== n);
      setBusy(true);
      try { await saveFile('news', 'Obrisana objava: ' + n.title); draw(); }
      catch (err) { alert('Greška pri spremanju: ' + err.message); }
      finally { setBusy(false); }
    }
  });
  draw();
}

function newsForm(existing) {
  const n = existing || { title: '', date: new Date().toISOString().slice(0, 10), image: '', text: '' };
  $('#content').innerHTML = `<div class="card">
    <h2 style="margin-top:0">${existing ? 'Uredi objavu' : 'Nova objava'}</h2>
    <label>Naslov *<input id="n-title" value="${esc(n.title)}"></label>
    <label>Datum<input id="n-date" type="date" value="${esc(n.date)}"></label>
    <label>Fotografija (nije obavezno)${imageField('news', n.image)}</label>
    <label>Tekst *<textarea id="n-text">${esc(n.text)}</textarea></label>
    <div class="actions">
      <button class="btn" id="n-save">Objavi</button>
      <button class="btn gray" id="n-cancel">Odustani</button>
    </div>
  </div>`;
  bindImageField('news');
  $('#n-cancel').addEventListener('click', renderTab);
  $('#n-save').addEventListener('click', async () => {
    const title = $('#n-title').value.trim();
    const text = $('#n-text').value.trim();
    if (!title || !text) { alert('Upiši naslov i tekst objave.'); return; }
    setBusy(true);
    try {
      const image = await resolveImage('news', existing ? existing.image : '');
      const target = existing || { id: uniqueId(title, 'news') };
      Object.assign(target, { title, date: $('#n-date').value || new Date().toISOString().slice(0, 10), image, text });
      if (!existing) db.news.unshift(target);
      await saveFile('news', (existing ? 'Uređena objava: ' : 'Nova objava: ') + title);
      renderTab();
    } catch (err) {
      alert('Greška pri spremanju: ' + err.message);
    } finally { setBusy(false); }
  });
}

/* ===== Postavke ===== */

function renderSettings() {
  const st = db.settings;
  let selTheme = THEME_LEGACY[st.theme] || st.theme;
  if (!THEMES.some(t => t.id === selTheme)) selTheme = 'white-cube';
  $('#content').innerHTML = `
    <div class="card">
      <h2 style="margin-top:0">Izgled stranice</h2>
      <div class="theme-grid" id="theme-grid">${THEMES.map(th => `
        <div class="theme-card${th.id === selTheme ? ' selected' : ''}" data-theme="${th.id}">
          <div class="theme-dots">${th.colors.map(cl => `<span style="background:${cl}"></span>`).join('')}</div>
          <h4>${th.name}</h4><p>${th.desc}</p>
        </div>`).join('')}</div>
      <p class="small">Promjena teme ne briše nikakav sadržaj — mijenja samo izgled.</p>
    </div>
    <div class="card">
      <h2 style="margin-top:0">Naslovnica</h2>
      <label>Naziv stranice<input id="s-title" value="${esc(st.siteTitle)}"></label>
      <label>Veliki naslov na naslovnici<input id="s-hero-title" value="${esc(st.heroTitle || '')}"></label>
      <label>Podnaslov na naslovnici<input id="s-hero-sub" value="${esc(st.heroSubtitle || '')}"></label>
      <label>Velika fotografija na naslovnici${imageField('hero', st.heroImage)}</label>
    </div>
    <div class="card">
      <h2 style="margin-top:0">O umjetnici</h2>
      <label>Tekst<textarea id="s-about" style="min-height:200px">${esc(st.aboutText || '')}</textarea></label>
      <label>Fotografija${imageField('about', st.aboutImage)}</label>
    </div>
    <div class="card">
      <h2 style="margin-top:0">Kontakt i jezik</h2>
      <label>E-mail adresa<input id="s-email" type="email" value="${esc(st.email || '')}"></label>
      <label>Telefon<input id="s-phone" value="${esc(st.phone || '')}"></label>
      <label>Instagram (puna adresa)<input id="s-instagram" value="${esc(st.instagram || '')}" placeholder="https://instagram.com/…"></label>
      <label>Facebook (puna adresa)<input id="s-facebook" value="${esc(st.facebook || '')}" placeholder="https://facebook.com/…"></label>
      <label>Jezik stranice<select id="s-lang">
        <option value="hr"${st.language === 'hr' ? ' selected' : ''}>Hrvatski</option>
        <option value="en"${st.language === 'en' ? ' selected' : ''}>English</option>
        <option value="sl"${st.language === 'sl' ? ' selected' : ''}>Slovenščina</option>
      </select></label>
    </div>
    <div class="settings-float-actions">
      <button class="btn" id="s-save">Spremi postavke</button>
      <button class="btn-sm" type="button" id="s-preview-theme">Isprobaj temu</button>
      <span class="small">Pregled odmah, spremanje posebno.</span>
    </div>`;
  bindImageField('hero');
  bindImageField('about');
  const previewThemeUrl = () => {
    const url = new URL('index.html', location.href);
    url.searchParams.set('tema', selTheme);
    return url.toString();
  };
  $('#theme-grid').addEventListener('click', e => {
    const card = e.target.closest('.theme-card');
    if (!card) return;
    selTheme = card.dataset.theme;
    $$('.theme-card').forEach(x => x.classList.toggle('selected', x === card));
  });
  $('#s-preview-theme').addEventListener('click', () => {
    window.open(previewThemeUrl(), '_blank', 'noopener');
  });
  $('#s-save').addEventListener('click', async () => {
    setBusy(true);
    try {
      st.heroImage = await resolveImage('hero', st.heroImage);
      st.aboutImage = await resolveImage('about', st.aboutImage);
      st.theme = selTheme;
      st.siteTitle = $('#s-title').value.trim() || st.siteTitle;
      st.heroTitle = $('#s-hero-title').value.trim();
      st.heroSubtitle = $('#s-hero-sub').value.trim();
      st.aboutText = $('#s-about').value.trim();
      st.email = $('#s-email').value.trim();
      st.phone = $('#s-phone').value.trim();
      st.instagram = $('#s-instagram').value.trim();
      st.facebook = $('#s-facebook').value.trim();
      st.language = $('#s-lang').value;
      await saveFile('settings', 'Ažurirane postavke');
      renderMain();
    } catch (err) {
      alert('Greška pri spremanju: ' + err.message);
    } finally { setBusy(false); }
  });
}

/* ===== Pokretanje ===== */

(async function init() {
  if (!cfg || !cfg.token) { renderLogin(''); return; }
  try {
    await loadAll();
    renderMain();
  } catch (e) {
    renderLogin(e.message);
  }
})();
