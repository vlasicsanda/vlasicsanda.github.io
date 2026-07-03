/* Glavna logika javne stranice — čita data/*.json i renderira sadržaj.
   Nema build koraka: sve su obične statičke datoteke. */
'use strict';

const STATUS_CLASSES = {
  'dostupna': 'badge-available',
  'rezervirana': 'badge-reserved',
  'prodana': 'badge-sold',
  'po-narudzbi': 'badge-order'
};

const S = { settings: null, works: [], collections: [], news: [], t: {} };
const $ = s => document.querySelector(s);

function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function t(k) { return S.t[k] || k; }
function param(n) { return new URLSearchParams(location.search).get(n) || ''; }

async function loadJSON(p) {
  const r = await fetch(p + '?v=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error(p);
  return r.json();
}

function paragraphs(text) {
  return String(text || '').trim().split(/\n\s*\n/).filter(Boolean)
    .map(p => '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>').join('');
}

function fmtDate(d) {
  const dt = new Date(d);
  if (isNaN(dt)) return esc(d);
  const loc = { hr: 'hr-HR', en: 'en-GB', sl: 'sl-SI' }[S.settings.language] || 'hr-HR';
  return dt.toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric' });
}

function excerpt(s, n) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? esc(s.slice(0, n)) + '…' : esc(s);
}

function collectionName(id) {
  const c = S.collections.find(x => x.id === id);
  return c ? c.name : '';
}

function workImg(w) { return w.image || 'images/bez-fotografije.svg'; }

function statusBadge(w, inline) {
  const cls = STATUS_CLASSES[w.status];
  if (!cls) return '';
  return '<span class="badge ' + cls + (inline ? ' inline' : '') + '">' + esc(t('status_' + w.status)) + '</span>';
}

function priceHTML(w) {
  if (w.priceMode === 'hidden') return '';
  if (w.priceMode === 'inquiry') return '<span class="price">' + esc(t('onRequest')) + '</span>';
  if (w.price) return '<span class="price">' + esc(w.price) + '</span>';
  return '';
}

function workCard(w) {
  return `<a class="work-card" href="rad.html?id=${encodeURIComponent(w.id)}">
    <div class="work-image"><img src="${esc(workImg(w))}" alt="${esc(w.title)}" loading="lazy">${statusBadge(w)}</div>
    <div class="work-info">
      <h3>${esc(w.title)}</h3>
      <p class="work-meta">${esc(w.dimensions || '')}${w.technique ? ' · ' + esc(w.technique) : ''}</p>
      <p class="work-sub">${esc(collectionName(w.collection))}</p>
      ${priceHTML(w)}
    </div></a>`;
}

function setMeta(name, content) {
  let m = document.querySelector('meta[name="' + name + '"]');
  if (!m) { m = document.createElement('meta'); m.name = name; document.head.appendChild(m); }
  m.content = content;
}

/* ===== Zaglavlje i podnožje ===== */

function renderHeader() {
  const page = document.body.dataset.page;
  const items = [
    ['index.html', 'nav_home', 'home'],
    ['galerija.html', 'nav_gallery', 'gallery'],
    ['kolekcije.html', 'nav_collections', 'collections'],
    ['novosti.html', 'nav_news', 'news'],
    ['o-umjetnici.html', 'nav_about', 'about'],
    ['kontakt.html', 'nav_contact', 'contact']
  ];
  const active = p => p === page ||
    (p === 'gallery' && page === 'work') ||
    (p === 'news' && page === 'newsItem');
  $('#site-header').innerHTML = `<div class="container header-inner">
    <a class="logo" href="index.html">${esc(S.settings.siteTitle)}</a>
    <button class="nav-toggle" aria-label="Izbornik">☰</button>
    <nav class="site-nav" id="site-nav">
      ${items.map(([h, k, p]) => `<a href="${h}"${active(p) ? ' class="active"' : ''}>${t(k)}</a>`).join('')}
    </nav></div>`;
  $('.nav-toggle').addEventListener('click', () => $('#site-nav').classList.toggle('open'));
}

