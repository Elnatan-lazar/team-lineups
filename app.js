'use strict';

/* =========================================================
   Team lineups — rounds, games, lineups, subs, stats.
   A round (מחזור) has one attendance list and several games;
   each game has one lineup (+ subs), a result and player stats.
   All data is kept in this browser (localStorage) with
   export / import of a JSON backup file.
   ========================================================= */

const STORE_KEY = 'team-lineups-v1';
const ROLE_LABEL = { GK: 'שוער', DF: 'הגנה', MF: 'קישור', FW: 'התקפה' };
const ROLE_ICON = { GK: '🧤', DF: '🛡️', MF: '⚙️', FW: '🎯' };
const ROLE_ORDER = ['GK', 'DF', 'MF', 'FW'];

// 7-a-side formations. Slot 0 is always the goalkeeper. Positions are % of pitch width / height (own goal at the bottom).
const FORMATIONS = {
  '3-2-1': { roles: ['GK', 'DF', 'DF', 'DF', 'MF', 'MF', 'FW'], pos: [[50, 89], [17, 68], [50, 72], [83, 68], [30, 48], [70, 48], [50, 26]] },
  '2-3-1': { roles: ['GK', 'DF', 'DF', 'MF', 'MF', 'MF', 'FW'], pos: [[50, 89], [30, 70], [70, 70], [15, 47], [50, 50], [85, 47], [50, 26]] },
  '3-1-2': { roles: ['GK', 'DF', 'DF', 'DF', 'MF', 'FW', 'FW'], pos: [[50, 89], [17, 70], [50, 73], [83, 70], [50, 51], [30, 29], [70, 29]] },
  '2-2-2': { roles: ['GK', 'DF', 'DF', 'MF', 'MF', 'FW', 'FW'], pos: [[50, 89], [30, 71], [70, 71], [30, 50], [70, 50], [30, 28], [70, 28]] },
};
const STAT_KEYS = [['g', 'גולים', '⚽'], ['a', 'בישולים', '🅰️'], ['y', 'צהובים', '🟨'], ['r', 'אדומים', '🟥']];

/* ---------------- seed data ---------------- */
function seed() {
  // [full name, short name shown on the shirt, number, foreign, fixed goalkeeper]
  const raw = [
    ['איתן טורצקי', 'איתן', '18'], ['הראל ולמן', 'הראל', '2'], ['בן מוחה', 'בן', '3', 1],
    ['אמיל חודדטוב', 'אמיל', '4'], ['דידיה חטב', 'דידיה', '5'], ['אלישע ליפין', 'אלישע', '6'],
    ['זכריה זכרוב', 'זכריה', '7'], ['שגיא לוין', 'שגיא', '8'], ['אהרון רטנר', 'אהרון', '9'],
    ['אלנתן לזר', 'אלנתן', '10'], ['יותם אברהמי', 'יותם', '11'], ['אילן יאיר לוי', 'אילן', '12'],
    ['יאיר משה', 'יאיר משה', '13'], ['סובאלו אמבאו', 'סובאלו', '17'], ['עמית לוי', 'עמית', '20'],
    ['אושרי פינטו', 'פינטו', '21'], ['שקד שמש', 'שקד', '23'], ['גד בן חיים', 'גד', '31'],
    ['יאיר בן מנחם', 'בן מנחם', '41'], ['צביקה דב', 'צביקה', '14'], ['עדן חדד', 'עדן', '15', 0, 1],
    ['יובל אזוגי', 'אזוגי', '30'], ['בניה צוקרמן', 'בניה', '92'], ['מאור', 'מאור', '77'],
  ];
  const players = raw.map((r, i) => ({ id: 'p' + (i + 1), name: r[0], short: r[1], num: r[2], foreign: !!r[3], gk: !!r[4] }));
  const G = (id, num, slots) => ({ id, num, opponent: '', lineup: { formation: '3-2-1', slots, subs: [] }, result: { us: '', them: '' }, stats: {}, mvp: null });
  const coming = ['p10', 'p23', 'p16', 'p7', 'p6', 'p1', 'p11', 'p24', 'p14', 'p9', 'p5', 'p22', 'p15', 'p18', 'p8', 'p20', 'p21', 'p12'];
  return {
    version: 3,
    team: { name: 'גדוד 9218' },
    players,
    rounds: [{
      id: 'r1', num: 1, date: '',
      rsvp: Object.fromEntries(coming.map(id => [id, true])),
      games: [
        G('g1', 1, ['p21', 'p18', 'p12', 'p16', 'p11', 'p24', 'p22']),
        G('g2', 2, ['p21', 'p23', null, 'p8', 'p11', 'p7', 'p22']),
        G('g3', 3, ['p21', 'p6', 'p15', 'p10', 'p14', 'p1', 'p9']),
      ],
    }],
  };
}

/* ---------------- state + storage ---------------- */
let db = load();
let editing = null;
const ui = { attOpen: {}, statsTab: {}, statsSort: { k: 'starts', dir: -1 } };

function valid(d) { return d && Array.isArray(d.players) && (Array.isArray(d.rounds) || Array.isArray(d.games)); }
function fixLineup(l) {
  l = l || {};
  return { formation: FORMATIONS[l.formation] ? l.formation : '3-2-1', slots: (l.slots || []).concat(Array(7).fill(null)).slice(0, 7), subs: l.subs || [] };
}
function normalize(d) {
  // v1 → v2: a "game" with several lineups becomes a round whose games each hold one lineup
  if (!Array.isArray(d.rounds) && Array.isArray(d.games)) {
    d.rounds = d.games.map(og => ({
      id: og.id, name: og.opponent ? 'נגד ' + og.opponent : 'מחזור', date: og.date || '', attending: og.attending || [],
      games: (og.lineups || []).map((l, i) => ({
        id: l.id, name: l.name, opponent: og.opponent || '', lineup: fixLineup(l),
        result: i === 0 ? (og.result || { us: '', them: '' }) : { us: '', them: '' }, stats: i === 0 ? (og.stats || {}) : {}, mvp: i === 0 ? (og.mvp || null) : null,
      })),
    }));
    delete d.games;
  }
  d.version = 3;
  d.team = d.team || { name: 'הקבוצה שלי' };
  d.players.forEach(p => { p.num = p.num == null ? '' : String(p.num); p.short = p.short || p.name; });
  const numFrom = (txt, fallback) => { const m = String(txt || '').match(/\d+/); return m ? +m[0] : fallback; };
  d.rounds.forEach((r, ri) => {
    if (r.num == null) r.num = numFrom(r.name, ri + 1);
    if (!r.rsvp) r.rsvp = Object.fromEntries((r.attending || []).map(id => [id, true]));
    delete r.attending; delete r.name;
    r.games = r.games || [];
    r.games.forEach((g, gi) => {
      if (g.num == null) g.num = numFrom(g.name, gi + 1);
      delete g.name;
      g.lineup = fixLineup(g.lineup); g.result = g.result || { us: '', them: '' }; g.stats = g.stats || {}; g.mvp = g.mvp || null; g.opponent = g.opponent || '';
    });
    sortGames(r);
  });
  return d;
}
function load() {
  try { const s = localStorage.getItem(STORE_KEY); if (s) { const d = JSON.parse(s); if (valid(d)) return normalize(d); } } catch (e) { /* fall through */ }
  return seed();
}
let saveTimer;
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(persistNow, 200); }
function persistNow() {
  saveTimer = null;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); if (!cloud.on) setStatus('✓ נשמר במחשב'); }
  catch (e) { if (!cloud.on) { setStatus('⚠ השמירה נכשלה'); toast('השמירה נכשלה – כדאי לייצא גיבוי'); } }
  if (cloud.on) cloudPush();
}
window.addEventListener('beforeunload', () => { if (saveTimer) { clearTimeout(saveTimer); persistNow(); } });

/* ---------------- helpers ---------------- */
const $ = s => document.querySelector(s);
const clone = o => JSON.parse(JSON.stringify(o));
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const byId = id => db.players.find(p => p.id === id);
const roundById = id => db.rounds.find(r => r.id === id);
const nm = id => { const p = byId(id); return p ? (p.short || p.name) : '?'; };
const nmNum = id => { const p = byId(id); return p ? (p.short || p.name) + (p.num ? ` (${p.num})` : '') : '?'; };
const names = ids => ids.map(nm).join(', ');
const roster = () => db.players;

