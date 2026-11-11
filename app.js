'use strict';

/* =========================================================
   Team lineups — games, lineups, subs, stats.
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
  const L = (id, name, slots) => ({ id, name, formation: '3-2-1', slots, subs: [] });
  return {
    version: 1,
    team: { name: 'גדוד 9218' },
    players,
    games: [{
      id: 'g1', opponent: '', date: '',
      attending: ['p10', 'p23', 'p16', 'p7', 'p6', 'p1', 'p11', 'p24', 'p14', 'p9', 'p5', 'p22', 'p15', 'p18', 'p8', 'p20', 'p21', 'p12'],
      lineups: [
        L('l1', 'הרכב 1', ['p21', 'p18', 'p12', 'p16', 'p11', 'p24', 'p22']),
        L('l2', 'הרכב 2', ['p21', 'p23', null, 'p8', 'p11', 'p7', 'p22']),
        L('l3', 'הרכב 3', ['p21', 'p6', 'p15', 'p10', 'p14', 'p1', 'p9']),
      ],
      result: { us: '', them: '' }, stats: {}, mvp: null,
    }],
  };
}

/* ---------------- state + storage ---------------- */
let db = load();
let editing = null;
const ui = { attOpen: {}, statsSort: { k: 'starts', dir: -1 } };

function valid(d) { return d && Array.isArray(d.players) && Array.isArray(d.games); }
function normalize(d) {
  d.team = d.team || { name: 'הקבוצה שלי' };
  d.players.forEach(p => { p.num = p.num == null ? '' : String(p.num); p.short = p.short || p.name; });
  d.games.forEach(g => {
    g.attending = g.attending || []; g.lineups = g.lineups || []; g.result = g.result || { us: '', them: '' };
    g.stats = g.stats || {}; g.mvp = g.mvp || null;
    g.lineups.forEach(l => { l.formation = FORMATIONS[l.formation] ? l.formation : '3-2-1'; l.slots = (l.slots || []).concat(Array(7).fill(null)).slice(0, 7); l.subs = l.subs || []; });
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
  try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); setStatus('✓ נשמר במחשב'); }
  catch (e) { setStatus('⚠ השמירה נכשלה'); toast('השמירה נכשלה – כדאי לייצא גיבוי'); }
}
window.addEventListener('beforeunload', () => { if (saveTimer) { clearTimeout(saveTimer); persistNow(); } });