function renderFooter() {
  const st = S.settings;
  const links = [
    st.email ? `<a href="mailto:${esc(st.email)}">${esc(st.email)}</a>` : '',
    st.instagram ? `<a href="${esc(st.instagram)}" target="_blank" rel="noopener">Instagram</a>` : '',
    st.facebook ? `<a href="${esc(st.facebook)}" target="_blank" rel="noopener">Facebook</a>` : ''
  ].filter(Boolean).join(' · ');
  $('#site-footer').innerHTML = `<div class="container footer-inner">
    <span>© ${new Date().getFullYear()} ${esc(st.siteTitle)}</span><span>${links}</span></div>`;
}

/* ===== Stranice ===== */

function renderHome() {
  const featured = S.works.filter(w => w.featured);
  const show = (featured.length ? featured : S.works).slice(0, 6);
  const news = S.news.slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 3);
  $('#main').innerHTML = `
    <section class="hero" style="background-image:url('${esc(S.settings.heroImage)}')">
      <div class="hero-overlay"></div>
      <div class="hero-content">
        <h1>${esc(S.settings.heroTitle || S.settings.siteTitle)}</h1>
        <p>${esc(S.settings.heroSubtitle || '')}</p>
        <a class="btn" href="galerija.html">${t('viewGallery')}</a>
      </div>
    </section>
    <section class="section"><div class="container">
      <h2>${t('featuredWorks')}</h2>
      ${show.length ? `<div class="works-grid">${show.map(workCard).join('')}</div>` : `<p class="muted">${t('galleryEmpty')}</p>`}
      <p class="center" style="margin:36px 0 0"><a class="btn btn-outline" href="galerija.html">${t('allWorks')}</a></p>
    </div></section>
    ${news.length ? `<section class="section alt"><div class="container">
      <h2>${t('latestNews')}</h2>
      <div class="news-teaser-grid">${news.map(n =>
        `<a class="news-item" href="novost.html?id=${encodeURIComponent(n.id)}">
          <span class="date">${fmtDate(n.date)}</span>
          <h3>${esc(n.title)}</h3>
          <p class="muted">${excerpt(n.text, 120)}</p>
        </a>`).join('')}</div>
    </div></section>` : ''}`;
}

function renderGallery() {
  $('#main').innerHTML = `<section class="section"><div class="container">
    <h1 class="page-head">${t('nav_gallery')}</h1>
    <div class="filters">
      <input id="f-q" type="search" placeholder="${t('searchPlaceholder')}">
      <select id="f-c"><option value="">${t('allCollections')}</option>
        ${S.collections.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select>
      <select id="f-s"><option value="">${t('allStatuses')}</option>
        ${Object.keys(STATUS_CLASSES).map(s => `<option value="${s}">${t('status_' + s)}</option>`).join('')}</select>
    </div>
    <div id="works" class="works-grid"></div>
    <p id="no-results" class="muted" hidden>${t('noResults')}</p>
  </div></section>`;

  const q = $('#f-q'), c = $('#f-c'), s = $('#f-s');
  q.value = param('q'); c.value = param('kolekcija'); s.value = param('status');
  const apply = () => {
    const term = q.value.trim().toLowerCase();
    const list = S.works.filter(w =>
      (!c.value || w.collection === c.value) &&
      (!s.value || w.status === s.value) &&
      (!term || String(w.title).toLowerCase().includes(term) || String(w.code).toLowerCase().includes(term)));
    $('#works').innerHTML = list.map(workCard).join('');
    $('#no-results').hidden = list.length > 0;
  };
  [q, c, s].forEach(el => el.addEventListener('input', apply));
  apply();
}