function el(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'value') e.value = v;
    else if (typeof v === 'boolean' && k in e) e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(2)) { if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(String(c))); }
  return e;
}
function fmtDate(d) { if (!d) return 'ללא תאריך'; const [y, m, dd] = d.split('-'); return `${+dd}/${+m}/${y}`; }
function gameName(g) { return 'משחק ' + g.num; }
function gameLabel(g) { return gameName(g) + (g.opponent.trim() ? ' נגד ' + g.opponent.trim() : ''); }
function roundTitle(r) { return 'מחזור ' + r.num; }
function sortGames(r) { r.games.sort((a, b) => (a.num - b.num) || 0); }
function nextNum(list) { return list.reduce((m, x) => Math.max(m, +x.num || 0), 0) + 1; }
function sortedRounds() { return db.rounds.slice().sort((a, b) => (b.num - a.num) || (b.date || '').localeCompare(a.date || '')); }
// attendance: true = coming, false = not coming, undefined = no answer
function rsvpOf(r) { return Object.assign({}, r.rsvp || {}, cloud.on ? (cloud.rsvp[r.id] || {}) : {}); }
function att(r) { const m = rsvpOf(r); return roster().map(p => p.id).filter(id => m[id] === true); }
async function setRsvp(r, ids, val) {
  if (cloud.on && cloud.ref) {
    const map = cloud.rsvp[r.id] = cloud.rsvp[r.id] || {};
    ids.forEach(id => { map[id] = val; });
    render();
    try {
      const batch = firebase.firestore().batch();
      ids.forEach(id => batch.set(cloud.ref.collection('rsvp').doc(r.id + '_' + id), { round: r.id, player: id, coming: val, at: firebase.firestore.FieldValue.serverTimestamp() }));
      await batch.commit();
      setStatus('☁ נשמר');
    } catch (e) { toast('הסימון לא נשמר – נסה שוב'); }
  } else {
    r.rsvp = r.rsvp || {}; ids.forEach(id => { r.rsvp[id] = val; }); save(); render();
  }
}
function resultOf(g) {
  const u = parseInt(g.result && g.result.us, 10), t = parseInt(g.result && g.result.them, 10);
  if (isNaN(u) || isNaN(t)) return null;
  return { u, t, r: u > t ? 'W' : u < t ? 'L' : 'D' };
}
// RTL reading: our score on the right, theirs on the left
function resultBadge(g) { const r = resultOf(g); return r ? el('span', { class: 'res ' + r.r, title: 'אנחנו : יריב' }, `${r.t} : ${r.u}`) : null; }
function numBadge(p) { return el('span', { class: 'num' }, p.num || '–'); }

let statusT;
function idleStatus() { return cloud.on ? (cloud.ready ? '☁ מחובר לענן' : '☁ מתחבר…') : 'נשמר במחשב הזה'; }
function setStatus(t, sticky) { const s = $('#status'); s.textContent = t; clearTimeout(statusT); if (!sticky) statusT = setTimeout(() => { s.textContent = idleStatus(); }, 2500); }
let toastT;
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }

function confirmBtn(label, action, cls = 'danger') {
  const b = el('button', { class: cls, type: 'button' }, label);
  let armed = false, t;
  b.addEventListener('click', () => {
    if (armed) { clearTimeout(t); action(); return; }
    armed = true; b.textContent = 'בטוח? לחץ שוב'; b.classList.add('armed');
    t = setTimeout(() => { armed = false; b.textContent = label; b.classList.remove('armed'); }, 3500);
  });
  return b;
}

/* ---------------- modal ---------------- */
function openModal(...kids) { const box = $('#modalBox'); box.innerHTML = ''; box.append(...kids.flat().filter(Boolean)); $('#modal').hidden = false; }
function closeModal() { $('#modal').hidden = true; $('#modalBox').innerHTML = ''; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('הועתק – אפשר להדביק בווטסאפ'); }
  catch (e) {
    const ta = el('textarea', { readonly: true }); ta.value = text;
    openModal(el('div', {}, 'סמן והעתק מכאן:'), ta, el('div', { class: 'row' }, el('button', { onclick: closeModal }, 'סגור')));
    ta.select();
  }
}
function waLink(text) { return 'https://wa.me/?text=' + encodeURIComponent(text); }

/* ---------------- usage + warnings ---------------- */
// starts (s) and bench appearances (b) per player across a set of games
function usageOf(games) {
  const u = {};
  const bump = (id, k) => { if (!id || !byId(id)) return; (u[id] = u[id] || { s: 0, b: 0 })[k]++; };
  games.forEach(g => { g.lineup.slots.forEach(id => bump(id, 's')); g.lineup.subs.forEach(id => bump(id, 'b')); });
  return u;
}
function roundWarnings(r) {
  const w = [];
  if (!r.games.length) return w;
  const u = usageOf(r.games);
  const coming = att(r);
  const notIn = coming.filter(id => !u[id]);
  const subsOnly = coming.filter(id => u[id] && !u[id].s);
  if (notIn.length) w.push({ lvl: 'bad', text: `לא שובצו באף משחק, לא בהרכב ולא בחילופים (${notIn.length}): ${names(notIn)}` });
  if (subsOnly.length) w.push({ lvl: 'warn', text: `לא פתחו באף משחק, רק בחילופים (${subsOnly.length}): ${names(subsOnly)}` });
  const notAtt = Object.keys(u).filter(id => !coming.includes(id));
  if (notAtt.length) w.push({ lvl: 'warn', text: `משובצים אבל לא מסומנים כמגיעים: ${names(notAtt)}` });
  r.games.forEach(g => { const n = g.lineup.slots.filter(id => id && byId(id)).length; if (n < 7) w.push({ lvl: 'warn', text: `${gameLabel(g)}: חסרים ${7 - n} שחקנים על המגרש` }); });
  return w;
}

/* ---------------- WhatsApp text ---------------- */
function roundHeader(r) { return `⚽ *${db.team.name}* | ${roundTitle(r)}` + (r.date ? ` | ${fmtDate(r.date)}` : ''); }
function gameText(r, g, withHeader) {
  const l = g.lineup, f = FORMATIONS[l.formation], lines = [];
  if (withHeader) lines.push(roundHeader(r), '');
  lines.push(`*${gameLabel(g)}* (${l.formation})`);
  ROLE_ORDER.forEach(role => {
    const ids = f.roles.map((x, i) => x === role ? l.slots[i] : undefined).filter(x => x !== undefined);
    if (ids.length) lines.push(`${ROLE_ICON[role]} ${ROLE_LABEL[role]}: ` + ids.map(id => id && byId(id) ? nmNum(id) : '—').join(', '));
  });
  const subs = l.subs.filter(byId);
  lines.push('🔄 חילופים: ' + (subs.length ? subs.map(nmNum).join(', ') : '—'));
  return lines.join('\n');
}
function roundText(r) { return [roundHeader(r), ...r.games.map(g => '\n' + gameText(r, g, false))].join('\n'); }