/* ---------------- helpers ---------------- */
const $ = s => document.querySelector(s);
const clone = o => JSON.parse(JSON.stringify(o));
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const byId = id => db.players.find(p => p.id === id);
const gameById = id => db.games.find(g => g.id === id);
const nm = id => { const p = byId(id); return p ? (p.short || p.name) : '?'; };
const nmNum = id => { const p = byId(id); return p ? (p.short || p.name) + (p.num ? ` (${p.num})` : '') : '?'; };
const names = ids => ids.map(nm).join(', ');

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
function gameTitle(g) { return (g.opponent || '').trim() ? 'נגד ' + g.opponent.trim() : 'משחק (יריב לא הוגדר)'; }
function sortedGames() { return db.games.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')); }
function resultOf(g) {
  const u = parseInt(g.result && g.result.us, 10), t = parseInt(g.result && g.result.them, 10);
  if (isNaN(u) || isNaN(t)) return null;
  return { u, t, r: u > t ? 'W' : u < t ? 'L' : 'D' };
}
function resultBadge(g) { const r = resultOf(g); return r ? el('span', { class: 'res ' + r.r, title: 'אנחנו : יריב' }, `${r.t} : ${r.u}`) : null; }
function numBadge(p) { return el('span', { class: 'num' }, p.num || '–'); }
function roster() { return db.players; }

let statusT;
function setStatus(t) { const s = $('#status'); s.textContent = t; clearTimeout(statusT); statusT = setTimeout(() => { s.textContent = 'הנתונים נשמרים במחשב הזה'; }, 2500); }
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
function gameUsage(g, exceptLineupId) {
  const u = {};
  const bump = (id, k) => { if (!id || !byId(id)) return; (u[id] = u[id] || { s: 0, b: 0 })[k]++; };
  g.lineups.forEach(l => { if (l.id === exceptLineupId) return; l.slots.forEach(id => bump(id, 's')); l.subs.forEach(id => bump(id, 'b')); });
  return u;
}
function gameWarnings(g) {
  const w = [];
  if (!g.lineups.length) return w;
  const u = gameUsage(g);
  const att = g.attending.filter(byId);
  const notIn = att.filter(id => !u[id]);
  const subsOnly = att.filter(id => u[id] && !u[id].s);
  if (notIn.length) w.push({ lvl: 'bad', text: `לא שובצו בכלל, לא בהרכב ולא בחילופים (${notIn.length}): ${names(notIn)}` });
  if (subsOnly.length) w.push({ lvl: 'warn', text: `לא פתחו באף הרכב, רק בחילופים (${subsOnly.length}): ${names(subsOnly)}` });
  const notAtt = Object.keys(u).filter(id => !g.attending.includes(id));
  if (notAtt.length) w.push({ lvl: 'warn', text: `משובצים אבל לא מסומנים כמגיעים: ${names(notAtt)}` });
  g.lineups.forEach(l => { const n = l.slots.filter(id => id && byId(id)).length; if (n < 7) w.push({ lvl: 'warn', text: `${l.name}: חסרים ${7 - n} שחקנים על המגרש` }); });
  return w;
}

/* ---------------- WhatsApp text ---------------- */
function gameHeader(g) { return `⚽ *${db.team.name}* ${gameTitle(g)}` + (g.date ? ` | ${fmtDate(g.date)}` : ''); }
function lineupText(g, l, withHeader) {
  const f = FORMATIONS[l.formation];
  const lines = [];
  if (withHeader) lines.push(gameHeader(g), '');
  lines.push(`*${l.name}* (${l.formation})`);
  ROLE_ORDER.forEach(role => {
    const ids = f.roles.map((r, i) => r === role ? l.slots[i] : undefined).filter(x => x !== undefined);
    if (!ids.length) return;
    lines.push(`${ROLE_ICON[role]} ${ROLE_LABEL[role]}: ` + ids.map(id => id && byId(id) ? nmNum(id) : '—').join(', '));
  });
  const subs = l.subs.filter(byId);
  lines.push('🔄 חילופים: ' + (subs.length ? subs.map(nmNum).join(', ') : '—'));
  return lines.join('\n');
}
function gameText(g) { return [gameHeader(g), ...g.lineups.map(l => '\n' + lineupText(g, l, false))].join('\n'); }

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
   Views
   ========================================================= */
function render() {
  const h = location.hash.slice(1) || 'games';
  $('#teamName').textContent = db.team.name;
  document.title = 'הרכבים · ' + db.team.name;
  document.querySelectorAll('.topbar nav a').forEach(a => a.classList.toggle('active', a.dataset.v === h || (h.startsWith('game-') && a.dataset.v === 'games')));
  const main = $('#view');
  main.innerHTML = '';
  if (h.startsWith('game-')) { const g = gameById(h.slice(5)); if (g) return renderGame(main, g); location.hash = 'games'; return; }
  if (h === 'stats') return renderStats(main);
  if (h === 'squad') return renderSquad(main);
  renderGames(main);
}
window.addEventListener('hashchange', () => { if (editing) closeEditor(); closeModal(); render(); window.scrollTo(0, 0); });

/* ---------------- games list ---------------- */
function newGame() {
  const g = { id: uid('g'), opponent: '', date: new Date().toISOString().slice(0, 10), attending: roster().map(p => p.id), lineups: [], result: { us: '', them: '' }, stats: {}, mvp: null };
  db.games.push(g); ui.attOpen[g.id] = true; save();
  location.hash = 'game-' + g.id;
}
function renderGames(main) {
  main.append(el('div', { class: 'page-head' }, el('h2', {}, 'משחקים'), el('button', { class: 'primary', onclick: newGame }, '+ משחק חדש')));
  if (!db.games.length) { main.append(el('div', { class: 'empty' }, 'עוד אין משחקים. לחץ על "משחק חדש" כדי להתחיל.')); return; }
  main.append(el('div', { class: 'game-list' }, sortedGames().map(g => {
    const w = gameWarnings(g);
    return el('a', { class: 'game-card', href: '#game-' + g.id },
      el('div', { class: 'gc-top' }, el('span', { class: 'gc-title' }, gameTitle(g)), resultBadge(g)),
      el('div', { class: 'gc-meta' }, `${fmtDate(g.date)} · ${g.lineups.length} הרכבים · ${g.attending.filter(byId).length} מגיעים`),
      w.length ? el('div', { class: 'gc-warn' }, `⚠ ${w.length} אזהרות`) : null);
  })));
}

/* ---------------- game page ---------------- */
function renderGame(main, g) {
  main.append(el('a', { class: 'back', href: '#games' }, '→ כל המשחקים'));

  // details + share
  main.append(el('section', { class: 'card' },
    el('div', { class: 'game-fields' },
      el('label', { class: 'field' }, 'יריב', el('input', { value: g.opponent || '', placeholder: 'שם הקבוצה היריבה', oninput: e => { g.opponent = e.target.value; save(); } })),
      el('label', { class: 'field' }, 'תאריך', el('input', { type: 'date', value: g.date || '', onchange: e => { g.date = e.target.value; save(); } }))),
    el('div', { class: 'row' },
      el('button', { onclick: () => copyText(gameText(g)), disabled: !g.lineups.length }, '📋 העתק את כל ההרכבים'),
      el('a', { class: 'btn', href: '#', target: '_blank', rel: 'noopener', onclick: e => { if (!g.lineups.length) { e.preventDefault(); return; } e.currentTarget.href = waLink(gameText(g)); } }, '💬 שלח בווטסאפ'),
      el('button', { onclick: () => showImage(g, g.lineups), disabled: !g.lineups.length }, '📷 תמונה של כל ההרכבים'),
      el('div', { class: 'spacer' }),
      confirmBtn('מחק משחק', () => { db.games = db.games.filter(x => x !== g); save(); location.hash = 'games'; }, 'small danger'))));

  // attendance
  const att = new Set(g.attending);
  const open = ui.attOpen[g.id] ?? !g.lineups.length;
  const det = el('details', { class: 'card att', open },
    el('summary', {}, el('h3', {}, `מגיעים למשחק (${roster().filter(p => att.has(p.id)).length}/${roster().length})`),
      el('div', { class: 'row', onclick: e => e.preventDefault() },
        el('button', { class: 'small', onclick: () => { g.attending = roster().map(p => p.id); save(); render(); } }, 'כולם'),
        el('button', { class: 'small', onclick: () => { g.attending = []; save(); render(); } }, 'אף אחד'))),
    el('div', { class: 'chips' }, roster().map(p => el('button', {
      class: 'chip toggle' + (att.has(p.id) ? ' on' : ''), type: 'button',
      onclick: () => { g.attending = att.has(p.id) ? g.attending.filter(x => x !== p.id) : g.attending.concat(p.id); save(); render(); },
    }, numBadge(p), p.short || p.name, p.foreign ? el('span', { class: 'tag' }, 'זר') : null))));
  det.addEventListener('toggle', () => { ui.attOpen[g.id] = det.open; });
  main.append(det);

  // lineups side by side
  const sec = el('section', { class: 'card' },
    el('div', { class: 'sec-head' }, el('h3', {}, `הרכבים (${g.lineups.length})`), el('button', { class: 'primary small', onclick: () => openEditor(g, null) }, '+ הרכב חדש')));
  const warns = gameWarnings(g);
  if (g.lineups.length) {
    if (warns.length) warns.forEach(w => sec.append(el('div', { class: 'alert ' + w.lvl }, '⚠ ' + w.text)));
    else sec.append(el('div', { class: 'alert ok' }, '✓ כל המגיעים פתחו לפחות בהרכב אחד'));
  }
  sec.append(el('div', { class: 'lineup-grid' }, g.lineups.map((l, i) => lineupCard(g, l, i)),
    el('button', { class: 'add-card', onclick: () => openEditor(g, null) }, '+ הרכב חדש')));
  main.append(sec);

  main.append(gameTable(g));
}

function moveLineup(g, i, d) { const j = i + d; if (j < 0 || j >= g.lineups.length) return; [g.lineups[i], g.lineups[j]] = [g.lineups[j], g.lineups[i]]; save(); render(); }
function dupLineup(g, l) {
  const c = clone(l); c.id = uid('l'); c.name = l.name + ' (עותק)';
  g.lineups.splice(g.lineups.indexOf(l) + 1, 0, c); save(); render(); toast('ההרכב שוכפל');
}
function lineupCard(g, l, i) {
  const subs = l.subs.filter(byId);
  const pitch = pitchEl(l, { mini: true });
  pitch.classList.add('clickable'); pitch.title = 'לחץ לעריכה'; pitch.addEventListener('click', () => openEditor(g, l));
  return el('div', { class: 'lcard' },
    el('div', { class: 'lc-head' },
      el('div', {}, el('b', {}, l.name), el('span', { class: 'muted small' }, ' · ' + l.formation)),
      el('div', { class: 'row', style: 'gap:2px' },
        i > 0 ? el('button', { class: 'icon', title: 'הזז קודימה', onclick: () => moveLineup(g, i, -1) }, '→') : null,
        i < g.lineups.length - 1 ? el('button', { class: 'icon', title: 'הזז אחורה', onclick: () => moveLineup(g, i, 1) }, '←') : null)),
    pitch,
    el('div', { class: 'subs-line' }, el('span', { class: 'muted' }, '🔄 חילופים: '), subs.length ? subs.map(nm).join(' · ') : el('span', { class: 'muted' }, 'אין')),
    el('div', { class: 'lc-actions' },
      el('button', { class: 'small primary', onclick: () => openEditor(g, l) }, 'ערוך'),
      el('button', { class: 'small', onclick: () => dupLineup(g, l) }, 'שכפל'),
      el('button', { class: 'small', onclick: () => copyText(lineupText(g, l, true)) }, '📋'),
      el('button', { class: 'small', title: 'תמונה', onclick: () => showImage(g, [l]) }, '📷'),
      confirmBtn('מחק', () => { g.lineups = g.lineups.filter(x => x !== l); save(); render(); }, 'small danger')));
}

function gameTable(g) {
  const u = gameUsage(g);
  const set = new Set([...g.attending, ...Object.keys(u)]);
  const ids = roster().map(p => p.id).filter(id => set.has(id));
  const sumEl = el('span', { class: 'muted small' });
  const updSum = () => {
    const s = ids.reduce((a, id) => a + (+((g.stats[id] || {}).g) || 0), 0);
    const r = resultOf(g);
    sumEl.textContent = `סה״כ גולים בטבלה: ${s}` + (r && r.u !== s ? ` (בתוצאה רשום ${r.u})` : '');
  };
  const scoreIn = k => el('input', { type: 'number', min: '0', inputmode: 'numeric', value: g.result[k] ?? '', 'aria-label': k === 'us' ? 'שערים שלנו' : 'שערי היריב', oninput: e => { g.result[k] = e.target.value; save(); updSum(); } });

  const tbody = el('tbody');
  ids.forEach(id => {
    const p = byId(id), st = g.stats[id] || {}, us = u[id] || { s: 0, b: 0 };
    tbody.append(el('tr', { class: g.attending.includes(id) ? '' : 'dim' },
      el('td', { class: 'name' }, `${p.short || p.name}`, p.num ? el('span', { class: 'muted small' }, ' #' + p.num) : null),
      el('td', {}, us.s || '–'), el('td', {}, us.b || '–'),
      STAT_KEYS.map(([k]) => el('td', {}, el('input', {
        type: 'number', min: '0', inputmode: 'numeric', value: st[k] ? String(st[k]) : '', placeholder: '0', 'aria-label': k,
        oninput: e => { const v = Math.max(0, parseInt(e.target.value, 10) || 0); g.stats[id] = Object.assign(g.stats[id] || {}, { [k]: v }); save(); if (k === 'g') updSum(); },
      }))),
      el('td', {}, el('input', { type: 'radio', name: 'mvp-' + g.id, checked: g.mvp === id, 'aria-label': 'מצטיין', onchange: () => { g.mvp = id; save(); } }))));
  });
  updSum();
  return el('section', { class: 'card' },
    el('div', { class: 'sec-head' }, el('h3', {}, 'אחרי המשחק: תוצאה וסטטיסטיקה'), sumEl),
    el('div', { class: 'score' }, el('b', {}, db.team.name), scoreIn('us'), el('b', {}, ':'), scoreIn('them'), el('b', {}, g.opponent || 'יריב')),
    ids.length ? el('div', { class: 'table-wrap' }, el('table', {},
      el('thead', {}, el('tr', {}, el('th', { class: 'name' }, 'שחקן'), el('th', {}, 'פתח'), el('th', {}, 'חילוף'),
        STAT_KEYS.map(([, l, i]) => el('th', {}, i + ' ' + l)), el('th', {}, '⭐ מצטיין'))),
      tbody)) : el('div', { class: 'muted' }, 'סמן מי מגיע כדי למלא סטטיסטיקה.'),
    g.mvp ? el('div', { style: 'margin-top:8px' }, el('button', { class: 'small', onclick: () => { g.mvp = null; save(); render(); } }, 'נקה מצטיין')) : null);
}

/* ---------------- lineup editor ---------------- */
function newLineup(g) {
  const last = g.lineups[g.lineups.length - 1];
  const slots = Array(7).fill(null);
  const gk = roster().find(p => p.gk && (g.attending.includes(p.id) || !g.attending.length));
  if (gk) slots[0] = gk.id;
  return { id: uid('l'), name: 'הרכב ' + (g.lineups.length + 1), formation: last ? last.formation : '3-2-1', slots, subs: [] };
}
function openEditor(g, l) {
  const copy = l ? clone(l) : newLineup(g);
  editing = { gid: g.id, l: copy, orig: JSON.stringify(copy), sel: null, showAll: false };
  document.body.classList.add('noscroll');
  renderEditor();
}
function closeEditor() { editing = null; const o = $('#editor'); if (o) o.remove(); document.body.classList.remove('noscroll'); }
function saveEditor() {
  const E = editing, g = gameById(E.gid), l = E.l;
  l.name = (l.name || '').trim() || 'הרכב';
  const i = g.lineups.findIndex(x => x.id === l.id);
  if (i >= 0) g.lineups[i] = l; else g.lineups.push(l);
  save(); closeEditor(); render();
  const n = l.slots.filter(Boolean).length;
  toast(n < 7 ? `ההרכב נשמר (חסרים ${7 - n} על המגרש)` : 'ההרכב נשמר');
}
function putInSlot(l, id, i) {
  const si = l.slots.indexOf(id), bi = l.subs.indexOf(id), displaced = l.slots[i];
  if (si === i) return;
  if (si >= 0) l.slots[si] = displaced || null;               // swap between two slots
  if (bi >= 0) { if (displaced) l.subs[bi] = displaced; else l.subs.splice(bi, 1); } // sub comes on, starter goes to bench
  l.slots[i] = id;                                            // from the pool: displaced player returns to the pool
}
function toSubs() {
  const E = editing, l = E.l, s = E.sel; if (!s) return;
  const id = s.t === 'p' ? s.id : l.slots[s.i]; if (!id) return;
  if (!l.subs.includes(id)) { const i = l.slots.indexOf(id); if (i >= 0) l.slots[i] = null; l.subs.push(id); }
  E.sel = null; renderEditor();
}
function edClickSlot(i) {
  const E = editing, l = E.l, s = E.sel;
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
  if (s && s.t === 'slot') { putInSlot(E.l, id, s.i); E.sel = null; }
  else if (s && s.t === 'p' && s.id === id) E.sel = null;
  else E.sel = { t: 'p', id };
  renderEditor();
}
function edHint() {
  const E = editing, l = E.l, s = E.sel, h = el('div', { class: 'hint' });
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
  const g = gameById(E.gid); if (!g) { closeEditor(); return; }
  const l = E.l;
  let ov = $('#editor');
  const keepScroll = ov ? ov.querySelector('.ed-body').scrollTop : 0;
  if (!ov) { ov = el('div', { id: 'editor', class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'עריכת הרכב' }); document.body.append(ov); }
  ov.innerHTML = '';
  const dirty = JSON.stringify(l) !== E.orig;
  const others = g.lineups.filter(x => x.id !== l.id).length;
  const usage = gameUsage(g, l.id);
  const attSet = new Set(g.attending);
  const used = new Set([...l.slots.filter(Boolean), ...l.subs]);
  const pool = roster().filter(p => !used.has(p.id) && (E.showAll || !g.attending.length || attSet.has(p.id)));

  const chip = (p, extra) => {
    const st = (usage[p.id] || {}).s || 0;
    return el('button', {
      type: 'button', title: p.name, onclick: () => edClickPlayer(p.id),
      class: 'chip' + (E.sel && E.sel.t === 'p' && E.sel.id === p.id ? ' sel' : '') + (others && st === 0 ? ' zero' : '') + (extra || ''),
    }, numBadge(p), p.short || p.name, p.foreign ? el('span', { class: 'tag' }, 'זר') : null, others ? el('span', { class: 'cnt' }, 'פתח ' + st) : null);
  };
  const canSub = E.sel && (E.sel.t === 'p' ? !l.subs.includes(E.sel.id) : !!l.slots[E.sel.i]);

  ov.append(
    el('div', { class: 'ed-bar' },
      el('input', { class: 'ed-name', value: l.name, 'aria-label': 'שם ההרכב', oninput: e => { l.name = e.target.value; } }),
      el('select', { 'aria-label': 'מערך', onchange: e => { l.formation = e.target.value; renderEditor(); } },
        Object.keys(FORMATIONS).map(k => el('option', { value: k, selected: k === l.formation }, k))),
      el('div', { class: 'spacer' }),
      dirty ? confirmBtn('ביטול', closeEditor, '') : el('button', { onclick: closeEditor }, 'ביטול'),
      el('button', { class: 'primary', onclick: saveEditor }, 'שמור הרכב')),
    el('div', { class: 'ed-body' },
      el('div', {}, pitchEl(l, { onSlot: edClickSlot, sel: E.sel && E.sel.t === 'slot' ? E.sel.i : -1 }), edHint()),
      el('div', {},
        el('div', { class: 'subs-zone' },
          el('h4', {}, `🔄 חילופים / אופציה שנייה (${l.subs.length})`),
          el('div', { class: 'chips' }, l.subs.filter(byId).map(id => chip(byId(id))),
            el('button', { type: 'button', class: 'chip add', disabled: !canSub, onclick: toSubs }, '+ הוסף לחילופים'))),
        el('div', { class: 'pool' },
          el('div', { class: 'pool-head' }, el('h4', {}, `שחקנים פנויים (${pool.length})`),
            el('label', { class: 'muted small' }, el('input', { type: 'checkbox', checked: E.showAll, onchange: e => { E.showAll = e.target.checked; renderEditor(); } }), 'הצג גם מי שלא מגיע')),
          pool.length ? el('div', { class: 'chips' }, pool.map(p => chip(p, attSet.has(p.id) ? '' : ' absent'))) : el('div', { class: 'muted' }, 'כל המגיעים משובצים ✓')),
        others ? el('div', { class: 'muted small' }, '"פתח X" = כמה פעמים השחקן פתח בהרכבים האחרים של המשחק. כתום = עוד לא פתח.') : null)));
  ov.querySelector('.ed-body').scrollTop = keepScroll;
}

/* ---------------- stats page ---------------- */
function seasonStats() {
  const s = {};
  roster().forEach(p => { s[p.id] = { p, att: 0, games: 0, starts: 0, subs: 0, g: 0, a: 0, y: 0, r: 0, mvp: 0 }; });
  db.games.forEach(gm => {
    gm.attending.forEach(id => { if (s[id]) s[id].att++; });
    const u = gameUsage(gm);
    Object.entries(u).forEach(([id, x]) => { if (!s[id]) return; s[id].games++; s[id].starts += x.s; s[id].subs += x.b; });
    Object.entries(gm.stats || {}).forEach(([id, st]) => { if (!s[id]) return; STAT_KEYS.forEach(([k]) => { s[id][k] += +st[k] || 0; }); });
    if (gm.mvp && s[gm.mvp]) s[gm.mvp].mvp++;
  });
  return Object.values(s);
}
function renderStats(main) {
  const rows = seasonStats();
  const res = db.games.map(resultOf).filter(Boolean);
  const cnt = r => res.filter(x => x.r === r).length;
  const gf = res.reduce((a, x) => a + x.u, 0), ga = res.reduce((a, x) => a + x.t, 0);
  const leader = (k, label) => { const top = rows.slice().sort((a, b) => b[k] - a[k])[0]; return top && top[k] > 0 ? el('div', { class: 'kpi' }, el('div', { class: 'v' }, (top.p.short || top.p.name) + ' · ' + top[k]), el('div', { class: 'l' }, label)) : null; };

  main.append(el('div', { class: 'page-head' }, el('h2', {}, 'סטטיסטיקה')));
  main.append(el('div', { class: 'kpis' },
    el('div', { class: 'kpi' }, el('div', { class: 'v' }, db.games.length), el('div', { class: 'l' }, 'משחקים')),
    el('div', { class: 'kpi' }, el('div', { class: 'v' }, `${cnt('W')}-${cnt('D')}-${cnt('L')}`), el('div', { class: 'l' }, 'נצחונות-תיקו-הפסדים')),
    el('div', { class: 'kpi' }, el('div', { class: 'v' }, `${gf} · ${ga}`), el('div', { class: 'l' }, 'שערי זכות · חובה')),
    leader('g', 'מלך השערים'), leader('a', 'מלך הבישולים'), leader('mvp', 'הכי הרבה פעמים מצטיין')));

  const cols = [['name', 'שחקן'], ['num', 'מס׳'], ['att', 'הגיע'], ['games', 'שיחק'], ['starts', 'פתח'], ['subs', 'חילוף'],
    ['g', '⚽ גולים'], ['a', '🅰️ בישולים'], ['y', '🟨'], ['r', '🟥'], ['mvp', '⭐']];
  const { k, dir } = ui.statsSort;
  const val = (r, key) => key === 'name' ? (r.p.short || r.p.name) : key === 'num' ? (parseInt(r.p.num, 10) || 999) : r[key];
  rows.sort((a, b) => { const x = val(a, k), y = val(b, k); return (typeof x === 'string' ? x.localeCompare(y, 'he') : x - y) * dir || (b.starts - a.starts); });
  main.append(el('section', { class: 'card' },
    el('div', { class: 'sec-head' }, el('h3', {}, 'טבלת שחקנים'), el('span', { class: 'muted small' }, 'פתח / חילוף = מספר ההרכבים השמורים שבהם השחקן היה בהרכב הפותח או בחילופים. לחץ על כותרת למיון')),
    el('div', { class: 'table-wrap' }, el('table', {},
      el('thead', {}, el('tr', {}, cols.map(([key, label]) => el('th', { class: (key === 'name' ? 'name ' : '') + (key === k ? 'sorted' : '') },
        el('button', { onclick: () => { ui.statsSort = { k: key, dir: key === k ? -dir : (key === 'name' || key === 'num' ? 1 : -1) }; render(); } }, label + (key === k ? (dir > 0 ? ' ▲' : ' ▼') : '')))))),
      el('tbody', {}, rows.map(r => el('tr', { class: r.att ? '' : 'dim' },
        el('td', { class: 'name' }, r.p.name, r.p.foreign ? el('span', { class: 'tag', style: 'margin-inline-start:6px' }, 'זר') : null),
        el('td', {}, r.p.num || '–'), ['att', 'games', 'starts', 'subs', 'g', 'a', 'y', 'r', 'mvp'].map(key => el('td', {}, r[key] || '–')))))))));
}

/* ---------------- squad page ---------------- */
function removePlayer(id) {
  db.players = db.players.filter(p => p.id !== id);
  db.games.forEach(g => {
    g.attending = g.attending.filter(x => x !== id);
    g.lineups.forEach(l => { l.slots = l.slots.map(x => x === id ? null : x); l.subs = l.subs.filter(x => x !== id); });
    delete g.stats[id]; if (g.mvp === id) g.mvp = null;
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
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!valid(d)) throw new Error('bad');
      db = normalize(d); persistNow(); render(); toast('הנתונים יובאו בהצלחה');
    } catch (e) { toast('הקובץ לא תקין'); }
  };
  r.readAsText(file);
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
      confirmBtn('✕', () => removePlayer(p.id), 'small danger x'))));
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
    el('div', { class: 'sec-head' }, el('h3', {}, `שחקנים (${roster().length})`), el('span', { class: 'muted small' }, 'השינויים נשמרים אוטומטית. "שוער קבוע" נכנס לשער בכל הרכב חדש')),
    list,
    el('div', { class: 'add-row' }, addNum, addName, addShort, el('button', { class: 'primary', onclick: add }, 'הוסף'))));

  const fileIn = el('input', { type: 'file', accept: 'application/json,.json', style: 'display:none', onchange: e => { if (e.target.files[0]) importData(e.target.files[0]); } });
  main.append(el('section', { class: 'card' },
    el('h3', { style: 'margin-bottom:8px' }, 'גיבוי נתונים'),
    el('p', { class: 'muted small', style: 'margin-top:0' }, 'כל הנתונים נשמרים רק בדפדפן במחשב הזה. כדאי לייצא גיבוי מדי פעם, ואפשר לייבא אותו במחשב או בטלפון אחר. מחיקת היסטוריית הגלישה תמחק גם את הנתונים.'),
    el('div', { class: 'row' },
      el('button', { onclick: exportData }, '⬇ ייצא גיבוי'),
      el('button', { onclick: () => fileIn.click() }, '⬆ ייבא גיבוי'), fileIn,
      el('div', { class: 'spacer' }),
      confirmBtn('אפס לנתוני התחלה', () => { db = seed(); persistNow(); render(); toast('הנתונים אופסו'); }, 'small danger'))));
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
function panelHeight(ctx, l, W) { return IMG.band + W * 1.3 + 64 + subsLines(ctx, l, W).length * 32; }
function drawPanel(ctx, l, X, Y, W, H) {
  const PH = W * 1.3, f = FORMATIONS[l.formation];
  ctx.save();
  rr(ctx, X, Y, W, H, 18); ctx.fillStyle = '#fff'; ctx.fill(); ctx.clip();
  ctx.fillStyle = '#1f5c1f'; ctx.fillRect(X, Y, W, IMG.band);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '700 28px Rubik, sans-serif'; ctx.fillText(`${l.name}  ·  ${l.formation}`, X + W / 2, Y + IMG.band / 2 + 1);

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
async function buildImage(g, lineups) {
  try { await Promise.all(['400', '500', '700'].map(w => document.fonts.load(`${w} 24px Rubik`))); } catch (e) { /* use fallback font */ }
  const { W, pad, gap, head } = IMG;
  const cols = Math.max(1, Math.min(lineups.length, 3)), rows = Math.ceil(lineups.length / cols);
  const m = document.createElement('canvas').getContext('2d');
  const hs = lineups.map(l => panelHeight(m, l, W));
  const rowH = []; for (let r = 0; r < rows; r++) rowH.push(Math.max(...hs.slice(r * cols, r * cols + cols)));
  const c = document.createElement('canvas');
  c.width = pad * 2 + cols * W + (cols - 1) * gap;
  c.height = pad + head + rowH.reduce((a, b) => a + b, 0) + (rows - 1) * gap + pad;
  const x = c.getContext('2d');
  try { x.direction = 'rtl'; } catch (e) { /* older browsers */ }
  x.fillStyle = '#eef2ea'; x.fillRect(0, 0, c.width, c.height);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#17211a'; x.font = '700 40px Rubik, sans-serif'; x.fillText('⚽ ' + db.team.name, c.width / 2, pad + 30);
  x.fillStyle = '#4c584e'; x.font = '500 26px Rubik, sans-serif';
  x.fillText(gameTitle(g) + (g.date ? '  ·  ' + fmtDate(g.date) : ''), c.width / 2, pad + 78);
  let y = pad + head;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const i = r * cols + k; if (i >= lineups.length) break;
      const X = c.width - pad - (k + 1) * W - k * gap; // right-to-left
      drawPanel(x, lineups[i], X, y, W, rowH[r]);
    }
    y += rowH[r] + gap;
  }
  return c;
}
async function showImage(g, lineups) {
  if (!lineups.length) return;
  openModal(el('div', { class: 'muted' }, 'מכין תמונה…'));
  const c = await buildImage(g, lineups);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const base = [db.team.name, g.opponent || 'משחק', g.date, lineups.length === 1 ? lineups[0].name : ''].filter(Boolean).join('-');
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
$('#status').textContent = 'הנתונים נשמרים במחשב הזה';
render();