function renderWork() {
  const w = S.works.find(x => x.id === param('id'));
  if (!w) {
    $('#main').innerHTML = `<section class="section"><div class="container">
      <p>${t('workNotFound')}</p><p><a href="galerija.html">${t('backToGallery')}</a></p></div></section>`;
    return;
  }
  document.title = w.title + ' — ' + S.settings.siteTitle;
  setMeta('description', String(w.description || '').replace(/\s+/g, ' ').slice(0, 155));
  const rows = [
    [t('code'), w.code],
    [t('dimensions'), w.dimensions],
    [t('technique'), w.technique],
    [t('collectionLabel'), collectionName(w.collection)]
  ].filter(r => r[1]);
  const mail = S.settings.email
    ? `mailto:${esc(S.settings.email)}?subject=${encodeURIComponent(t('inquirySubject') + ': ' + w.title + (w.code ? ' (' + w.code + ')' : ''))}`
    : '';
  $('#main').innerHTML = `<section class="section"><div class="container">
    <p><a class="muted" href="galerija.html">${t('backToGallery')}</a></p>
    <div class="work-detail">
      <div class="work-detail-image"><img src="${esc(workImg(w))}" alt="${esc(w.title)}">${statusBadge(w)}</div>
      <div>
        <h1>${esc(w.title)}</h1>
        <p>${statusBadge(w, true)}</p>
        <dl class="detail-list">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
        ${priceHTML(w) ? `<p class="detail-price">${priceHTML(w)}</p>` : ''}
        ${paragraphs(w.description)}
        ${mail && w.status !== 'prodana' ? `<p style="margin-top:24px"><a class="btn" href="${mail}">${t('inquire')}</a></p>` : ''}
      </div>
    </div>
  </div></section>`;
}

function renderCollections() {
  $('#main').innerHTML = `<section class="section"><div class="container">
    <h1 class="page-head">${t('nav_collections')}</h1>
    <div class="collections-grid">${S.collections.map(c => {
      const works = S.works.filter(w => w.collection === c.id);
      const cover = c.cover || (works[0] && works[0].image) || 'images/bez-fotografije.svg';
      return `<a class="collection-card" href="galerija.html?kolekcija=${encodeURIComponent(c.id)}">
        <img src="${esc(cover)}" alt="${esc(c.name)}" loading="lazy">
        <div class="cc-label"><h3>${esc(c.name)}</h3><p>${works.length} ${t('worksInCollection')}</p></div>
      </a>`;
    }).join('')}</div>
  </div></section>`;
}

function renderNews() {
  const list = S.news.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  $('#main').innerHTML = `<section class="section"><div class="container">
    <h1 class="page-head">${t('nav_news')}</h1>
    ${list.length ? `<div class="news-list">${list.map(n =>
      `<article class="news-item">
        <span class="date">${fmtDate(n.date)}</span>
        <h3><a href="novost.html?id=${encodeURIComponent(n.id)}">${esc(n.title)}</a></h3>
        <p class="muted">${excerpt(n.text, 180)}</p>
        <a class="read-more" href="novost.html?id=${encodeURIComponent(n.id)}">${t('readMore')} →</a>
      </article>`).join('')}</div>` : `<p class="muted">${t('newsEmpty')}</p>`}
  </div></section>`;
}

function renderNewsItem() {
  const n = S.news.find(x => x.id === param('id'));
  if (!n) {
    $('#main').innerHTML = `<section class="section"><div class="container">
      <p>${t('newsNotFound')}</p><p><a href="novosti.html">${t('backToNews')}</a></p></div></section>`;
    return;
  }
  document.title = n.title + ' — ' + S.settings.siteTitle;
  setMeta('description', String(n.text || '').replace(/\s+/g, ' ').slice(0, 155));
  $('#main').innerHTML = `<section class="section"><div class="container" style="max-width:760px">
    <p><a class="muted" href="novosti.html">${t('backToNews')}</a></p>
    <span class="date muted">${fmtDate(n.date)}</span>
    <h1>${esc(n.title)}</h1>
    ${n.image ? `<img src="${esc(n.image)}" alt="" style="border-radius:var(--radius);margin:12px 0 20px">` : ''}
    ${paragraphs(n.text)}
  </div></section>`;
}