/* ---------------- pitch ---------------- */
const PITCH_SVG = (() => {
  let s = '<svg class="lines" viewBox="0 0 100 130" preserveAspectRatio="none" aria-hidden="true">';
  for (let i = 0; i < 10; i++) s += `<rect x="0" y="${i * 13}" width="100" height="13" fill="${i % 2 ? '#2a6e2a' : '#2f7a2f'}"/>`;
  s += '<g fill="none" stroke="rgba(255,255,255,.85)" stroke-width=".5">' +
    '<rect x="4" y="4" width="92" height="122"/><line x1="4" y1="65" x2="96" y2="65"/><circle cx="50" cy="65" r="11"/>' +
    '<rect x="24" y="4" width="52" height="18"/><rect x="37" y="4" width="26" height="7"/><path d="M40 22 A11 11 0 0 0 60 22"/>' +
    '<rect x="24" y="108" width="52" height="18"/><rect x="37" y="119" width="26" height="7"/><path d="M40 108 A11 11 0 0 1 60 108"/>' +
    '</g><circle cx="50" cy="65" r=".9" fill="#fff"/></svg>';
  return s;
})();
const SHIRT_BODY = 'M13 2 L3 8 L7 17 L12 14 L12 34 L28 34 L28 14 L33 17 L37 8 L27 2 Q20 7 13 2Z';
const SHIRT_SLEEVES = 'M13 2 L3 8 L7 17 L12 14Z M27 2 L37 8 L33 17 L28 14Z';
function shirtSVG(num) {
  return `<svg class="shirt" viewBox="0 0 40 36" aria-hidden="true"><path d="${SHIRT_BODY}" fill="#8bd12a" stroke="#0e2a0e" stroke-width="1.2"/>` +
    `<path d="${SHIRT_SLEEVES}" fill="#161616" stroke="#0e2a0e" stroke-width="1"/>` +
    `<text x="20" y="27" text-anchor="middle" font-size="12" font-weight="700" fill="#0e2a0e" font-family="Rubik,sans-serif">${esc(num || '')}</text></svg>`;
}
function pitchEl(l, opts = {}) {
  const f = FORMATIONS[l.formation] || FORMATIONS['3-2-1'];
  const d = el('div', { class: 'pitch' + (opts.mini ? ' mini' : ''), html: PITCH_SVG });
  f.pos.forEach(([x, y], i) => {
    const p = byId(l.slots[i]);
    const role = ROLE_LABEL[f.roles[i]];
    const s = el(opts.onSlot ? 'button' : 'div', {
      class: 'slot' + (opts.sel === i ? ' sel' : ''), style: `left:${x}%;top:${y}%`,
      type: opts.onSlot ? 'button' : null, 'aria-label': role + ': ' + (p ? p.name : 'ריק'),
      onclick: opts.onSlot ? () => opts.onSlot(i) : null,
    });
    s.innerHTML = p ? shirtSVG(p.num) + `<span class="nm">${esc(p.short || p.name)}</span>`
      : `<span class="empty">+</span><span class="nm dim">${role}</span>`;
    d.append(s);
  });
  return d;
}


/* =========================================================
   Cloud sync (Firebase Firestore) — optional.
   Enabled when config.js sets window.FIREBASE_CONFIG.
   The whole team data is one document: teams/{TEAM_DOC}.
   Anyone with the link can view; signed-in editors can write
   (enforced by Firestore security rules, see README).
   ========================================================= */
const cloud = { on: false, ready: false, missing: false, user: null, denied: false, ref: null, lastJson: null, rsvp: {} };
function canEdit() { return !cloud.on || (!!cloud.user && cloud.ready && !cloud.denied); }
function applyMode() {
  document.body.classList.toggle('readonly', !canEdit());
  if (!canEdit() && editing) closeEditor();
}
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.append(s); });
}
async function initCloud() {
  const cfg = window.FIREBASE_CONFIG;
  if (!cfg || !cfg.apiKey) return;
  cloud.on = true; applyMode(); setStatus(idleStatus(), true); render();
  try {
    const v = '10.12.2';
    for (const m of ['app', 'auth', 'firestore']) await loadScript(`https://www.gstatic.com/firebasejs/${v}/firebase-${m}-compat.js`);
    firebase.initializeApp(cfg);
  } catch (e) {
    cloud.on = false; applyMode(); render();
    setStatus('⚠ אין חיבור לענן, עובד מקומית', true); toast('לא הצלחתי להתחבר לענן – עובד מקומית');
    return;
  }
  cloud.ref = firebase.firestore().collection('teams').doc(window.TEAM_DOC || 'team');
  firebase.auth().onAuthStateChanged(u => {
    cloud.user = u; cloud.denied = false; applyMode(); render();
    if (u && cloud.ready && cloud.missing) cloudPush(); // first upload of the local data
  });
  cloud.ref.onSnapshot(snap => {
    if (snap.metadata.hasPendingWrites) return;
    const first = !cloud.ready;
    cloud.ready = true;
    if (!snap.exists) { cloud.missing = true; if (cloud.user) cloudPush(); if (first) { applyMode(); render(); setStatus(idleStatus(), true); } return; }
    cloud.missing = false;
    const json = snap.data().data;
    if (json === cloud.lastJson) { if (first) { applyMode(); render(); } return; }
    try {
      const d = JSON.parse(json);
      if (!valid(d)) return;
      db = normalize(d); cloud.lastJson = json;
      try { localStorage.setItem(STORE_KEY, json); } catch (e) { /* cache only */ }
      applyMode(); render(); if (editing) renderEditor();
      setStatus(first ? '☁ מחובר לענן' : '☁ עודכן מהענן');
    } catch (e) { /* ignore malformed */ }
  }, err => { setStatus('⚠ שגיאת חיבור לענן', true); console.warn(err); });
  // attendance marks live in their own documents so players can write them without signing in
  cloud.ref.collection('rsvp').onSnapshot(qs => {
    const map = {};
    qs.forEach(d => { const x = d.data(); if (x && x.round && x.player) (map[x.round] = map[x.round] || {})[x.player] = !!x.coming; });
    cloud.rsvp = map;
    render(); if (editing) renderEditor();
  }, err => console.warn(err));
}
let pushT;
function cloudPush() {
  if (!cloud.on || !cloud.ref || !cloud.user || cloud.denied) return;
  clearTimeout(pushT);
  pushT = setTimeout(async () => {
    const json = JSON.stringify(db);
    if (json === cloud.lastJson && !cloud.missing) return;
    cloud.lastJson = json;
    setStatus('☁ שומר…', true);
    try {
      await cloud.ref.set({ data: json, updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: cloud.user.displayName || cloud.user.email || '' });
      cloud.missing = false;
      setStatus('☁ נשמר בענן');
    } catch (e) {
      setStatus('⚠ לא נשמר בענן', true);
      if (e && e.code === 'permission-denied') { cloud.denied = true; applyMode(); render(); toast('לחשבון הזה אין הרשאת עריכה'); }
      else toast('השמירה בענן נכשלה – נסה שוב');
    }
  }, 500);
}
async function signIn() {
  const provider = new firebase.auth.GoogleAuthProvider();
  try { await firebase.auth().signInWithPopup(provider); }
  catch (e) {
    if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) firebase.auth().signInWithRedirect(provider);
    else if (e && e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') toast('ההתחברות נכשלה');
  }
}
function renderAuth() {
  const box = $('#auth'); box.innerHTML = '';
  if (!cloud.on || typeof firebase === 'undefined') return;
  if (cloud.user) {
    box.append(el('span', { class: 'who', title: cloud.user.email || '' }, '👤 ' + ((cloud.user.displayName || cloud.user.email || '').split(' ')[0])),
      el('button', { class: 'small ghost', onclick: () => firebase.auth().signOut() }, 'התנתק'));
  } else box.append(el('button', { class: 'small light', onclick: signIn }, 'כניסת מנהל'));
}

/* =========================================================
   Views
   ========================================================= */
function render() {
  const h = location.hash.slice(1) || 'rounds';
  $('#teamName').textContent = db.team.name;
  document.title = 'הרכבים · ' + db.team.name;
  document.querySelectorAll('.topbar nav a').forEach(a => a.classList.toggle('active', a.dataset.v === h || (h.startsWith('round-') && a.dataset.v === 'rounds')));
  const main = $('#view');
  main.innerHTML = '';
  renderAuth();
  if (cloud.on && !canEdit()) main.append(el('div', { class: 'ro-banner' }, cloud.denied ? '👀 מצב צפייה: לחשבון הזה אין הרשאת עריכה' : cloud.ready ? '👀 מצב צפייה: אפשר לראות הרכבים וסטטיסטיקה ולסמן הגעה למחזור' : '☁ טוען נתונים מהענן…'));
  if (h.startsWith('round-')) { const r = roundById(h.slice(6)); if (r) return renderRound(main, r); location.hash = 'rounds'; return; }
  if (h === 'stats') return renderStats(main);
  if (h === 'squad') return renderSquad(main);
  renderRounds(main);
}
window.addEventListener('hashchange', () => { if (editing) closeEditor(); closeModal(); render(); window.scrollTo(0, 0); });

