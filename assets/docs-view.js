/* ══════════════════════════════════════════════════════════════════════
   Data & sources

   Drawn from data/docs.json, which tools/build-docs.mjs parses out of
   docs/DATA-SOURCES.md, docs/ACCURACY.md and their Chinese mirrors, and from
   data/coverage.json. Nothing here is written for the page, so it says what
   the documents say and no more.
   ══════════════════════════════════════════════════════════════════════ */

import { getLang, t, ownerLabel, lenOf, lenUnit, lenNum, esc, num } from './i18n.js';
import { app, select } from './app.js';
import { SYSTEMS } from './schema.js';
import { frame, SYS_COLOUR, DASH_CC, CC_COLOUR, bars, inline, plain } from './sheet-kit.js';
import { closeSheet, isSheetOpen } from './sheets.js';

const DOC_TABS = ['coverage', 'sources', 'decisions', 'issues', 'accuracy'];
let docsTab = 'coverage';
let docsData = null;

export function setDocsTab(tab) { if (DOC_TABS.includes(tab)) docsTab = tab; }

const isIdTable = (b) => /^(ID|编号)$/.test(b.head[0]);
const isFlagTable = (b) => /^(Country|国家)$/.test(b.head[0]) && b.head.length >= 4;

function docTable(b) {
  if (isIdTable(b) || isFlagTable(b)) {
    // Registers read better as cards: the ID or flag, the lead column as the
    // headline, and every other column as a labelled line beneath it.
    return `<div class="dc-cards">${b.rows.map((r) => {
      const kind = isFlagTable(b) ? r[2] : null;
      return `<article class="dc-card" data-q="${esc(r.join(' ').toLowerCase())}">
        <div class="dc-card-hd"><span class="dc-id">${inline(r[0])}</span><p class="dc-lead">${inline(r[1])}</p>
          ${kind ? `<span class="dc-pill ${/pending|待做/.test(kind) ? 'pend' : ''}">${inline(kind)}</span>` : ''}</div>
        <dl>${r.slice(2).map((c, i) => (isFlagTable(b) && i === 0) || !c || c === '—' ? ''
          : `<div><dt>${inline(b.head[i + 2])}</dt><dd>${inline(c)}</dd></div>`).join('')}</dl>
      </article>`;
    }).join('')}</div>`;
  }
  return `<div class="dc-tbl-w"><table class="tbl dc-tbl"><thead><tr>${b.head.map((h, i) => `<th class="${b.align[i]}">${inline(h)}</th>`).join('')}</tr></thead>
    <tbody>${b.rows.map((r) => `<tr>${r.map((c, i) => `<td class="${b.align[i]}">${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

/** Listed, drawn and absent per system, one bar each, absences split by reason. */
function coverageChart(cov) {
  const lang = getLang();
  const shades = ['#ff9f5a', '#ffd166', '#c792ea', '#7aa2ff', '#ff6b8b', '#5ad1a8'];
  const byCountry = DASH_CC.map((cc) => [cc, cov.rows.filter((r) => r.cc === cc)]).filter(([, rows]) => rows.length);
  return `<div class="cov">${byCountry.map(([cc, rows]) => `
    <section class="cov-cc">
      <h4><span class="flagdot flag-${cc}"></span>${t(`sys.country.${cc}`)}</h4>
      ${rows.map((r) => {
        const colour = SYS_COLOUR[r.system] || 'var(--cyan)';
        if (r.listed == null) {
          return `<div class="cov-row"><div class="cov-hd"><b>${r.tier[lang]}</b><span>${num(r.drawn)}</span></div>
            <p class="cov-src">${inline(r.listedBy[lang])}</p></div>`;
        }
        const pct = (n) => (n / r.listed) * 100;
        const segs = r.why.map((w, i) => ({ ...w, colour: shades[i % shades.length] }));
        return `<div class="cov-row">
          <div class="cov-hd"><b>${r.tier[lang]}</b>
            <span>${t('docs.cov.drawnOf', { d: num(r.drawn), n: num(r.listed) })}
            <em style="color:${colour}">${num(pct(r.drawn), pct(r.drawn) >= 99.95 ? 0 : 1)}%</em></span></div>
          <div class="cov-bar" role="img" aria-label="${num(r.drawn)} / ${num(r.listed)}">
            <i style="width:${pct(r.drawn)}%;background:${colour}"></i>
            ${segs.map((s) => `<i class="ab" style="width:${pct(s.n)}%;background:${s.colour}" title="${num(s.n)} · ${esc(cov.reasons[s.key][lang])}"></i>`).join('')}
          </div>
          <p class="cov-src">${t('docs.cov.listedBy')} ${inline(r.listedBy[lang])}</p>
          ${segs.length ? `<ul class="cov-why">${segs.map((s) => `<li><i style="background:${s.colour}"></i><b>${num(s.n)}</b> ${inline(cov.reasons[s.key][lang])}</li>`).join('')}</ul>` : ''}
        </div>`;
      }).join('')}
    </section>`).join('')}
    <p class="cov-note">${inline(cov.note[lang])}</p>
  </div>`;
}

function docBlocks(blocks, cov) {
  return blocks.map((b) => {
    if (b.t === 'h') return `<h${b.level + 1} class="dc-h">${inline(b.text.replace(/^\d+\.\s*/, ''))}</h${b.level + 1}>`;
    if (b.t === 'p') return `<p class="dc-p">${inline(b.text)}</p>`;
    if (b.t === 'ul' || b.t === 'ol') return `<${b.t} class="dc-list">${b.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${b.t}>`;
    if (b.t === 'table') return docTable(b);
    if (b.t === 'coverage') return cov ? coverageChart(cov) : '';
    return '';
  }).join('');
}

/* ── views drawn from the documents and data/insights.json ───────────── */

const pctTxt = (v) => (v == null ? '—' : `${num(v, v > 0 && v < 10 ? 1 : 0)}%`);
const registerRows = (docs) => docs.sources.flatMap((s) => s.blocks)
  .filter((b) => b.t === 'table' && isIdTable(b)).flatMap((b) => b.rows);

/** Share of each system's mileage that carries each attribute. */
function fieldHeatmap(ins) {
  return `<div class="dash-card dv-card"><h3>${t('dv.fields.title')}</h3><div class="in">
    <div class="dc-tbl-w"><table class="tbl dv-heat">
      <thead><tr><th></th>${ins.fields.map((f) => `<th>${t(`dv.f.${f}`)}</th>`).join('')}</tr></thead>
      <tbody>${ins.coverage.map((r) => `<tr><td><i class="lg-dot" style="--sys-col:${SYS_COLOUR[r.system]}"></i>${t(`sys.${r.system}`)}</td>
        ${ins.fields.map((f) => {
          const v = r.cells[f];
          return v == null ? '<td class="dv-na" title="—">—</td>'
            : `<td style="--a:${(0.08 + (v / 100) * 0.82).toFixed(2)}" title="${pctTxt(v)}">${pctTxt(v)}</td>`;
        }).join('')}</tr>`).join('')}</tbody>
    </table></div>
    <p class="hbar-note">${t('dv.fields.note')}</p></div></div>`;
}

/** The routes with the most unbridged gap, and each system's share broken. */
function gapRanking(ins) {
  const max = ins.gaps[0]?.gapMi || 1;
  const rows = ins.gaps.slice(0, 12).filter((r) => app.byId?.has(r.id));
  return `<div class="dash-cols">
    <div class="dash-card"><h3>${t('dv.gaps.title')}</h3><div class="in">
      <div class="hbars">${rows.map((r) => `
        <div class="hbar hbar-route" data-id="${r.id}">
          <span class="hbar-k"><b>${esc(r.label)}</b><small>${ownerLabel(r.system, r.st)} · ${t('dv.gaps.breaks', { n: num(r.breaks) })}</small></span>
          <span class="hbar-t"><i style="width:${((r.gapMi / max) * 100).toFixed(1)}%;background:${SYS_COLOUR[r.system]}"></i></span>
          <span class="hbar-v">${lenNum(r.gapMi)}</span>
        </div>`).join('')}</div>
      <p class="hbar-note">${t('dv.gaps.note', { u: lenUnit() })}</p></div></div>
    <div class="dash-card"><h3>${t('dv.broken.title')}</h3><div class="in">
      ${bars(ins.broken.map((b) => ({ k: t(`sys.${b.system}`), v: Math.round((b.broken / (b.routes || 1)) * 100), suffix: '%', sys: b.system })), (r) => SYS_COLOUR[r.sys], 100)}
      <p class="hbar-note">${t('dv.broken.note')}</p></div></div>
  </div>`;
}

/** Each register entry as a bar from the year its data describes to now. */
function freshness(docs) {
  const rows = registerRows(docs).map((r) => {
    const [ed, got] = String(r[3]).split('·').map((x) => x.trim());
    const dates = (s) => (s || '').match(/\b(19|20)\d{2}(-\d{2}-\d{2})?\b/g) || [];
    const years = dates(ed).map((d) => Number(d.slice(0, 4)));
    const retrieved = dates(got).find((d) => d.length === 10) || (dates(ed).length === 1 && dates(ed)[0].length === 10 && !got ? dates(ed)[0] : null);
    return { id: plain(r[0]), name: plain(r[1]), year: years.length ? Math.max(...years) : null, retrieved };
  });
  const now = Math.max(...rows.map((r) => Number((r.retrieved || '0').slice(0, 4))), ...rows.map((r) => r.year || 0));
  const from = Math.min(...rows.filter((r) => r.year).map((r) => r.year));
  const x = (y) => ((y - from) / (now - from || 1)) * 100;
  const ageCol = (age) => (age <= 1 ? 'var(--lime)' : age <= 3 ? 'var(--cyan)' : age <= 10 ? 'var(--amber)' : '#ff6b8b');
  return `<div class="dash-card dv-card"><h3>${t('dv.fresh.title')}</h3><div class="in">
    <div class="dv-fresh">${rows.map((r) => `
      <div class="dv-fr" title="${esc(r.name)}">
        <span class="dv-fr-id">${esc(r.id)}</span><span class="dv-fr-n">${esc(r.name)}</span>
        <span class="dv-fr-t">${r.year ? `<i style="left:${x(r.year)}%;width:${Math.max(1.2, 100 - x(r.year))}%;background:${ageCol(now - r.year)}"></i>`
          : `<em>${t('dv.fresh.undated')}</em>`}</span>
        <span class="dv-fr-y">${r.year ?? ''}${r.retrieved ? `<small>${t('dv.fresh.got', { d: r.retrieved })}</small>` : ''}</span>
      </div>`).join('')}
      <div class="dv-fr dv-fr-ax"><span></span><span></span><span class="dv-fr-t"><b style="left:0">${from}</b><b style="left:50%">${Math.round((from + now) / 2)}</b><b style="left:100%">${now}</b></span><span></span></div>
    </div>
    <p class="hbar-note">${t('dv.fresh.note')}</p></div></div>`;
}

// Which register entry feeds which system, and with what. A geometry flow
// carries the system's whole mileage; an attribute flow the share it covers.
const FLOWS = [
  ['US-1', 'geom', ['us-interstate', 'us-numbered', 'us-state']],
  ['US-6', 'traffic', ['us-interstate', 'us-numbered', 'us-state']],
  ['US-3', 'official', ['us-interstate']],
  ['US-4', 'cost', ['us-interstate']],
  ['CA-1', 'geom', ['ca-tch', 'ca-nhs', 'ca-provincial']],
  ['CA-2', 'geom', ['ca-tch', 'ca-nhs']],
  ['CA-4–10', 'traffic', ['ca-tch', 'ca-nhs', 'ca-provincial']],
  ['MX-1', 'geom', ['mx-federal', 'mx-state']],
  ['MX-3', 'traffic', ['mx-federal', 'mx-state']],
  ['TW-1', 'geom', ['tw-freeway', 'tw-provincial']],
  ['TW-2', 'official', ['tw-provincial']],
  ['HK-1', 'geom', ['hk-route']],
  ['CN-1', 'geom', ['cn-expressway', 'cn-national', 'cn-provincial']],
];

/**
 * One Sankey per country, each on its own scale: American state routes alone
 * outweigh Canada and Mexico together. A node is never shorter than its label,
 * so a band may widen or narrow across the chart; its mileage is in the tooltip.
 */
function lineagePanel(cc, ins, reg) {
  const sys = Object.fromEntries(ins.coverage.map((r) => [r.system, r]));
  const links = FLOWS.flatMap(([src, kind, to]) => to.filter((s) => sys[s]?.cc === cc).map((s) => ({
    src, kind, to: s, v: kind === 'geom' ? sys[s].mi : (sys[s].mi * (sys[s].cells[kind] || 0)) / 100,
  }))).filter((l) => l.v > 0);
  if (!links.length) return '';
  const W = 640; const NW = 9; const GAP = 8; const MIN = 26; const SPAN = 150;
  const left = [...new Set(links.map((l) => l.src))];
  const right = SYSTEMS.map((s) => s.id).filter((id) => links.some((l) => l.to === id));
  const sum = (key, id) => links.filter((l) => l[key] === id).reduce((a, l) => a + l.v, 0);
  const total = Math.max(...[left.map((id) => sum('src', id)), right.map((id) => sum('to', id))].map((xs) => xs.reduce((a, b) => a + b, 0)));
  const place = (ids, key) => {
    let y = 0;
    return Object.fromEntries(ids.map((id) => {
      const v = sum(key, id);
      const n = { y, h: Math.max(MIN, (v / total) * SPAN), v, off: 0 };
      y += n.h + GAP;
      return [id, n];
    }));
  };
  const L = place(left, 'src');
  const R = place(right, 'to');
  const H = Math.max(...[...Object.values(L), ...Object.values(R)].map((n) => n.y + n.h));
  const x0 = 200; const x1 = W - 170; const mx = (x0 + NW + x1) / 2;
  const bands = links.map((l) => {
    const a = L[l.src]; const b = R[l.to];
    const ha = (l.v / a.v) * a.h; const hb = (l.v / b.v) * b.h;
    const ya = a.y + a.off; const yb = b.y + b.off;
    a.off += ha; b.off += hb;
    const f = (n) => n.toFixed(1);
    return `<path d="M${x0 + NW},${f(ya)} C${mx},${f(ya)} ${mx},${f(yb)} ${x1},${f(yb)} L${x1},${f(yb + hb)} C${mx},${f(yb + hb)} ${mx},${f(ya + ha)} ${x0 + NW},${f(ya + ha)} Z"
      fill="${SYS_COLOUR[l.to]}" fill-opacity="${l.kind === 'geom' ? 0.4 : 0.2}">
      <title>${esc(l.src)} → ${esc(t(`sys.${l.to}`))} · ${t(`dv.flow.${l.kind}`)} · ${num(lenOf(l.v))} ${lenUnit()}</title></path>`;
  }).join('');
  const name = (id) => (reg.get(id) || reg.get(id.split('–')[0]) || '').replace(/[,(].*$/, '').slice(0, 30);
  return `<div class="dv-sk-cc"><p class="dash-sub"><span class="flagdot flag-${cc}"></span>${t(`sys.country.${cc}`)}</p>
    <svg class="dv-sankey" viewBox="0 0 ${W} ${Math.ceil(H)}" role="img">${bands}
      ${left.map((id) => `<rect x="${x0}" y="${L[id].y.toFixed(1)}" width="${NW}" height="${L[id].h.toFixed(1)}" rx="2" class="dv-node"/>
        <text x="${x0 - 8}" y="${(L[id].y + L[id].h / 2 - 5).toFixed(1)}" text-anchor="end" dominant-baseline="middle"><tspan class="dv-sk-id">${esc(id)}</tspan><tspan x="${x0 - 8}" dy="12" class="dv-sk-n">${esc(name(id))}</tspan></text>`).join('')}
      ${right.map((id) => `<rect x="${x1}" y="${R[id].y.toFixed(1)}" width="${NW}" height="${R[id].h.toFixed(1)}" rx="2" fill="${SYS_COLOUR[id]}"/>
        <text x="${x1 + NW + 8}" y="${(R[id].y + R[id].h / 2 - 5).toFixed(1)}" dominant-baseline="middle"><tspan>${esc(t(`sys.${id}`))}</tspan><tspan x="${x1 + NW + 8}" dy="12" class="dv-sk-n">${num(lenOf(sys[id].mi))} ${lenUnit()}</tspan></text>`).join('')}
    </svg></div>`;
}

function lineage(ins) {
  const reg = new Map(registerRows(docsData.docs[getLang()] || docsData.docs.en).map((r) => [plain(r[0]), plain(r[1])]));
  return `<div class="dash-card dv-card"><h3>${t('dv.flow.title')}</h3><div class="in dv-sk">
    ${DASH_CC.map((cc) => lineagePanel(cc, ins, reg)).join('')}
    <p class="hbar-note">${t('dv.flow.note')}</p></div></div>`;
}

const VERDICT_COLOUR = {
  covered: 'var(--lime)', agree: 'var(--lime)', present: 'var(--lime)',
  otherSystem: 'var(--cyan)', otherNumber: 'var(--cyan)', numberOnly: 'var(--amber)',
  short: '#c792ea', notInTiger: '#7a8ca6', notFound: '#ff6b8b', absent: '#ff6b8b', inTiger: '#ff6b8b', differs: 'var(--amber)',
};

function crosschecks(ins) {
  const c = ins.crosscheck;
  const LEN_COLOUR = ['#ff6b8b', '#ff9f5a', 'var(--amber)', 'var(--cyan)', 'var(--lime)', 'var(--cyan)', 'var(--amber)', '#ff9f5a', '#ff6b8b'];
  const binLabel = (b) => (b.lo == null ? `< ${b.hi}%` : b.hi == null ? `> +${b.lo}%` : b.lo === -2 ? '±2%' : `${b.lo > 0 ? '+' : ''}${b.lo}…${b.hi > 0 ? '+' : ''}${b.hi}%`);
  const rows = [
    { k: 'len', segs: ins.lengths.bins.map((b, i) => ({ n: b.n, label: binLabel(b), colour: LEN_COLOUR[i] })) },
    { k: 'usn', segs: ['covered', 'otherSystem', 'notInTiger', 'short', 'inTiger'].map((v) => ({ v, n: c.usNumbered[v] })) },
    { k: 'us', segs: ['covered', 'otherSystem', 'notInTiger', 'short', 'inTiger'].map((v) => ({ v, n: c.usState[v] })) },
    { k: 'mxf', segs: ['present', 'absent'].map((v) => ({ v, n: c.mxFederal[v] })) },
    { k: 'mx', segs: ['agree', 'otherNumber', 'numberOnly', 'notFound'].map((v) => ({ v, n: c.mxState[v] })) },
    { k: 'tch', segs: [{ v: 'agree', n: c.tch.agree }, { v: 'differs', n: c.tch.listed - c.tch.agree }] },
  ].map((r) => ({ ...r, segs: r.segs.filter((s) => s.n > 0) }));
  return `<div class="dash-card dv-card"><h3>${t('dv.cross.title')}</h3><div class="in dv-cross">${rows.map((r) => {
    const tot = r.segs.reduce((a, s) => a + s.n, 0);
    const lab = (s) => s.label || t(`dv.v.${s.v}`);
    return `<div class="dv-x"><div class="cov-hd"><b>${t(`dv.cross.${r.k}`)}</b><span>${num(tot)}</span></div>
      <div class="stack">${r.segs.map((s) => `<i style="flex:${s.n};background:${s.colour || VERDICT_COLOUR[s.v]}" title="${esc(lab(s))} · ${num(s.n)}"></i>`).join('')}</div>
      <ul class="stack-key">${r.segs.map((s) => `<li><i style="background:${s.colour || VERDICT_COLOUR[s.v]}"></i>${esc(lab(s))}<b>${num(s.n)}</b></li>`).join('')}</ul></div>`;
  }).join('')}
  <p class="hbar-note">${t('dv.cross.note')}</p></div></div>`;
}

/* Decisions: where each is enforced, for which country, and what it cites. */

const STAGES = ['fetch', 'ref', 'read', 'stitch', 'build', 'check', 'page'];
const REGIONS = ['all', 'us', 'ca', 'mx', 'ea', 'layers'];

function stagesOf(enforced) {
  const out = new Set();
  for (const f of String(enforced).match(/[\w.-]+\.(mjs|js|json)\b/g) || []) {
    if (/^fetch-/.test(f)) out.add('fetch');
    else if (/\.json$/.test(f)) out.add('ref');
    else if (/^geo\.mjs$/.test(f)) out.add('stitch');
    else if (/^build-/.test(f)) out.add('build');
    else if (/^(check-|coverage-figures|readme-figures|verify)/.test(f)) out.add('check');
    else if (/\.mjs$/.test(f)) out.add('read');
    else out.add('page');
  }
  return [...out];
}

function decisionIndex(docs) {
  const list = [];
  let region = -1;
  for (const b of docs.decisions.flatMap((s) => s.blocks)) {
    if (b.t === 'h') region++;
    if (b.t !== 'table' || !isIdTable(b)) continue;
    for (const r of b.rows) {
      const id = plain(r[0]);
      const n = Number(id.replace(/\D/g, ''));
      const cites = [...new Set((`${r[1]} ${r[2]}`.match(/D-\d+/g) || []).filter((d) => d !== id))];
      list.push({ id, n, region: REGIONS[Math.max(0, Math.min(REGIONS.length - 1, region))], stages: stagesOf(r[r.length - 1]), cites });
    }
  }
  return list;
}

function decisionViews(docs) {
  const ds = decisionIndex(docs);
  const regLabel = (r) => (['us', 'ca', 'mx'].includes(r) ? t(`sys.country.${r}`) : t(`dv.reg.${r}`));
  const count = (st, rg) => ds.filter((d) => (!st || d.stages.includes(st)) && (!rg || d.region === rg));
  const maxCell = Math.max(1, ...STAGES.flatMap((s) => REGIONS.map((r) => count(s, r).length)));
  const REG_COLOUR = { all: '#e6edf6', us: CC_COLOUR.us, ca: CC_COLOUR.ca, mx: '#6ef7a5', ea: CC_COLOUR.hk, layers: '#c792ea' };

  const W = 640; const H = 150; const base = H - 26;
  const sorted = ds.slice().sort((a, b) => a.n - b.n);
  const xOfD = new Map(sorted.map((d, i) => [d.id, 14 + (i / Math.max(1, sorted.length - 1)) * (W - 28)]));
  const arcs = ds.flatMap((d) => d.cites.filter((c) => xOfD.has(c)).map((c) => {
    const a = xOfD.get(d.id); const b = xOfD.get(c);
    const r = Math.abs(a - b) / 2;
    return `<path data-a="${d.id}" data-b="${c}" d="M${a.toFixed(1)},${base} A${r.toFixed(1)},${Math.min(r, base - 6).toFixed(1)} 0 0 ${a < b ? 1 : 0} ${b.toFixed(1)},${base}" stroke="${REG_COLOUR[d.region]}"/>`;
  })).join('');

  return `<div class="dash-card dv-card"><h3>${t('dv.pipe.title')}</h3><div class="in">
    <div class="dv-pipe">${STAGES.map((s, i) => `${i ? '<span class="dv-arrow">→</span>' : ''}<button class="dv-stage" type="button" data-stage="${s}">
      <b>${count(s).length}</b><span>${t(`dv.stage.${s}`)}</span></button>`).join('')}</div>
    <div class="dc-tbl-w"><table class="tbl dv-mtx"><thead><tr><th></th>${STAGES.map((s) => `<th>${t(`dv.stage.${s}`)}</th>`).join('')}</tr></thead>
      <tbody>${REGIONS.map((r) => `<tr><td><button class="dv-reg" type="button" data-region="${r}"><i style="background:${REG_COLOUR[r]}"></i>${regLabel(r)}</button></td>${STAGES.map((s) => {
        const n = count(s, r).length;
        return `<td>${n ? `<button class="dv-cell" type="button" data-stage="${s}" data-region="${r}" style="--a:${(0.15 + (n / maxCell) * 0.75).toFixed(2)}">${n}</button>` : ''}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table></div>
    <p class="hbar-note">${t('dv.pipe.note')}</p></div></div>
  <div class="dash-card dv-card"><h3>${t('dv.ref.title')}</h3><div class="in">
    <svg class="dv-arcs" viewBox="0 0 ${W} ${H}" role="img">${arcs}
      ${sorted.map((d) => `<g class="dv-dn" data-id="${d.id}"><circle cx="${xOfD.get(d.id).toFixed(1)}" cy="${base}" r="${3 + Math.min(4, ds.filter((o) => o.cites.includes(d.id)).length)}" fill="${REG_COLOUR[d.region]}"><title>${d.id}</title></circle>
        ${d.n % 5 === 0 || d.n === 1 ? `<text x="${xOfD.get(d.id).toFixed(1)}" y="${base + 18}" text-anchor="middle">${d.id}</text>` : ''}</g>`).join('')}
    </svg>
    <ul class="stack-key">${REGIONS.map((r) => `<li><i style="background:${REG_COLOUR[r]}"></i>${regLabel(r)}</li>`).join('')}</ul>
    <p class="hbar-note">${t('dv.ref.note')}</p></div></div>
  <div class="dv-filter-bar" hidden><span id="dvFilterTxt"></span><button class="btn" type="button" id="dvClear">${t('dv.filter.clear')}</button></div>`;
}

function wireDecisionViews(body, docs) {
  const ds = decisionIndex(docs);
  const bar = body.querySelector('.dv-filter-bar');
  const apply = (ids) => {
    for (const c of body.querySelectorAll('.dc-card')) {
      const id = c.querySelector('.dc-id')?.textContent.trim();
      c.hidden = Boolean(ids) && !ids.has(id);
    }
    bar.hidden = !ids;
    if (ids) {
      body.querySelector('#dvFilterTxt').textContent = t('dv.filter.on', { n: num(ids.size) });
      body.querySelector('.dc-card:not([hidden])')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  let key = null;
  const toggle = (k, ids) => { key = key === k ? null : k; apply(key ? ids : null); };
  for (const b of body.querySelectorAll('[data-stage], [data-region]')) {
    b.addEventListener('click', () => {
      const st = b.dataset.stage; const rg = b.dataset.region;
      toggle(`${st}|${rg}`, new Set(ds.filter((d) => (!st || d.stages.includes(st)) && (!rg || d.region === rg)).map((d) => d.id)));
    });
  }
  for (const g of body.querySelectorAll('.dv-dn')) {
    g.addEventListener('click', () => {
      const d = ds.find((x) => x.id === g.dataset.id);
      toggle(d.id, new Set([d.id, ...d.cites, ...ds.filter((o) => o.cites.includes(d.id)).map((o) => o.id)]));
    });
  }
  body.querySelector('#dvClear').addEventListener('click', () => { key = null; apply(null); });
}

// A known gap's topic, read from its English title; the Chinese register is
// the same table row for row, so the topic carries across by position.
const GAP_TOPICS = [
  ['crossings', /crossing/i],
  ['tolls', /toll|fare|concession|CAPUFE/i],
  ['traffic', /traffic|counts/i],
  ['history', /opening|timeline/i],
  ['place', /which state|route ends|which road/i],
  ['attrs', /speed/i],
  ['interface', /interface/i],
  ['roads', /./],
];
const TOPIC_COLOUR = {
  roads: '#7aa2ff', place: '#c792ea', traffic: '#35e7ff', history: '#ffd166',
  tolls: '#ffb545', crossings: '#ff6b8b', attrs: '#5ad1a8', interface: '#7a8ca6',
};

/** The accuracy document's register of known gaps, by country and topic. */
function gapKinds(docs) {
  const tableOf = (d) => d.accuracy.flatMap((s) => s.blocks).find((b) => b.t === 'table' && isFlagTable(b));
  const table = tableOf(docs);
  const en = tableOf(docsData.docs.en);
  if (!table || !en) return '';
  const FLAG = { '🇺🇸': 'us', '🇨🇦': 'ca', '🇲🇽': 'mx', CN: 'cn', TW: 'tw', HK: 'hk' };
  const rows = table.rows.map((r, i) => {
    const flags = plain(r[0]).split(/\s+/).map((f) => FLAG[f]).filter(Boolean);
    return {
      cc: flags.length === 1 ? flags[0] : 'all',
      topic: GAP_TOPICS.find(([, rx]) => rx.test(en.rows[i]?.[1] || ''))[0],
      pending: /pending/i.test(en.rows[i]?.[2] || ''),
      title: plain(r[1]),
    };
  });
  const topics = GAP_TOPICS.map(([k]) => k).filter((k) => rows.some((r) => r.topic === k));
  const byCc = [...DASH_CC, 'all'].map((cc) => ({ cc, rows: rows.filter((r) => r.cc === cc) })).filter((c) => c.rows.length);
  const max = Math.max(...byCc.map((c) => c.rows.length));
  const pending = rows.filter((r) => r.pending).length;
  return `<div class="dash-card dv-card"><h3>${t('dv.gk.title', { n: num(rows.length) })}</h3><div class="in">
    <div class="cc-rows">${byCc.map((c) => `<div class="cc-row">
      <div class="cc-hd">${c.cc === 'all' ? '' : `<span class="flagdot flag-${c.cc}"></span>`}<b>${c.cc === 'all' ? t('dv.gk.shared') : t(`sys.country.${c.cc}`)}</b><span>${num(c.rows.length)}</span></div>
      <div class="stack dv-gk" style="width:${((c.rows.length / max) * 100).toFixed(1)}%">${topics.flatMap((k) => c.rows.filter((r) => r.topic === k)
        .map((r) => `<i class="${r.pending ? 'pend' : ''}" style="flex:1;background:${TOPIC_COLOUR[k]}" title="${esc(r.title)}"></i>`)).join('')}</div>
    </div>`).join('')}</div>
    <ul class="stack-key">${topics.map((k) => `<li><i style="background:${TOPIC_COLOUR[k]}"></i>${t(`dv.gk.${k}`)}<b>${num(rows.filter((r) => r.topic === k).length)}</b></li>`).join('')}
      ${pending ? `<li><i class="pend" style="background:var(--ink-faint)"></i>${t('dv.gk.pending')}<b>${num(pending)}</b></li>` : ''}</ul>
    <p class="hbar-note">${t('dv.gk.note')}</p></div></div>`;
}

function docViews(tab, docs, ins) {
  if (tab === 'coverage') return ins ? fieldHeatmap(ins) + gapRanking(ins) : '';
  if (tab === 'sources') return freshness(docs) + (ins ? lineage(ins) + crosschecks(ins) : '');
  if (tab === 'decisions') return decisionViews(docs);
  if (tab === 'accuracy') return gapKinds(docs);
  return '';
}

export function renderDocs() {
  return frame('docs.title', 'docs.sub', `
    <div class="nb-tabs dc-tabs" role="tablist">${DOC_TABS.map((k) => `<button class="btn" data-dc="${k}" type="button" role="tab">${t(`docs.tab.${k}`)}</button>`).join('')}</div>
    <div class="dc-filter" hidden><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4.3-4.3"/></svg>
      <input id="dcQ" type="search" autocomplete="off" spellcheck="false"></div>
    <div id="dcBody" class="dc-body"><p class="dc-p">${t('docs.loading')}</p></div>`);
}

export async function wireDocs() {
  if (!docsData) {
    const [docs, cov, ins] = await Promise.all([
      fetch('data/docs.json').then((r) => r.json()),
      fetch('data/coverage.json').then((r) => r.json()).catch(() => null),
      fetch('data/insights.json').then((r) => r.json()).catch(() => null),
    ]);
    docsData = { docs, cov, ins };
  }
  if (isSheetOpen() !== 'docs') return;
  const body = document.getElementById('dcBody');
  const filter = document.querySelector('.dc-filter');
  const q = document.getElementById('dcQ');
  q.placeholder = t('docs.filter');
  const paint = (tab) => {
    docsTab = tab;
    const docs = docsData.docs[getLang()];
    const secs = docs[tab];
    body.innerHTML = `<div class="dv">${docViews(tab, docs, docsData.ins)}</div>`
      + secs.map((s) => `<section class="dc-sec">${secs.length > 1 ? `<h3 class="dc-h dc-h2">${inline(s.title)}</h3>` : ''}
      ${docBlocks(s.blocks, docsData.cov)}</section>`).join('');
    for (const row of body.querySelectorAll('.hbar-route[data-id]')) {
      row.addEventListener('click', () => { closeSheet(); select(row.dataset.id); });
    }
    if (tab === 'decisions') wireDecisionViews(body, docs);
    const filterable = body.querySelectorAll('.dc-card').length > 8;
    filter.hidden = !filterable;
    q.value = '';
    document.querySelector('.sh-bd').scrollTop = 0;
  };
  q.addEventListener('input', () => {
    const v = q.value.trim().toLowerCase();
    for (const c of body.querySelectorAll('.dc-card')) c.hidden = Boolean(v) && !c.dataset.q.includes(v);
  });
  for (const tab of document.querySelectorAll('[data-dc]')) {
    tab.classList.toggle('on', tab.dataset.dc === docsTab);
    tab.addEventListener('click', () => {
      for (const o of document.querySelectorAll('[data-dc]')) o.classList.toggle('on', o === tab);
      paint(tab.dataset.dc);
    });
  }
  paint(docsTab);
}