function renderAbout() {
  const st = S.settings;
  $('#main').innerHTML = `<section class="section"><div class="container">
    <h1 class="page-head">${t('nav_about')}</h1>
    <div class="about-grid">
      ${st.aboutImage ? `<img src="${esc(st.aboutImage)}" alt="${esc(st.siteTitle)}">` : ''}
      <div>${paragraphs(st.aboutText)}</div>
    </div>
  </div></section>`;
}

function renderContact() {
  const st = S.settings;
  $('#main').innerHTML = `<section class="section"><div class="container">
    <h1 class="page-head">${t('nav_contact')}</h1>
    <p class="lead">${t('contactLead')}</p>
    <div class="contact-grid">
      <div class="contact-info">
        ${st.email ? `<p><strong>${t('emailLabel')}:</strong> <a href="mailto:${esc(st.email)}">${esc(st.email)}</a></p>` : ''}
        ${st.phone ? `<p><strong>${t('phoneLabel')}:</strong> ${esc(st.phone)}</p>` : ''}
        ${st.instagram ? `<p><strong>Instagram:</strong> <a href="${esc(st.instagram)}" target="_blank" rel="noopener">${esc(st.instagram.replace(/^https?:\/\/(www\.)?/, ''))}</a></p>` : ''}
        ${st.facebook ? `<p><strong>Facebook:</strong> <a href="${esc(st.facebook)}" target="_blank" rel="noopener">${esc(st.facebook.replace(/^https?:\/\/(www\.)?/, ''))}</a></p>` : ''}
      </div>
      ${st.email ? `<form class="contact-form" id="contact-form">
        <input name="name" placeholder="${t('formName')}" required>
        <input name="email" type="email" placeholder="${t('formEmail')}">
        <textarea name="message" placeholder="${t('formMessage')}" required></textarea>
        <button class="btn" type="submit">${t('formSend')}</button>
      </form>` : ''}
    </div>
  </div></section>`;
  const f = $('#contact-form');
  if (f) f.addEventListener('submit', e => {
    e.preventDefault();
    const d = new FormData(f);
    const body = d.get('message') + '\n\n' + d.get('name') + (d.get('email') ? '\n' + d.get('email') : '');
    location.href = 'mailto:' + st.email +
      '?subject=' + encodeURIComponent(t('contactSubject')) +
      '&body=' + encodeURIComponent(body);
  });
}

/* ===== Inicijalizacija ===== */

(async function init() {
  try {
    const [settings, works, collections, news] = await Promise.all([
      loadJSON('data/settings.json'),
      loadJSON('data/works.json'),
      loadJSON('data/collections.json'),
      loadJSON('data/news.json')
    ]);
    S.settings = settings; S.works = works; S.collections = collections; S.news = news;
  } catch (e) {
    $('#main').innerHTML = '<section class="section"><div class="container"><p>Greška pri učitavanju sadržaja (' + esc(e.message) + ').</p></div></section>';
    return;
  }
  S.t = (typeof I18N !== 'undefined' && I18N[S.settings.language]) || I18N.hr;

  const link = document.getElementById('theme-css');
  if (link && S.settings.theme) {
    link.href = 'css/theme-' + S.settings.theme + '.css';
    try { localStorage.setItem('sv-theme', S.settings.theme); } catch (e) { }
  }

  S.works.sort((a, b) => String(b.created || '').localeCompare(String(a.created || '')));

  renderHeader();
  renderFooter();
  ({
    home: renderHome,
    gallery: renderGallery,
    collections: renderCollections,
    work: renderWork,
    news: renderNews,
    newsItem: renderNewsItem,
    about: renderAbout,
    contact: renderContact
  }[document.body.dataset.page] || function () { })();
})();