/* ---------------- rounds list ---------------- */
function newRound() {
  const r = { id: uid('r'), num: nextNum(db.rounds), date: new Date().toISOString().slice(0, 10), rsvp: {}, games: [] };
  db.rounds.push(r); ui.attOpen[r.id] = true; save();
  location.hash = 'round-' + r.id;
}
function roundRecord(r) {
  const res = r.games.map(resultOf).filter(Boolean);
  if (!res.length) return null;
  const c = k => res.filter(x => x.r === k).length;
  return `${c('W')} נצ׳ · ${c('D')} תיקו · ${c('L')} הפ׳`;
}
function renderRounds(main) {
  main.append(el('div', { class: 'page-head' }, el('h2', {}, 'מחזורים'), el('button', { class: 'primary w', onclick: newRound }, '+ מחזור חדש')));
  if (!db.rounds.length) { main.append(el('div', { class: 'empty' }, 'עוד אין מחזורים. לחץ על "מחזור חדש" כדי להתחיל.')); return; }
  main.append(el('div', { class: 'game-list' }, sortedRounds().map(r => {
    const w = roundWarnings(r), rec = roundRecord(r);
    return el('a', { class: 'game-card', href: '#round-' + r.id },
      el('div', { class: 'gc-top' }, el('span', { class: 'gc-title' }, roundTitle(r)), rec ? el('span', { class: 'muted small' }, rec) : null),
      el('div', { class: 'gc-meta' }, `${fmtDate(r.date)} · ${r.games.length} משחקים · ${att(r).length} מגיעים`),
      r.games.length ? el('div', { class: 'gc-games' }, r.games.map(g => el('span', { class: 'gc-game' }, gameLabel(g), resultBadge(g)))) : null,
      w.length ? el('div', { class: 'gc-warn' }, `⚠ ${w.length} אזהרות`) : null);
  })));
}

/* ---------------- round page ---------------- */
function renderRound(main, r) {
  main.append(el('a', { class: 'back', href: '#rounds' }, '→ כל המחזורים'));

  // details + share
  main.append(el('section', { class: 'card' },
    el('div', { class: 'game-fields' },
      el('label', { class: 'field' }, 'מספר מחזור', el('input', { type: 'number', min: '1', inputmode: 'numeric', value: String(r.num), oninput: e => { const v = parseInt(e.target.value, 10); if (v > 0) { r.num = v; save(); } } })),
      el('label', { class: 'field' }, 'תאריך', el('input', { type: 'date', value: r.date || '', onchange: e => { r.date = e.target.value; save(); } }))),
    el('div', { class: 'row' },
      el('button', { onclick: () => copyText(roundText(r)), disabled: !r.games.length }, '📋 העתק את כל המשחקים'),
      el('a', { class: 'btn', href: '#', target: '_blank', rel: 'noopener', onclick: e => { if (!r.games.length) { e.preventDefault(); return; } e.currentTarget.href = waLink(roundText(r)); } }, '💬 שלח בווטסאפ'),
      el('button', { onclick: () => showImage(r, r.games), disabled: !r.games.length }, '📷 תמונה של כל ההרכבים'),
      el('div', { class: 'spacer' }),
      confirmBtn('מחק מחזור', () => { db.rounds = db.rounds.filter(x => x !== r); save(); location.hash = 'rounds'; }, 'small danger w'))));

  // attendance for the whole round
  main.append(canEdit() ? attendanceAdmin(r) : rsvpPanel(r));

  // games side by side
  const sec = el('section', { class: 'card' },
    el('div', { class: 'sec-head' }, el('h3', {}, `משחקים במחזור (${r.games.length})`), el('button', { class: 'primary small w', onclick: () => openEditor(r, null) }, '+ משחק חדש')));
  const warns = roundWarnings(r);
  if (r.games.length) {
    if (warns.length) warns.forEach(w => sec.append(el('div', { class: 'alert ' + w.lvl }, '⚠ ' + w.text)));
    else sec.append(el('div', { class: 'alert ok' }, '✓ כל המגיעים פתחו לפחות במשחק אחד'));
  }
  sec.append(el('div', { class: 'lineup-grid' }, r.games.map((g, i) => gameCard(r, g, i)),
    el('button', { class: 'add-card w', onclick: () => openEditor(r, null) }, '+ משחק חדש')));
  main.append(sec);

  if (r.games.length) main.append(statsSection(r));
}

const ME_KEY = 'team-lineups-me';
function getMe() { try { return localStorage.getItem(ME_KEY) || ''; } catch (e) { return ''; } }
function setMe(id) { try { localStorage.setItem(ME_KEY, id); } catch (e) { /* ignore */ } }
function rsvpCounts(r) {
  const m = rsvpOf(r), ids = roster().map(p => p.id);
  return { yes: ids.filter(id => m[id] === true), no: ids.filter(id => m[id] === false), none: ids.filter(id => m[id] === undefined) };
}
// manager view: tap a player to switch between coming / not coming
function attendanceAdmin(r) {
  const m = rsvpOf(r), c = rsvpCounts(r);
  const open = ui.attOpen[r.id] ?? !r.games.length;
  const det = el('details', { class: 'card att', open },
    el('summary', {}, el('h3', {}, `מי מגיע למחזור · ✓ ${c.yes.length} · ✗ ${c.no.length} · ? ${c.none.length}`),
      el('div', { class: 'row', onclick: e => e.preventDefault() },
        el('button', { class: 'small w', onclick: () => setRsvp(r, c.none, true) }, 'סמן מגיעים את מי שלא ענה'))),
    el('div', { class: 'muted small', style: 'margin-bottom:8px' }, 'השחקנים יכולים לסמן בעצמם מהקישור. לחיצה על שחקן מחליפה בין מגיע ללא מגיע.'),
    el('div', { class: 'chips' }, roster().map(p => el('button', {
      class: 'chip rsvp w-click ' + (m[p.id] === true ? 'yes' : m[p.id] === false ? 'no' : 'none'), type: 'button',
      onclick: () => setRsvp(r, [p.id], m[p.id] !== true),
    }, el('span', { class: 'mark' }, m[p.id] === true ? '✓' : m[p.id] === false ? '✗' : '?'), numBadge(p), p.short || p.name))));
  det.addEventListener('toggle', () => { ui.attOpen[r.id] = det.open; });
  return det;
}
// player view: pick your name once, then mark coming / not coming
function rsvpPanel(r) {
  const me = getMe(), m = rsvpOf(r), c = rsvpCounts(r);
  const sel = el('select', { class: 'ro-ok', 'aria-label': 'השם שלי', onchange: e => { setMe(e.target.value); render(); } },
    el('option', { value: '' }, 'בחר את השם שלך…'),
    roster().map(p => el('option', { value: p.id, selected: p.id === me }, p.name + (p.num ? ' · ' + p.num : ''))));
  const mine = m[me];
  return el('section', { class: 'card rsvp-panel' },
    el('h3', { style: 'margin-bottom:10px' }, `מגיע ל${roundTitle(r)}?` + (r.date ? ' · ' + fmtDate(r.date) : '')),
    el('div', { class: 'row' }, sel),
    me ? el('div', { class: 'rsvp-btns' },
      el('button', { class: 'big yes' + (mine === true ? ' on' : ''), onclick: () => setRsvp(r, [me], true) }, '✓ מגיע'),
      el('button', { class: 'big no' + (mine === false ? ' on' : ''), onclick: () => setRsvp(r, [me], false) }, '✗ לא מגיע')) : null,
    me ? el('div', { class: 'muted small' }, mine === true ? 'סימנת שאתה מגיע 👍' : mine === false ? 'סימנת שאתה לא מגיע' : 'עוד לא סימנת') : null,
    el('div', { class: 'rsvp-lists' },
      el('div', {}, el('b', {}, `✓ מגיעים (${c.yes.length}): `), names(c.yes) || '—'),
      el('div', {}, el('b', {}, `✗ לא מגיעים (${c.no.length}): `), names(c.no) || '—'),
      el('div', { class: 'muted' }, `? עוד לא ענו (${c.none.length}): `, names(c.none) || '—')));
}
function dupGame(r, g) {
  const c = clone(g); c.id = uid('g'); c.num = nextNum(r.games); c.result = { us: '', them: '' }; c.stats = {}; c.mvp = null;
  r.games.push(c); sortGames(r); save(); render(); toast('המשחק שוכפל עם אותו הרכב');
}
function gameCard(r, g, i) {
  const subs = g.lineup.subs.filter(byId);
  const pitch = pitchEl(g.lineup, { mini: true });
  pitch.classList.add('clickable'); pitch.title = 'לחץ לעריכה'; pitch.addEventListener('click', () => openEditor(r, g));
  return el('div', { class: 'lcard' },
    el('div', { class: 'lc-head' },
      el('div', {}, el('b', {}, gameName(g)), g.opponent.trim() ? el('span', { class: 'muted small' }, ' נגד ' + g.opponent.trim()) : null, ' ', resultBadge(g)),
      el('span', { class: 'muted small' }, g.lineup.formation)),
    pitch,
    el('div', { class: 'subs-line' }, el('span', { class: 'muted' }, '🔄 חילופים: '), subs.length ? subs.map(nm).join(' · ') : el('span', { class: 'muted' }, 'אין')),
    el('div', { class: 'lc-actions' },
      el('button', { class: 'small primary w', onclick: () => openEditor(r, g) }, 'ערוך'),
      el('button', { class: 'small w', onclick: () => dupGame(r, g) }, 'שכפל'),
      el('button', { class: 'small', title: 'העתק לווטסאפ', onclick: () => copyText(gameText(r, g, true)) }, '📋'),
      el('button', { class: 'small', title: 'תמונה', onclick: () => showImage(r, [g]) }, '📷'),
      confirmBtn('מחק', () => { r.games = r.games.filter(x => x !== g); save(); render(); }, 'small danger w')));
}

// result + player stats, one tab per game
function statsSection(r) {
  let tab = ui.statsTab[r.id];
  if (!r.games.find(g => g.id === tab)) tab = ui.statsTab[r.id] = r.games[0].id;
  const g = r.games.find(x => x.id === tab);
  const u = usageOf([g]);
  const ids = roster().map(p => p.id).filter(id => u[id]);
  const sumEl = el('span', { class: 'muted small' });
  const updSum = () => {
    const s = ids.reduce((a, id) => a + (+((g.stats[id] || {}).g) || 0), 0), res = resultOf(g);
    sumEl.textContent = `סה״כ גולים בטבלה: ${s}` + (res && res.u !== s ? ` (בתוצאה רשום ${res.u})` : '');
  };
  const scoreIn = k => el('input', { type: 'number', min: '0', inputmode: 'numeric', value: g.result[k] ?? '', 'aria-label': k === 'us' ? 'שערים שלנו' : 'שערי היריב', oninput: e => { g.result[k] = e.target.value; save(); updSum(); }, onchange: () => render() });

  const tbody = el('tbody');
  ids.forEach(id => {
    const p = byId(id), st = g.stats[id] || {};
    tbody.append(el('tr', {},
      el('td', { class: 'name' }, p.short || p.name, p.num ? el('span', { class: 'muted small' }, ' #' + p.num) : null),
      el('td', {}, u[id].s ? 'פתח' : 'חילוף'),
      STAT_KEYS.map(([k]) => el('td', {}, el('input', {
        type: 'number', min: '0', inputmode: 'numeric', value: st[k] ? String(st[k]) : '', placeholder: '0', 'aria-label': k,
        oninput: e => { const v = Math.max(0, parseInt(e.target.value, 10) || 0); g.stats[id] = Object.assign(g.stats[id] || {}, { [k]: v }); save(); if (k === 'g') updSum(); },
      }))),
      el('td', {}, el('input', { type: 'radio', name: 'mvp-' + g.id, checked: g.mvp === id, 'aria-label': 'מצטיין', onchange: () => { g.mvp = id; save(); } }))));
  });
  updSum();
  return el('section', { class: 'card' },
    el('div', { class: 'sec-head' }, el('h3', {}, 'אחרי המשחק: תוצאה וסטטיסטיקה'), sumEl),
    el('div', { class: 'tabs' }, r.games.map(x => el('button', { class: 'tab' + (x.id === tab ? ' on' : ''), onclick: () => { ui.statsTab[r.id] = x.id; render(); } }, gameName(x), resultBadge(x)))),
    el('div', { class: 'score' }, el('b', {}, db.team.name), scoreIn('us'), el('b', {}, ':'), scoreIn('them'), el('b', {}, g.opponent.trim() || 'יריב')),
    ids.length ? el('div', { class: 'table-wrap' }, el('table', {},
      el('thead', {}, el('tr', {}, el('th', { class: 'name' }, 'שחקן'), el('th', {}, 'תפקיד'),
        STAT_KEYS.map(([, l, i]) => el('th', {}, i + ' ' + l)), el('th', {}, '⭐ מצטיין'))),
      tbody)) : el('div', { class: 'muted' }, 'אין שחקנים בהרכב של המשחק הזה.'),
    g.mvp ? el('div', { style: 'margin-top:8px' }, el('button', { class: 'small w', onclick: () => { g.mvp = null; save(); render(); } }, 'נקה מצטיין')) : null);
}

/* ---------------- game / lineup editor ---------------- */
function newGame(r) {
  const last = r.games[r.games.length - 1];
  const slots = Array(7).fill(null);
  const coming = att(r);
  const gk = roster().find(p => p.gk && (coming.includes(p.id) || !coming.length));
  if (gk) slots[0] = gk.id;
  return { id: uid('g'), num: nextNum(r.games), opponent: '', lineup: { formation: last ? last.lineup.formation : '3-2-1', slots, subs: [] }, result: { us: '', them: '' }, stats: {}, mvp: null };
}
function openEditor(r, g) {
  if (!canEdit()) { toast('צריך להתחבר כדי לערוך'); return; }
  const copy = g ? clone(g) : newGame(r);
  editing = { rid: r.id, g: copy, orig: JSON.stringify(copy), sel: null, showAll: false };
  document.body.classList.add('noscroll');
  renderEditor();
}
function closeEditor() { editing = null; const o = $('#editor'); if (o) o.remove(); document.body.classList.remove('noscroll'); }
function saveEditor() {
  const E = editing, r = roundById(E.rid), g = E.g;
  g.num = parseInt(g.num, 10) > 0 ? parseInt(g.num, 10) : nextNum(r.games.filter(x => x.id !== g.id));
  if (r.games.some(x => x.id !== g.id && x.num === g.num)) toast(`שים לב: יש כבר משחק ${g.num} במחזור`);
  // stats of players who left the lineup are dropped
  const inGame = new Set([...g.lineup.slots.filter(Boolean), ...g.lineup.subs]);
  Object.keys(g.stats).forEach(id => { if (!inGame.has(id)) delete g.stats[id]; });
  if (g.mvp && !inGame.has(g.mvp)) g.mvp = null;
  const i = r.games.findIndex(x => x.id === g.id);
  if (i >= 0) r.games[i] = g; else r.games.push(g);
  sortGames(r); ui.statsTab[r.id] = g.id;
  save(); closeEditor(); render();
  const n = g.lineup.slots.filter(Boolean).length;
  toast(n < 7 ? `נשמר (חסרים ${7 - n} על המגרש)` : 'ההרכב נשמר');
}
function putInSlot(l, id, i) {
  const si = l.slots.indexOf(id), bi = l.subs.indexOf(id), displaced = l.slots[i];
  if (si === i) return;
  if (si >= 0) l.slots[si] = displaced || null;               // swap between two slots
  if (bi >= 0) { if (displaced) l.subs[bi] = displaced; else l.subs.splice(bi, 1); } // sub comes on, starter goes to bench
  l.slots[i] = id;                                            // from the pool: displaced player returns to the pool
}
function toSubs() {
  const E = editing, l = E.g.lineup, s = E.sel; if (!s) return;
  const id = s.t === 'p' ? s.id : l.slots[s.i]; if (!id) return;
  if (!l.subs.includes(id)) { const i = l.slots.indexOf(id); if (i >= 0) l.slots[i] = null; l.subs.push(id); }
  E.sel = null; renderEditor();
}
function edClickSlot(i) {
  const E = editing, l = E.g.lineup, s = E.sel;
  if (s && s.t === 'p') { putInSlot(l, s.id, i); E.sel = null; }
  else if (s && s.t === 'slot') {
    if (s.i === i) E.sel = null;
    else if (l.slots[s.i] || l.slots[i]) { const a = l.slots[s.i]; l.slots[s.i] = l.slots[i]; l.slots[i] = a; E.sel = null; }
    else E.sel = { t: 'slot', i };
  } else E.sel = { t: 'slot', i };
  renderEditor();
}
function edClickPlayer(id) {
  const E = editing, s = E.sel;
  if (s && s.t === 'slot') { putInSlot(E.g.lineup, id, s.i); E.sel = null; }
  else if (s && s.t === 'p' && s.id === id) E.sel = null;
  else E.sel = { t: 'p', id };
  renderEditor();
}
function edHint() {
  const E = editing, l = E.g.lineup, s = E.sel, h = el('div', { class: 'hint' });
  if (!s) { h.append(el('span', {}, `לחץ על עמדה ואז על שחקן (או להפך). ${l.slots.filter(Boolean).length}/7 על המגרש · ${l.subs.length} בחילופים`)); return h; }
  if (s.t === 'slot') {
    const id = l.slots[s.i], role = ROLE_LABEL[FORMATIONS[l.formation].roles[s.i]];
    if (!id) { h.append(el('span', {}, `בחר שחקן לעמדת ${role}`)); return h; }
    h.append(el('span', {}, `נבחר ${nm(id)}: לחץ על שחקן להחלפה או על עמדה אחרת להחלפת מקומות`),
      el('div', { class: 'row' }, el('button', { class: 'small', onclick: toSubs }, '🔄 לחילופים'),
        el('button', { class: 'small danger', onclick: () => { l.slots[s.i] = null; E.sel = null; renderEditor(); } }, 'הוצא')));
    return h;
  }
  const inSub = l.subs.includes(s.id);
  h.append(el('span', {}, `נבחר ${nm(s.id)}: לחץ על עמדה במגרש` + (inSub ? ' כדי להכניס אותו' : ' או "הוסף לחילופים"')));
  if (inSub) h.append(el('button', { class: 'small danger', onclick: () => { l.subs = l.subs.filter(x => x !== s.id); E.sel = null; renderEditor(); } }, 'הוצא מהחילופים'));
  return h;
}
function renderEditor() {
  const E = editing; if (!E) return;
  const r = roundById(E.rid); if (!r) { closeEditor(); return; }
  const g = E.g, l = g.lineup;
  let ov = $('#editor');
  const keepScroll = ov ? ov.querySelector('.ed-body').scrollTop : 0;
  if (!ov) { ov = el('div', { id: 'editor', class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'עריכת הרכב' }); document.body.append(ov); }
  ov.innerHTML = '';
  const dirty = JSON.stringify(g) !== E.orig;
  const others = r.games.filter(x => x.id !== g.id);
  const usage = usageOf(others);
  const attSet = new Set(att(r));
  const used = new Set([...l.slots.filter(Boolean), ...l.subs]);
  const pool = roster().filter(p => !used.has(p.id) && (E.showAll || !attSet.size || attSet.has(p.id)));

  const chip = (p, extra) => {
    const st = (usage[p.id] || {}).s || 0, sb = (usage[p.id] || {}).b || 0;
    return el('button', {
      type: 'button', title: p.name, onclick: () => edClickPlayer(p.id),
      class: 'chip' + (E.sel && E.sel.t === 'p' && E.sel.id === p.id ? ' sel' : '') + (others.length && st === 0 ? ' zero' : '') + (extra || ''),
    }, numBadge(p), p.short || p.name, p.foreign ? el('span', { class: 'tag' }, 'זר') : null, others.length ? el('span', { class: 'cnt' }, `פתח ${st} · חילוף ${sb}`) : null);
  };
  const canSub = E.sel && (E.sel.t === 'p' ? !l.subs.includes(E.sel.id) : !!l.slots[E.sel.i]);

  ov.append(
    el('div', { class: 'ed-bar' },
      el('label', { class: 'ed-num' }, 'משחק', el('input', { type: 'number', min: '1', inputmode: 'numeric', value: String(g.num), 'aria-label': 'מספר משחק', oninput: e => { g.num = e.target.value; } })),
      el('input', { class: 'ed-opp', value: g.opponent, placeholder: 'יריב (לא חובה)', 'aria-label': 'יריב', oninput: e => { g.opponent = e.target.value; } }),
      el('select', { 'aria-label': 'מערך', onchange: e => { l.formation = e.target.value; renderEditor(); } },
        Object.keys(FORMATIONS).map(k => el('option', { value: k, selected: k === l.formation }, k))),
      el('div', { class: 'spacer' }),
      dirty ? confirmBtn('ביטול', closeEditor, '') : el('button', { onclick: closeEditor }, 'ביטול'),
      el('button', { class: 'primary', onclick: saveEditor }, 'שמור')),
    el('div', { class: 'ed-body' },
      el('div', {}, pitchEl(l, { onSlot: edClickSlot, sel: E.sel && E.sel.t === 'slot' ? E.sel.i : -1 }), edHint()),
      el('div', {},
        el('div', { class: 'subs-zone' },
          el('h4', {}, `🔄 חילופים / אופציה שנייה (${l.subs.length})`),
          el('div', { class: 'chips' }, l.subs.filter(byId).map(id => chip(byId(id))),
            el('button', { type: 'button', class: 'chip add', disabled: !canSub, onclick: toSubs }, '+ הוסף לחילופים'))),
        el('div', { class: 'pool' },
          el('div', { class: 'pool-head' }, el('h4', {}, `מגיעים פנויים (${pool.length})`),
            el('label', { class: 'muted small' }, el('input', { type: 'checkbox', checked: E.showAll, onchange: e => { E.showAll = e.target.checked; renderEditor(); } }), 'הצג גם מי שלא מגיע')),
          pool.length ? el('div', { class: 'chips' }, pool.map(p => chip(p, attSet.has(p.id) ? '' : ' absent'))) : el('div', { class: 'muted' }, 'כל המגיעים משובצים ✓')),
        others.length ? el('div', { class: 'muted small' }, '"פתח X · חילוף Y" = בכמה משחקים אחרים במחזור השחקן כבר פתח / היה בחילופים. כתום = עוד לא פתח במחזור.') : null)));
  ov.querySelector('.ed-body').scrollTop = keepScroll;
}

/* ---------------- stats page ---------------- */
function seasonStats() {
  const s = {};
  roster().forEach(p => { s[p.id] = { p, att: 0, games: 0, starts: 0, subs: 0, g: 0, a: 0, y: 0, r: 0, mvp: 0 }; });
  db.rounds.forEach(rd => {
    att(rd).forEach(id => { if (s[id]) s[id].att++; });
    rd.games.forEach(gm => {
      const u = usageOf([gm]);
      Object.entries(u).forEach(([id, x]) => { if (!s[id]) return; s[id].games++; if (x.s) s[id].starts++; else s[id].subs++; });
      Object.entries(gm.stats || {}).forEach(([id, st]) => { if (!s[id]) return; STAT_KEYS.forEach(([k]) => { s[id][k] += +st[k] || 0; }); });
      if (gm.mvp && s[gm.mvp]) s[gm.mvp].mvp++;
    });
  });
  return Object.values(s);
}
function renderStats(main) {
  const rows = seasonStats();
  const allGames = db.rounds.flatMap(r => r.games);
  const res = allGames.map(resultOf).filter(Boolean);
  const cnt = k => res.filter(x => x.r === k).length;
  const gf = res.reduce((a, x) => a + x.u, 0), ga = res.reduce((a, x) => a + x.t, 0);
  const leader = (k, label) => { const top = rows.slice().sort((a, b) => b[k] - a[k])[0]; return top && top[k] > 0 ? el('div', { class: 'kpi' }, el('div', { class: 'v' }, (top.p.short || top.p.name) + ' · ' + top[k]), el('div', { class: 'l' }, label)) : null; };

  main.append(el('div', { class: 'page-head' }, el('h2', {}, 'סטטיסטיקה')));
  main.append(el('div', { class: 'kpis' },
    el('div', { class: 'kpi' }, el('div', { class: 'v' }, `${db.rounds.length} · ${allGames.length}`), el('div', { class: 'l' }, 'מחזורים · משחקים')),
    el('div', { class: 'kpi' }, el('div', { class: 'v' }, `${cnt('W')} · ${cnt('D')} · ${cnt('L')}`), el('div', { class: 'l' }, 'נצחונות · תיקו · הפסדים')),
    el('div', { class: 'kpi' }, el('div', { class: 'v' }, `${gf} · ${ga}`), el('div', { class: 'l' }, 'שערי זכות · חובה')),
    leader('g', 'מלך השערים'), leader('a', 'מלך הבישולים'), leader('mvp', 'הכי הרבה פעמים מצטיין')));

  const cols = [['name', 'שחקן'], ['num', 'מס׳'], ['att', 'הגיע (מחזורים)'], ['games', 'שיחק (משחקים)'], ['starts', 'פתח'], ['subs', 'חילוף'],
    ['g', '⚽ גולים'], ['a', '🅰️ בישולים'], ['y', '🟨'], ['r', '🟥'], ['mvp', '⭐']];
  const { k, dir } = ui.statsSort;
  const val = (row, key) => key === 'name' ? (row.p.short || row.p.name) : key === 'num' ? (parseInt(row.p.num, 10) || 999) : row[key];
  rows.sort((a, b) => { const x = val(a, k), y = val(b, k); return (typeof x === 'string' ? x.localeCompare(y, 'he') : x - y) * dir || (b.starts - a.starts); });
  main.append(el('section', { class: 'card' },
    el('div', { class: 'sec-head' }, el('h3', {}, 'טבלת שחקנים'), el('span', { class: 'muted small' }, 'פתח / חילוף = בכמה משחקים השחקן היה בהרכב הפותח או בחילופים. לחץ על כותרת למיון')),
    el('div', { class: 'table-wrap' }, el('table', {},
      el('thead', {}, el('tr', {}, cols.map(([key, label]) => el('th', { class: (key === 'name' ? 'name ' : '') + (key === k ? 'sorted' : '') },
        el('button', { onclick: () => { ui.statsSort = { k: key, dir: key === k ? -dir : (key === 'name' || key === 'num' ? 1 : -1) }; render(); } }, label + (key === k ? (dir > 0 ? ' ▲' : ' ▼') : '')))))),
      el('tbody', {}, rows.map(row => el('tr', { class: row.att ? '' : 'dim' },
        el('td', { class: 'name' }, row.p.name, row.p.foreign ? el('span', { class: 'tag', style: 'margin-inline-start:6px' }, 'זר') : null),
        el('td', {}, row.p.num || '–'), ['att', 'games', 'starts', 'subs', 'g', 'a', 'y', 'r', 'mvp'].map(key => el('td', {}, row[key] || '–')))))))));
}

/* ---------------- squad page ---------------- */
function removePlayer(id) {
  db.players = db.players.filter(p => p.id !== id);
  db.rounds.forEach(r => {
    if (r.rsvp) delete r.rsvp[id];
    r.games.forEach(g => {
      g.lineup.slots = g.lineup.slots.map(x => x === id ? null : x); g.lineup.subs = g.lineup.subs.filter(x => x !== id);
      delete g.stats[id]; if (g.mvp === id) g.mvp = null;
    });
  });
  save(); render();
}
function exportData() {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `lineups-backup-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('קובץ הגיבוי ירד');
}
function importData(file) {
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const d = JSON.parse(fr.result);
      if (!valid(d)) throw new Error('bad');
      db = normalize(d); persistNow(); render(); toast('הנתונים יובאו בהצלחה');
    } catch (e) { toast('הקובץ לא תקין'); }
  };
  fr.readAsText(file);
}
function renderSquad(main) {
  main.append(el('div', { class: 'page-head' }, el('h2', {}, 'סגל הקבוצה')));
  main.append(el('section', { class: 'card' },
    el('label', { class: 'field', style: 'max-width:320px' }, 'שם הקבוצה',
      el('input', { value: db.team.name, oninput: e => { db.team.name = e.target.value; $('#teamName').textContent = e.target.value; save(); } }))));

  const list = el('div', {},
    el('div', { class: 'squad-row head' }, el('span', {}, 'מספר'), el('span', {}, 'שם מלא'), el('span', {}, 'שם על החולצה'), el('span', { class: 'opt' }, 'אפשרויות'), el('span', { class: 'x' })),
    roster().map(p => el('div', { class: 'squad-row' },
      el('input', { class: 'n', value: p.num, inputmode: 'numeric', 'aria-label': 'מספר', oninput: e => { p.num = e.target.value.trim(); save(); } }),
      el('input', { value: p.name, 'aria-label': 'שם מלא', oninput: e => { p.name = e.target.value; save(); } }),
      el('input', { value: p.short, 'aria-label': 'שם קצר', oninput: e => { p.short = e.target.value; save(); } }),
      el('span', { class: 'opt' },
        el('label', {}, el('input', { type: 'checkbox', checked: p.foreign, onchange: e => { p.foreign = e.target.checked; save(); } }), 'זר'),
        el('label', {}, el('input', { type: 'checkbox', checked: p.gk, onchange: e => { const v = e.target.checked; roster().forEach(x => { x.gk = false; }); p.gk = v; save(); render(); } }), 'שוער קבוע')),
      confirmBtn('✕', () => removePlayer(p.id), 'small danger x w'))));
  const addNum = el('input', { class: 'n', placeholder: 'מס׳', inputmode: 'numeric', 'aria-label': 'מספר' });
  const addName = el('input', { placeholder: 'שם מלא', 'aria-label': 'שם מלא' });
  const addShort = el('input', { placeholder: 'שם על החולצה (לא חובה)', 'aria-label': 'שם קצר' });
  const add = () => {
    const name = addName.value.trim(); if (!name) { addName.focus(); return; }
    db.players.push({ id: uid('p'), name, short: addShort.value.trim() || name.split(' ')[0], num: addNum.value.trim(), foreign: false, gk: false });
    save(); render(); toast('השחקן נוסף');
  };
  [addNum, addName, addShort].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') add(); }));
  main.append(el('section', { class: 'card' },
    el('div', { class: 'sec-head' }, el('h3', {}, `שחקנים (${roster().length})`), el('span', { class: 'muted small' }, 'השינויים נשמרים אוטומטית. "שוער קבוע" נכנס לשער בכל משחק חדש')),
    list,
    el('div', { class: 'add-row w' }, addNum, addName, addShort, el('button', { class: 'primary', onclick: add }, 'הוסף'))));

  const fileIn = el('input', { type: 'file', accept: 'application/json,.json', style: 'display:none', onchange: e => { if (e.target.files[0]) importData(e.target.files[0]); } });
  main.append(el('section', { class: 'card' },
    el('h3', { style: 'margin-bottom:8px' }, 'גיבוי נתונים'),
    el('p', { class: 'muted small', style: 'margin-top:0' }, cloud.on ? 'הנתונים נשמרים בענן ומסונכרנים בין כל המכשירים. אפשר בנוסף להוריד קובץ גיבוי.' : 'הנתונים נשמרים כרגע רק בדפדפן במכשיר הזה (הענן לא הוגדר). כדאי לייצא גיבוי מדי פעם, ואפשר לייבא אותו במכשיר אחר.'),
    el('div', { class: 'row' },
      el('button', { onclick: exportData }, '⬇ ייצא גיבוי'),
      el('button', { class: 'w', onclick: () => fileIn.click() }, '⬆ ייבא גיבוי'), fileIn,
      el('div', { class: 'spacer' }),
      confirmBtn('אפס לנתוני התחלה', () => { db = seed(); persistNow(); render(); toast('הנתונים אופסו'); }, 'small danger w'))));
}

/* =========================================================
   Image export (canvas)
   ========================================================= */
const IMG = { W: 560, band: 64, pad: 32, gap: 28, head: 116 };
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function wrapTokens(ctx, tokens, maxW, sep) {
  const lines = []; let cur = '';
  tokens.forEach(t => { const next = cur ? cur + sep + t : t; if (cur && ctx.measureText(next).width > maxW) { lines.push(cur); cur = t; } else cur = next; });
  if (cur) lines.push(cur);
  return lines.length ? lines : ['—'];
}
function subsLines(ctx, l, W) { ctx.font = '400 22px Rubik, sans-serif'; return wrapTokens(ctx, l.subs.filter(byId).map(nmNum), W - 48, ' · '); }
function panelHeight(ctx, g, W) { return IMG.band + W * 1.3 + 64 + subsLines(ctx, g.lineup, W).length * 32; }
function drawPanel(ctx, g, X, Y, W, H) {
  const l = g.lineup, PH = W * 1.3, f = FORMATIONS[l.formation];
  ctx.save();
  rr(ctx, X, Y, W, H, 18); ctx.fillStyle = '#fff'; ctx.fill(); ctx.clip();
  ctx.fillStyle = '#1f5c1f'; ctx.fillRect(X, Y, W, IMG.band);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '700 27px Rubik, sans-serif';
  const res = resultOf(g);
  ctx.fillText(gameLabel(g) + (res ? `  ${res.t} : ${res.u}` : ''), X + W / 2, Y + IMG.band / 2 + 1, W - 30);

  // pitch
  const py = Y + IMG.band, s = W / 100;
  ctx.save(); ctx.translate(X, py); ctx.scale(s, s);
  for (let i = 0; i < 10; i++) { ctx.fillStyle = i % 2 ? '#2a6e2a' : '#2f7a2f'; ctx.fillRect(0, i * 13, 100, 13); }
  ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 0.5;
  ctx.strokeRect(4, 4, 92, 122);
  ctx.beginPath(); ctx.moveTo(4, 65); ctx.lineTo(96, 65); ctx.stroke();
  ctx.beginPath(); ctx.arc(50, 65, 11, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeRect(24, 4, 52, 18); ctx.strokeRect(37, 4, 26, 7);
  ctx.strokeRect(24, 108, 52, 18); ctx.strokeRect(37, 119, 26, 7);
  const a = Math.asin(10 / 11);
  ctx.beginPath(); ctx.arc(50, 22 - Math.sqrt(21), 11, Math.PI / 2 - a, Math.PI / 2 + a); ctx.stroke();
  ctx.beginPath(); ctx.arc(50, 108 + Math.sqrt(21), 11, -Math.PI / 2 - a, -Math.PI / 2 + a); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(50, 65, 0.9, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.font = '500 18px Rubik, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(l.formation, X + 14, py + 10);

  const body = new Path2D(SHIRT_BODY), sleeves = new Path2D(SHIRT_SLEEVES);
  const S = W * 0.115;
  f.pos.forEach(([px, pyy], i) => {
    const cx = X + px / 100 * W, cy = py + pyy / 100 * PH, p = byId(l.slots[i]);
    if (p) {
      ctx.save(); ctx.translate(cx - S / 2, cy - S * 0.66); ctx.scale(S / 40, S / 40);
      ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1.5;
      ctx.fillStyle = '#8bd12a'; ctx.fill(body); ctx.shadowColor = 'transparent';
      ctx.lineWidth = 1.2; ctx.strokeStyle = '#0e2a0e'; ctx.stroke(body);
      ctx.fillStyle = '#161616'; ctx.fill(sleeves); ctx.lineWidth = 1; ctx.stroke(sleeves);
      ctx.fillStyle = '#0e2a0e'; ctx.font = '700 12px Rubik, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(p.num || '', 20, 27);
      ctx.restore();
      ctx.font = '500 21px Rubik, sans-serif';
      const label = p.short || p.name, tw = ctx.measureText(label).width + 16, ty = cy + S * 0.42;
      rr(ctx, cx - tw / 2, ty, tw, 30, 7); ctx.fillStyle = 'rgba(0,0,0,.66)'; ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, cx, ty + 16);
    } else {
      ctx.setLineDash([5, 4]); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy - 6, S * 0.36, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = '400 19px Rubik, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(ROLE_LABEL[f.roles[i]], cx, cy + S * 0.55);
    }
  });

  // subs
  let sy = py + PH + 34;
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#1f5c1f';
  ctx.font = '700 23px Rubik, sans-serif'; ctx.fillText('🔄 חילופים', X + W - 24, sy);
  ctx.fillStyle = '#17211a';
  subsLines(ctx, l, W).forEach(line => { sy += 32; ctx.fillText(line, X + W - 24, sy); });
  ctx.restore();
  ctx.strokeStyle = '#d5ddd0'; ctx.lineWidth = 2; rr(ctx, X, Y, W, H, 18); ctx.stroke();
}
async function buildImage(r, games) {
  try { await Promise.all(['400', '500', '700'].map(w => document.fonts.load(`${w} 24px Rubik`))); } catch (e) { /* use fallback font */ }
  const { W, pad, gap, head } = IMG;
  const cols = Math.max(1, Math.min(games.length, 3)), rows = Math.ceil(games.length / cols);
  const m = document.createElement('canvas').getContext('2d');
  const hs = games.map(g => panelHeight(m, g, W));
  const rowH = []; for (let i = 0; i < rows; i++) rowH.push(Math.max(...hs.slice(i * cols, i * cols + cols)));
  const c = document.createElement('canvas');
  c.width = pad * 2 + cols * W + (cols - 1) * gap;
  c.height = pad + head + rowH.reduce((a, b) => a + b, 0) + (rows - 1) * gap + pad;
  const x = c.getContext('2d');
  try { x.direction = 'rtl'; } catch (e) { /* older browsers */ }
  x.fillStyle = '#eef2ea'; x.fillRect(0, 0, c.width, c.height);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#17211a'; x.font = '700 40px Rubik, sans-serif'; x.fillText('⚽ ' + db.team.name, c.width / 2, pad + 30);
  x.fillStyle = '#4c584e'; x.font = '500 26px Rubik, sans-serif';
  x.fillText(roundTitle(r) + (r.date ? '  ·  ' + fmtDate(r.date) : ''), c.width / 2, pad + 78);
  let y = pad + head;
  for (let i = 0; i < rows; i++) {
    for (let k = 0; k < cols; k++) {
      const n = i * cols + k; if (n >= games.length) break;
      const X = c.width - pad - (k + 1) * W - k * gap; // right-to-left
      drawPanel(x, games[n], X, y, W, rowH[i]);
    }
    y += rowH[i] + gap;
  }
  return c;
}
async function showImage(r, games) {
  if (!games.length) return;
  openModal(el('div', { class: 'muted' }, 'מכין תמונה…'));
  const c = await buildImage(r, games);
  const blob = await new Promise(res => c.toBlob(res, 'image/png'));
  const base = [db.team.name, roundTitle(r), r.date, games.length === 1 ? gameName(games[0]) : ''].filter(Boolean).join('-');
  const fname = base.replace(/[\\/:*?"<>|\s]+/g, '-') + '.png';
  const url = URL.createObjectURL(blob);
  let file = null, canShare = false;
  try { file = new File([blob], fname, { type: 'image/png' }); canShare = !!(navigator.canShare && navigator.canShare({ files: [file] })); } catch (e) { /* no share */ }
  openModal(
    el('img', { class: 'preview', src: url, alt: 'תמונת ההרכב' }),
    el('div', { class: 'row' },
      el('a', { class: 'btn primary', href: url, download: fname }, '⬇ שמור תמונה'),
      canShare ? el('button', { onclick: async () => { try { await navigator.share({ files: [file] }); } catch (e) { /* cancelled */ } } }, '📤 שתף (ווטסאפ ועוד)') : null,
      el('div', { class: 'spacer' }),
      el('button', { onclick: closeModal }, 'סגור')),
    el('div', { class: 'muted small' }, 'בטלפון אפשר גם ללחוץ לחיצה ארוכה על התמונה ולשמור אותה.'));
}

/* ---------------- start ---------------- */
// old links (#games / #game-x) → rounds
if (/^#(games|game-)/.test(location.hash)) location.replace('#rounds');
$('#status').textContent = idleStatus();
render();
initCloud();
