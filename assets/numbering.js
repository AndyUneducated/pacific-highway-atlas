/* The numbering explainer: each country's numbering rules drawn from the
   atlas's own positions. */

import { getLang, t, dist, routeLabel, esc, num } from './i18n.js';
import { app, select, shieldHtml } from './app.js';
import { frame, L } from './sheet-kit.js';
import { closeSheet } from './sheets.js';

const VW = 620;
const VH = 330;

// The lower 48, and the band of the St Lawrence that Québec's autoroutes sit
// in. Two boxes rather than one continental frame: at continental scale the
// Québec grid collapses into the top-right corner and the thing the diagram is
// there to show stops being legible.
const US_BOX = { lon0: -125.5, lon1: -66.5, lat0: 24.0, lat1: 49.5 };
const QC_BOX = { lon0: -79.8, lon1: -66.2, lat0: 44.9, lat1: 49.3 };

const xOf = (lon, b = US_BOX) => ((lon - b.lon0) / (b.lon1 - b.lon0)) * VW;
const yOf = (lat, b = US_BOX) => VH - ((lat - b.lat0) / (b.lat1 - b.lat0)) * VH;

/**
 * Pick the primary routes of a system and sort them by position.
 *
 * The diagram is drawn from the real mapped positions rather than from a
 * hand-drawn sketch, so the pattern it claims is the pattern in the data: if
 * I-5 did not sit on the west coast, the diagram would show that.
 */
function gridRoutes(sys, orientation) {
  const rows = app.index.filter((r) => r.sys === sys && r.tier === 'primary'
    && r.base != null && r.base < 100 && r.mi > 180);
  const odd = rows.filter((r) => r.base % 2 === 1);
  const even = rows.filter((r) => r.base % 2 === 0);
  const set = orientation === 'ns' ? odd : even;
  // One entry per number: keep the longest where a number appears twice.
  const best = new Map();
  for (const r of set) {
    const prev = best.get(r.base);
    if (!prev || r.mi > prev.mi) best.set(r.base, r);
  }
  return [...best.values()].sort((a, b) => (orientation === 'ns' ? a.cx - b.cx : a.cy - b.cy));
}

/**
 * Québec's two-digit autoroutes, which are the one Canadian set with a grid to
 * draw.
 *
 * Scoped to the two-digit numbers on purpose. The ministry's own directory says
 * the ordering principle "s'applique seulement aux autoroutes 5 à 85", so
 * drawing the 400–999 series on the same axes would illustrate a rule that
 * Québec does not claim for them.
 */
function qcAutoroutes(orientation) {
  const rows = app.index.filter((r) => r.st === 'QC' && /^A-\d+$/.test(r.label)
    && r.base != null && r.base >= 5 && r.base <= 85);
  const set = rows.filter((r) => (orientation === 'ns' ? r.base % 2 === 1 : r.base % 2 === 0));
  const best = new Map();
  for (const r of set) {
    const prev = best.get(r.base);
    if (!prev || r.mi > prev.mi) best.set(r.base, r);
  }
  return [...best.values()].sort((a, b) => (orientation === 'ns' ? a.cx - b.cx : a.cy - b.cy));
}

/** The extent the given routes actually occupy, padded so nothing sits on the edge. */
function boxOf(routes, pad = 0.6) {
  const xs = routes.map((r) => r.cx);
  const ys = routes.map((r) => r.cy);
  return {
    lon0: Math.min(...xs) - pad, lon1: Math.max(...xs) + pad,
    lat0: Math.min(...ys) - pad, lat1: Math.max(...ys) + pad,
  };
}

function numberingDiagram(sys, opts = {}) {
  const box = opts.box ?? US_BOX;
  const colour = opts.colour ?? (sys === 'us-interstate' ? '#35e7ff' : '#ffb545');
  const pick = opts.pick ?? ((o) => gridRoutes(sys, o));
  const ns = pick('ns');
  const ew = pick('ew');

  // A graticule at whatever spacing gives the box a handful of lines, so the
  // Québec frame is not either bare or a grid of solid fill.
  const grid = [];
  const lonStep = opts.lonStep ?? 10;
  const latStep = opts.latStep ?? 5;
  for (let lon = Math.ceil(box.lon0 / lonStep) * lonStep; lon <= box.lon1; lon += lonStep) {
    const x = xOf(lon, box).toFixed(1);
    grid.push(`<line class="nb-grid-line" x1="${x}" y1="0" x2="${x}" y2="${VH}"/>`);
  }
  for (let lat = Math.ceil(box.lat0 / latStep) * latStep; lat <= box.lat1; lat += latStep) {
    const y = yOf(lat, box).toFixed(1);
    grid.push(`<line class="nb-grid-line" x1="0" y1="${y}" x2="${VW}" y2="${y}"/>`);
  }

  // Every route gets a line; not every route can get a label. East of the
  // Mississippi the spacing between numbers is a few pixels, and labelling all
  // of them turned the top of the diagram into a smear. Labels are placed in
  // order of importance — the multiples of five are the long-haul spines the
  // panel beside this is explaining — and any that would collide with one
  // already placed is dropped. The line stays, so nothing disappears.
  // Reports whether the position was still free, and claims it if so. It used
  // to return a `weight` argument that no call site ever passed, so it answered
  // undefined every time and the diagram has been running without any labels at
  // all. The ranking it was presumably meant to carry is done by `byRank`.
  const labeller = (gap) => {
    const placed = [];
    return (pos) => {
      if (placed.some((p) => Math.abs(p - pos) < gap)) return false;
      placed.push(pos);
      return true;
    };
  };
  const byRank = (rs) => [...rs].sort((a, b) => (Number(a.base) % 5) - (Number(b.base) % 5));

  const lines = [];
  const labels = [];
  const fitsX = labeller(opts.gapX ?? 13);
  for (const r of byRank(ns)) {
    if (fitsX(xOf(r.cx, box))) {
      labels.push(`<text class="nb-lab" data-n="${r.base}" x="${xOf(r.cx, box).toFixed(1)}" y="9" text-anchor="middle">${r.base}</text>`);
    }
  }
  for (const r of ns) {
    const x = xOf(r.cx, box);
    lines.push(`<line class="nb-route" data-n="${r.base}" data-id="${r.id}" stroke="${colour}"
      x1="${x.toFixed(1)}" y1="14" x2="${x.toFixed(1)}" y2="${VH - 6}"><title>${r.label}</title></line>`);
  }
  const fitsY = labeller(opts.gapY ?? 9);
  for (const r of byRank(ew)) {
    if (fitsY(yOf(r.cy, box))) {
      labels.push(`<text class="nb-lab" data-n="${r.base}" x="${VW - 15}" y="${(yOf(r.cy, box) + 3).toFixed(1)}">${r.base}</text>`);
    }
  }
  for (const r of ew) {
    const y = yOf(r.cy, box);
    lines.push(`<line class="nb-route" data-n="${r.base}" data-id="${r.id}" stroke="${colour}" opacity="0.8"
      x1="6" y1="${y.toFixed(1)}" x2="${(VW - 20).toFixed(1)}" y2="${y.toFixed(1)}"><title>${r.label}</title></line>`);
  }
  // Labels last, so they sit above every line rather than behind half of them.
  lines.push(...labels);

  const west = ns[0];
  const east = ns[ns.length - 1];
  const south = ew[0];
  const north = ew[ew.length - 1];

  return {
    svg: `<svg viewBox="-4 0 ${VW + 30} ${VH + 6}">${grid.join('')}${lines.join('')}</svg>`,
    west, east, south, north,
  };
}

/* The page is a country first and a system second. Which country it opens on
   follows the map: whoever is looking at Taiwan is not asking about Ohio. */
const NB_COUNTRIES = [
  { cc: 'us', tabs: ['us-interstate', 'us-numbered', 'aux'], sample: (r) => r.label === 'I-95' },
  { cc: 'ca', tabs: ['ca'], sample: (r) => r.sys === 'ca-tch' && r.num === '1' },
  { cc: 'mx', tabs: ['mx-federal'], sample: (r) => r.id === 'mex-015' },
  { cc: 'cn', tabs: ['cn-expressway', 'cn-national', 'cn-provincial'], sample: (r) => r.id === 'cn-g4' },
  { cc: 'tw', tabs: ['tw-freeway', 'tw-provincial'], sample: (r) => r.id === 'tw-fwy-1' },
  { cc: 'hk', tabs: ['hk-route'], sample: (r) => r.id === 'hk-9' },
];
const NB_TAB_KEY = { 'us-interstate': 'nb.tab.i', 'us-numbered': 'nb.tab.us', aux: 'nb.tab.aux', ca: 'nb.tab.ca' };
const NB_CC_SYS = { us: 'us-interstate', ca: 'ca-tch', mx: 'mx-federal', cn: 'cn-expressway', tw: 'tw-freeway', hk: 'hk-route' };
const regionOfCc = (cc) => (['cn', 'tw', 'hk'].includes(cc) ? 'ea' : 'na');

// Rough boxes, enough to tell which country the middle of the view is over.
function nbCountryInView() {
  const c = app.map?.getCenter();
  if (app.region === 'ea') {
    if (c && c.lng > 119.2 && c.lng < 122.4 && c.lat > 21.7 && c.lat < 25.6) return 'tw';
    if (c && c.lng > 113.8 && c.lng < 114.5 && c.lat > 22.1 && c.lat < 22.6) return 'hk';
    return 'cn';
  }
  if (c && ((c.lat > 49.2 && c.lng > -141) || (c.lat > 45.3 && c.lng > -80 && c.lng < -52))) return 'ca';
  if (c && c.lat < 25.8 && c.lng > -118 && c.lng < -86.7) return 'mx';
  return 'us';
}

let nbCountry = null;
let nbOpenedFor = null;
const nbTabOf = {};

export function renderNumbering() {
  // Reopened for the same view - a language switch rebuilds the sheet - the
  // reader stays where they were; opened over a different country, it follows.
  const here = nbCountryInView();
  if (here !== nbOpenedFor) { nbCountry = here; nbOpenedFor = here; }
  const order = [...NB_COUNTRIES].sort((a, b) => (regionOfCc(b.cc) === app.region) - (regionOfCc(a.cc) === app.region));
  const rail = order.map((c) => {
    const row = app.index.find(c.sample);
    return `<button class="nb-cc${c.cc === nbCountry ? ' on' : ''}" data-cc="${c.cc}" type="button" style="--cc:var(--c-${NB_CC_SYS[c.cc]})">
      <span class="nb-cc-shield">${row ? shieldHtml(row, true) : ''}</span>
      <span class="nb-cc-t"><i class="flagdot flag-${c.cc}"></i><b>${t(`sys.country.${c.cc}`)}</b>
        <small>${c.tabs.length > 1 ? t('nb.systems', { n: c.tabs.length }) : t(NB_TAB_KEY[c.tabs[0]] || `sys.${c.tabs[0]}`)}</small></span>
    </button>`;
  }).join('');
  const body = `
    <div class="nb-rail" role="tablist">${rail}</div>
    <div class="nb-tabs" id="nbTabs"></div>
    <div id="nbBody"></div>`;
  return frame('nb.title', 'nb.sub', body);
}

function nbPane(kind) {
  if (kind === 'aux') return nbAuxPane();
  if (kind === 'ca') return nbCanadaPane();
  if (kind === 'cn-provincial') return nbProvincialPane();
  if (PLATES[kind]) return nbPlatePane(kind);
  const d = numberingDiagram(kind);
  const zh = getLang() === 'zh';
  const isI = kind === 'us-interstate';

  const rules = isI
    ? [
      zh ? ['奇数=南北向', `编号自西向东递增。最西是 <b>I-${d.west?.base}</b>，最东是 <b>I-${d.east?.base}</b>。`]
        : ['Odd numbers run north–south', `They climb from west to east: <b>I-${d.west?.base}</b> nearest the Pacific, <b>I-${d.east?.base}</b> nearest the Atlantic.`],
      zh ? ['偶数=东西向', `编号自南向北递增。最南是 <b>I-${d.south?.base}</b>，最北是 <b>I-${d.north?.base}</b>。`]
        : ['Even numbers run east–west', `They climb from south to north: <b>I-${d.south?.base}</b> along the Gulf, <b>I-${d.north?.base}</b> along the northern tier.`],
      zh ? ['尾数 0 与 5', '以 0 或 5 结尾的号码留给贯穿全国的主干线，例如 I-10、I-95、I-5。']
        : ['Multiples of five', 'Numbers ending in 0 or 5 were reserved for the long-haul, coast-to-coast and border-to-border spines.'],
    ]
    : [
      zh ? ['奇数=南北向', `与州际公路<b>完全相反</b>：编号自东向西递增。最东是 <b>US ${d.west && d.east ? d.east.base : ''}</b>… 实际上 US 1 紧贴大西洋岸。`]
        : ['Odd numbers run north–south', 'Deliberately the <b>reverse</b> of the Interstates: numbers climb from east to west, so US 1 hugs the Atlantic.'],
      zh ? ['偶数=东西向', '同样相反：编号自北向南递增。US 2 沿加拿大边境，号码越大越靠南。']
        : ['Even numbers run east–west', 'Also reversed: numbers climb from north to south. US 2 tracks the Canadian border; the high numbers sit near the Gulf.'],
      zh ? ['为什么要相反', '1956 年州际系统开建时，美国国道网已经用了三十年。刻意反向编号，是为了让司机一眼就能分清两套系统，避免在同一走廊上把 US 50 和 I-50 搞混。']
        : ['Why invert it', 'The US route grid was already thirty years old when the Interstates began in 1956. Reversing the new grid meant a driver could never confuse the two systems in the same corridor.'],
    ];

  return `${anatomy(kind)}<div class="nb-wrap">
    <div class="nb-viz">${d.svg}
      <p style="margin:10px 2px 0;font-family:var(--mono);font-size:9.5px;color:var(--ink-faint)">
        ${zh ? '每条线的位置来自该公路在本图谱中的实测中心坐标' : 'Each line is placed at the route’s measured centre position in this atlas'}
      </p>
    </div>
    <div class="nb-note">
      <h4>${t(isI ? 'nb.i.h' : 'nb.us.h')}</h4>
      ${rules.map(([k, v], i) => `<div class="nb-rule">
        <span class="nb-rule-n">${i + 1}</span>
        <span class="nb-rule-t"><b>${k}</b><br>${v}</span>
      </div>`).join('')}
    </div>
  </div>`;
}

function nbAuxPane() {
  const zh = getLang() === 'zh';
  // Real examples pulled from the index so the counts are not asserted blindly.
  const aux = app.index.filter((r) => r.sys === 'us-interstate' && r.tier === 'auxiliary');
  const byParent = new Map();
  for (const r of aux) {
    const parent = String(r.base).slice(-2);
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent).push(r);
  }
  const dup = new Map();
  for (const r of aux) {
    if (!dup.has(r.base)) dup.set(r.base, new Set());
    dup.get(r.base).add(r.st);
  }
  const mostReused = [...dup.entries()].sort((a, b) => b[1].size - a[1].size).slice(0, 5);

  return `${anatomy('aux')}<div class="nb-wrap">
    <div class="nb-viz" style="padding:18px">
      <svg viewBox="0 0 360 200">
        <line class="nb-grid-line" x1="20" y1="150" x2="340" y2="150"/>
        <text class="nb-lab" x="20" y="168">I-75</text>
        <path class="nb-route" stroke="#35e7ff" d="M20 150 H340" stroke-width="3"/>
        <path class="nb-route" stroke="#6ef7a5" d="M110 150 C130 96 190 96 210 150" stroke-width="2.2"/>
        <text class="nb-lab hot" x="150" y="92">I-275</text>
        <path class="nb-route" stroke="#ffb545" d="M250 150 C262 120 276 108 292 104" stroke-width="2.2"/>
        <text class="nb-lab hot" x="296" y="102">I-175</text>
        <text class="nb-lab" x="20" y="26">${zh ? '偶数首位 → 环线，两端都回到主路' : 'Even first digit → loop, rejoins the parent at both ends'}</text>
        <text class="nb-lab" x="20" y="42">${zh ? '奇数首位 → 支线，只有一端连主路' : 'Odd first digit → spur, meets the parent at one end only'}</text>
      </svg>
    </div>
    <div class="nb-note">
      <h4>${t('nb.aux.h')}</h4>
      <div class="nb-rule"><span class="nb-rule-n">1</span><span class="nb-rule-t">
        <b>${zh ? '后两位是“父路”' : 'The last two digits name the parent'}</b><br>
        ${zh ? 'I-275 服务 I-75，I-405 服务 I-5。' : 'I-275 serves I-75; I-405 serves I-5.'}
      </span></div>
      <div class="nb-rule"><span class="nb-rule-n">2</span><span class="nb-rule-t">
        <b>${zh ? '首位奇偶决定形态' : 'The first digit says loop or spur'}</b><br>
        ${zh ? '偶数首位是绕城环线，两头都接回主路；奇数首位是插入市区的支线，只有一头接主路。'
    : 'An even first digit is a beltway that returns to its parent; an odd one is a spur that dead-ends downtown.'}
      </span></div>
      <div class="nb-rule"><span class="nb-rule-n">3</span><span class="nb-rule-t">
        <b>${zh ? '号码可以在各州重复使用' : 'The numbers are reused between states'}</b><br>
        ${zh ? '这是设计使然，而不是错误。本图谱中重复最多的是：' : 'By design, not by mistake. The most reused in this atlas:'}<br>
        ${mostReused.map(([base, sts]) => `<b>I-${base}</b> — ${sts.size} ${zh ? '个州' : 'states'}`).join('<br>')}
      </span></div>
      <div class="nb-rule"><span class="nb-rule-n">4</span><span class="nb-rule-t">
        <b>${zh ? '本图谱收录' : 'In this atlas'}</b><br>
        ${zh ? `共 <b>${aux.length}</b> 条三位数州际公路。` : `<b>${aux.length}</b> three-digit Interstate routes.`}
      </span></div>
    </div>
  </div>`;
}

/* Canada is not a third grid, and the panel would be lying if it drew one.
   Numbering is a provincial power, there is no federal numbering authority, and
   the thirteen answers run from written into regulation to a ministry saying in
   public that no system exists. So the pane is built around that spread rather
   than around a rule: one diagram, because exactly one province has a grid, and
   a ladder that says what each of the others actually publishes. */

const CA_LADDER = [
  ['QC', 'stated', { en: 'Parity, direction and the three-digit rule, all published by the ministry', zh: '奇偶、方向与三位数规则，均由交通部公布' }],
  ['MB', 'codified', { en: 'The power to number is in the Act and the numbers are in regulation — but there is no pattern to codify', zh: '编号权限写进法案、号码写进条例——但没有任何模式可供成文' }],
  ['PE', 'codified', { en: 'Road classes are set in regulation, naming each road rather than a number range', zh: '道路等级由条例设定，逐条列名而非划定号段' }],
  ['NB', 'stated', { en: 'Arterial 1–99, collector 100–199, local 200–999', zh: '干线 1–99、集散 100–199、地方 200–999' }],
  ['NS', 'stated', { en: '100-series arterial, trunk 1–66, collector 200–399', zh: '100 系为干线、1–66 为主干、200–399 为集散' }],
  ['AB', 'stated', { en: 'Two series, 1–216 and 500–986, assigned by Ministerial Order. The directional logic is not in any document I could find', zh: '1–216 与 500–986 两个序列，由部长令指定。方向性逻辑查不到任何文件依据' }],
  ['ON', 'observed', { en: '400-series means freeway, and many are the old number plus 400 — described by historians, not by the ministry', zh: '400 系代表高速公路，多数是旧号加 400——此说出自研究者而非交通部' }],
  ['SK', 'observed', { en: '600s north–south, 700s east–west. No government statement of it', zh: '600 系南北向、700 系东西向。政府未作任何表述' }],
  ['NL', 'observed', { en: 'Numbers cluster by region, east to west. No parity or directional rule', zh: '号码按区域自东向西聚集。无奇偶或方向规则' }],
  ['YT', 'observed', { en: 'Fourteen highways, numbered 1–11, 14–15 and 37. No rule', zh: '十四条地区公路，编号 1–11、14–15 与 37。无规则' }],
  ['NT', 'observed', { en: 'Ten highways, numbered 1–10, each also named. No rule', zh: '十条公路，编号 1–10，各有名称。无规则' }],
  ['BC', 'denied', { en: 'Technical Circular T-06/96 sets out the numbering criteria and contains no geographic rule at all. The ministry: “there isn’t one”', zh: '技术通告 T-06/96 规定了编号准则，其中没有任何地理规则。交通部原话：“并不存在”' }],
  ['NU', 'none', { en: 'There are roads, but none of them carry a number', zh: '有道路，但没有一条带编号' }],
];

const CA_LEVEL_COLOUR = {
  codified: '#6ef7a5', stated: '#35e7ff', observed: '#ffb545', denied: '#ff6b8a', none: '#7a8ca6',
};

function nbCanadaPane() {
  const zh = getLang() === 'zh';
  // Framed to the autoroutes themselves. A guessed box left most of the panel
  // empty with everything knotted around Montréal, because that is where the
  // network is; letting the data set the frame spends the width on the part
  // that has something in it.
  const qc = [...qcAutoroutes('ns'), ...qcAutoroutes('ew')];
  const d = numberingDiagram('ca-provincial', {
    box: qc.length ? boxOf(qc) : QC_BOX,
    colour: '#a98bff', pick: qcAutoroutes, lonStep: 2, latStep: 1,
    gapX: 22, gapY: 13,
  });

  // The Trans-Canada's numbers, read out of the atlas rather than recited, so
  // the claim that it changes number at provincial lines is shown in the data.
  const tch = new Map();
  for (const r of app.index) {
    if (r.sys !== 'ca-tch' || !r.st) continue;
    const prev = tch.get(r.st);
    if (!prev || r.mi > prev.mi) tch.set(r.st, r);
  }
  // Distinct numbers, longest first. Listing one entry per jurisdiction repeated
  // the shared ones back at the reader — "TCH 1, TCH 1, TCH 16, TCH 16" — which
  // undercut the very point the sentence is making.
  const byNum = new Map();
  for (const r of tch.values()) {
    const prev = byNum.get(r.num);
    if (!prev || r.mi > prev.mi) byNum.set(r.num, r);
  }
  const tchNums = [...byNum.values()].sort((a, b) => b.mi - a.mi).map((r) => `<b>${r.label}</b>`);
  const distinct = byNum.size;

  const rules = [
    [zh ? '没有全国性网格' : 'There is no national grid',
      zh ? `编号是省级权力，不存在联邦编号机构。横加公路本身就是证据：它在本图谱收录的 ${tch.size} 个省区里用了 <b>${distinct}</b> 种不同编号——${tchNums.slice(0, 6).join('、')}……`
        : `Numbering is a provincial power and no federal numbering authority exists. The Trans-Canada is its own proof: across the ${tch.size} jurisdictions in this atlas it carries <b>${distinct}</b> different numbers — ${tchNums.slice(0, 6).join(', ')}…`],
    [zh ? '同一条路，过境换号' : 'One road, two numbers',
      zh ? '登普斯特公路在育空是 <b>5 号</b>，越过地区界线就变成西北地区 <b>8 号</b>。没有任何机构负责阻止这种事。'
        : 'The Dempster Highway is <b>Yukon 5</b> on one side of the territorial line and <b>Northwest Territories 8</b> on the other. There is no body whose job it is to prevent that.'],
    [zh ? '魁北克是唯一的例外' : 'Québec is the one exception',
      zh ? '偶数东西向（平行于圣劳伦斯河），奇数南北向。交通部注明该原则<b>仅适用于 5 至 85 号</b>。'
        : 'Even numbers run east–west, parallel to the St Lawrence; odd numbers run north–south. The ministry bounds the principle: <i>“Ce principe s’applique seulement aux autoroutes 5 à 85.”</i>'],
    [zh ? '但方向究竟朝哪边，官方自己说反了' : 'Which way they climb, the ministry gets backwards',
      zh ? `《高速公路名录》写的是「奇数自南向北、偶数自西向东」，但路网本身恰好相反：奇数<b>自西向东</b>递增（加蒂诺的 A-5 到里维耶尔迪吕的 A-85），偶数<b>自南向北</b>递增。左图按实测坐标绘制，因此呈现的是路网的答案而非文本的答案。这类分歧本站选择保留而非抹平。`
        : 'The <i>Répertoire</i> pairs odd with south-to-north and even with west-to-east. The network is the other way round: odd climbs <b>west to east</b>, from A-5 at Gatineau to A-85 at Rivière-du-Loup, and even climbs <b>south to north</b>. The diagram is drawn from measured positions, so it shows the network’s answer rather than the sentence’s. The disagreement is kept here rather than tidied away.'],
    [zh ? '三位数的规则和美国一模一样' : 'Three digits work just like the Interstates',
      zh ? '<b>偶数打头是绕城、奇数打头是支线</b>，后两位指明母路——A-440 绕行 A-40，A-720 是 A-20 的支线。此条出自交通部关于路线编号的官方播客，而非《名录》页面，后者并未提及。'
        : 'An <b>even first digit is a bypass, an odd one a spur</b>, and the last two digits name the parent — A-440 detours A-40, A-720 is an antenna off A-20. This one comes from the ministry’s own podcast on route numbers, not from the <i>Répertoire</i>, which does not mention it.'],
    [zh ? '不列颠哥伦比亚官方否认有系统' : 'British Columbia says there is no system',
      zh ? '交通部技术通告 T-06/96 是编号的官方文件，通篇没有任何地理或奇偶规则，只写明“编号主要取决于该公路的功能分级”。部门自己的说法更直接：看起来没有逻辑，是因为真的没有。'
        : 'Technical Circular T-06/96 is the official document on numbering. It contains no geographic or parity rule whatsoever — its entire stated criterion is that “highway numbering decisions are largely determined by the functional classifications of the highway”. The ministry puts it more bluntly: there is no logical connection because there isn’t one.'],
  ];

  return `${anatomy('ca')}<div class="nb-wrap ca">
    <div class="nb-viz">${d.svg}
      <p style="margin:10px 2px 0;font-family:var(--mono);font-size:9.5px;color:var(--ink-faint)">${t('nb.ca.cap')}</p>
    </div>
    <div class="nb-note">
      <h4>${t('nb.ca.h')}</h4>
      ${rules.map(([k, v], i) => `<div class="nb-rule">
        <span class="nb-rule-n">${i + 1}</span>
        <span class="nb-rule-t"><b>${k}</b><br>${v}</span>
      </div>`).join('')}

      <h4 style="margin-top:16px">${t('nb.ca.ladder')}</h4>
      <div class="nb-ladder">
        ${CA_LADDER.map(([st, level, note]) => `<div class="nb-lad">
          <span class="nb-lad-st">${st}</span>
          <span class="nb-lad-lv" style="--lv:${CA_LEVEL_COLOUR[level]}">${t(`nb.ca.lv.${level}`)}</span>
          <span class="nb-lad-n">${note[zh ? 'zh' : 'en']}</span>
        </div>`).join('')}
      </div>
      <p class="nb-src">${zh
    ? '来源：魁北克《公路网功能分级》、《魁北克高速公路名录》与交通部播客《De A720 à R136》；BC 交通部技术通告 T-06/96（1997 年 2 月 14 日生效）；曼尼托巴《公路与运输法》CCSM c. H40 及 M.R. 415/88；新不伦瑞克运输与基建厅；新斯科舍公共工程厅。标为“仅为观察到的模式”者，指本站未能找到任何政府文件陈述该规则。'
    : 'Sources: Québec’s Classification fonctionnelle du réseau routier, the Répertoire des autoroutes du Québec and the ministry podcast De A720 à R136; BC Ministry of Transportation Technical Circular T-06/96, in force 14 February 1997; Manitoba’s Highways and Transportation Act CCSM c. H40 and M.R. 415/88; NBDTI; Nova Scotia Public Works. “Pattern only” means no government document stating the rule could be found.'}</p>
    </div>
  </div>`;
}

/* ── number plates: the real lines, coloured by what their number says ──── */

const fourDigit = (p) => {
  const m = /^G(\d\d)(\d)\d$/.exec(String(p.num ?? ''));
  return m && m[1][0] !== '9' ? m[2] : null;
};
const twoDigit = (p) => (/^G\d\d$/.test(String(p.num ?? '')) ? Number(p.num.slice(1)) : null);
const unsuffixed = (p) => /^\d+$/.test(String(p.num ?? ''));

/* Each class is a rule and a colour. `arrow` asks for the direction the
   numbers climb to be measured from the atlas's own positions and drawn;
   `orient` asks for each line's actual run to be checked against the rule. */
const PLATES = {
  'cn-expressway': {
    file: 'cn/expressway.json', centre: [116.4, 39.9],
    classes: [
      { key: 'radial', colour: '#ff5a7a', test: (p) => /^G\d$/.test(p.num), arrow: 'radial',
        h: L('One digit: out of Beijing', '一位数：首都放射线'),
        p: L('G1 to G7 leave the capital and are numbered clockwise from the north-east - G1 to Harbin, G4 to Hong Kong and Macau, G7 to Ürümqi.',
          'G1 至 G7 从北京出发，自东北方向起顺时针编号：G1 通哈尔滨，G4 通港澳，G7 通乌鲁木齐。') },
      { key: 'ns', colour: '#35e7ff', test: (p) => twoDigit(p) != null && twoDigit(p) < 90 && twoDigit(p) % 2 === 1, arrow: 'x', orient: 'ns',
        h: L('Odd two digits: north–south', '两位奇数：南北纵线'),
        p: L('Numbered from east to west.', '自东向西编号。') },
      { key: 'ew', colour: '#ffd166', test: (p) => twoDigit(p) != null && twoDigit(p) < 90 && twoDigit(p) % 2 === 0, arrow: 'y', orient: 'ew',
        h: L('Even two digits: east–west', '两位偶数：东西横线'),
        p: L('Numbered from north to south.', '自北向南编号。') },
      { key: 'ring', colour: '#a98bff', test: (p) => /^G9\d$/.test(p.num),
        h: L('9 and a digit: regional rings', '9 字头两位数：地区环线'),
        p: L('Loops around a whole region rather than a city - G94 around the Pearl River Delta, G98 around Hainan.',
          '环绕整个地区而非单座城市，例如 G94 珠三角环线、G98 海南地区环线。') },
      { key: 'city', colour: '#6ef7a5', test: (p) => fourDigit(p) === '0',
        h: L('Parent + 0 + n: city ring', '主线号 + 0 + 序号：城市绕城环线'),
        p: L('G4201 is the ring around Chengdu, hung off G42.', 'G4201 是挂在 G42 名下的成都绕城高速。') },
      { key: 'link', colour: '#ff9f68', test: (p) => fourDigit(p) === '1',
        h: L('Parent + 1 + n: connector', '主线号 + 1 + 序号：联络线'),
        p: L('A link between lines, named after the line it leaves - G1511 leaves G15.', '连接两条线路的联络线，以其所出的主线命名，例如 G1511 出自 G15。') },
      { key: 'par', colour: '#f06bff', test: (p) => fourDigit(p) === '2',
        h: L('Parent + 2 + n: parallel', '主线号 + 2 + 序号：并行线'),
        p: L('A second road along a busy corridor - G0421 runs beside G4; a one-digit parent is padded with a zero.',
          '为繁忙走廊另建的平行线路，例如 G0421 与 G4 并行；一位数的主线前面补 0。') },
      { key: 'other', colour: '#7a8ca6', test: () => true,
        h: L('Everything else', '其余编号'),
        p: L('A third digit of 3 and up, the G99xx series and lettered codes. No published rule for these was found.',
          '第三位为 3 及以上、G99 开头的四位数，以及带字母的编号。本站未找到成文规则。') },
    ],
  },
  'cn-national': {
    file: 'cn/national.json', centre: [116.4, 39.9],
    classes: [
      { key: 'radial', colour: '#ff5a7a', test: (p) => /^G1\d\d$/.test(p.num), arrow: 'radial',
        h: L('1xx: out of Beijing', '1 字头：首都放射线'),
        p: L('The ordinary roads follow the expressways\' pattern a digit higher: G101 onwards leave the capital, clockwise.',
          '普通国道沿用高速的模式，只是多一位：G101 起从北京放射，顺时针编号。') },
      { key: 'ns', colour: '#35e7ff', test: (p) => /^G2\d\d$/.test(p.num), arrow: 'x', orient: 'ns',
        h: L('2xx: north–south', '2 字头：南北纵线'),
        p: L('Broadly east to west from G201 in the north-east. Numbers added later sit among the old ones, so the order is loose - which the measured fit beside this shows.',
          '从东北的 G201 起，大体自东向西编号。后来增补的号码插在其间，顺序因此松散，旁边的实测吻合度反映的正是这一点。') },
      { key: 'ew', colour: '#ffd166', test: (p) => /^G3\d\d$/.test(p.num), arrow: 'y', orient: 'ew',
        h: L('3xx: east–west', '3 字头：东西横线'),
        p: L('Broadly north to south from G301 in Heilongjiang, loosened the same way.', '从黑龙江的 G301 起，大体自北向南编号，后补号码同样打乱了顺序。') },
      { key: 'link', colour: '#ff9f68', test: (p) => /^G[5-9]\d\d$/.test(p.num),
        h: L('5xx and up: connectors', '5 字头及以上：联络线'),
        p: L('Short links between the grid lines.', '连接纵横干线的联络线。') },
      { key: 'other', colour: '#7a8ca6', test: () => true, h: L('Everything else', '其余编号'), p: L('', '') },
    ],
  },
  'tw-freeway': {
    file: 'tw/freeway.json',
    classes: [
      { key: 'ns', colour: '#35e7ff', test: (p) => unsuffixed(p) && p.base % 2 === 1, arrow: 'x', orient: 'ns',
        h: L('Odd: north–south', '奇数：南北向'),
        p: L('Freeways 1 and 3 run the length of the west, Freeway 5 crosses to Yilan on the east.', '国道 1 号、3 号纵贯西部，国道 5 号通往东部的宜兰。') },
      { key: 'ew', colour: '#ffd166', test: (p) => unsuffixed(p) && p.base % 2 === 0, arrow: 'y', orient: 'ew',
        h: L('Even: east–west', '偶数：东西向'),
        p: L('Short cross-island links, numbered from north to south.', '较短的东西向连络道，自北向南编号。') },
      { key: 'branch', colour: '#f06bff', test: () => true,
        h: L('A suffix: a branch', '加“甲”：支线'),
        p: L('甲, the first of the ten heavenly stems, marks the first branch - 3甲 off Freeway 3.', '天干“甲”表示第一条支线，例如国道 3 号甲线。') },
    ],
  },
  'tw-provincial': {
    file: 'tw/provincial.json',
    classes: [
      { key: 'ew', colour: '#ffd166', test: (p) => unsuffixed(p) && p.base >= 62 && p.base % 2 === 0, arrow: 'y', orient: 'ew',
        h: L('62–88, even: east–west expressways', '62–88 偶数：东西向快速公路'),
        p: L('Twelve short expressways from the coast inland, numbered strictly from north to south.', '十二条由海岸通往内陆的快速公路，严格自北向南编号。') },
      { key: 'coast', colour: '#35e7ff', test: (p) => unsuffixed(p) && p.base >= 61 && p.base % 2 === 1, orient: 'ns',
        h: L('61 and up, odd: north–south', '61 以上奇数：南北向'),
        p: L('Provincial Highway 61 is the west-coast expressway.', '台 61 线即西部滨海快速公路。') },
      { key: 'trunk', colour: '#6ef7a5', test: (p) => unsuffixed(p) && p.base < 61, orient: (p) => (p.base % 2 ? 'ns' : 'ew'),
        h: L('1–39: the older trunk roads', '1–39：传统省道干线'),
        p: L('Mostly odd for north–south and even for east–west, with exceptions: Highway 7 is the Northern Cross-Island Highway.',
          '大体奇数南北、偶数东西，但有例外：台 7 线就是东西向的北部横贯公路。') },
      { key: 'branch', colour: '#f06bff', test: () => true,
        h: L('A suffix: a branch', '加天干：支线'),
        p: L('甲 乙 丙 丁 … in order, so Highway 9 has branches 9甲 to 9戊.', '依天干甲、乙、丙、丁……排序，例如台 9 线有甲线至戊线。') },
    ],
  },
  'mx-federal': {
    file: 'mx/federal.json',
    note: L('The rule is as English Wikipedia (Mexican Federal Highway) and OpenStreetMap’s Mexico wiki give it; neither cites an SICT document, and none was found. The arrows and the share of each class that runs the way its number says are measured from the atlas’s own lines.',
      '规则据英文维基百科“墨西哥联邦公路”条目与 OpenStreetMap 墨西哥维基所述；两者都未引用 SICT 文件，本站也未找到。箭头及各类中走向与编号相符的比例，均由本站自己的线形算出。'),
    classes: [
      { key: 'ns', colour: '#35e7ff', test: (p) => unsuffixed(p) && p.base % 2 === 1, arrow: 'x', orient: 'ns',
        h: L('Odd: north–south', '奇数：南北向'),
        p: L('Numbered from the north-west, so MEX-1 runs down Baja California and MEX-85 from Nuevo Laredo to Mexico City.',
          '编号从西北起算：1 号纵贯下加利福尼亚半岛，85 号从新拉雷多通往墨西哥城。') },
      { key: 'ew', colour: '#ffd166', test: (p) => unsuffixed(p) && p.base % 2 === 0, arrow: 'y', orient: 'ew',
        h: L('Even: east–west', '偶数：东西向'),
        p: L('MEX-2 follows the US border; the high numbers are in the south, where the coast roads MEX-180 and MEX-200 run more along the shore than across the country.',
          '2 号沿美墨边境；大号在南部，沿海的 180 号与 200 号顺海岸延伸，与其说是东西向，不如说是沿岸走向。') },
      { key: 'toll', colour: '#f06bff', test: () => true,
        h: L('A D: the toll road beside it', '加 D：并行的收费公路'),
        p: L('D, for directo, marks the toll road built beside a free one and numbered after it: MEX-15D runs beside MEX-15. The road file seldom writes the D, so most toll stretches are drawn under the plain number, their toll share given on the route.',
          'D 即 directo（直达），表示与免费公路并行、沿用其编号的收费公路：15D 与 15 号并行。道路文件很少写出 D，所以多数收费路段画在不带字母的编号下，收费比例在路线页给出。') },
    ],
  },
  'hk-route': {
    file: 'hk/routes.json', perRoute: true,
    classes: [
      { key: 'route', colour: '#f06bff', test: () => true,
        h: L('1 to 10: a name, not a position', '1 至 10 号：只是代号'),
        p: L('The number says nothing about direction or place. Route 1 runs from Aberdeen through the Cross-Harbour Tunnel to Sha Tin; Route 9 is the circuit of the New Territories.',
          '编号不表示方向，也不表示位置。1 号干线从香港仔经海底隧道到沙田；9 号干线是环绕新界的环迴线。') },
    ],
  },
};
const HK_PALETTE = ['#35e7ff', '#ffd166', '#ff5a7a', '#6ef7a5', '#a98bff', '#ff9f68', '#f06bff', '#5aa9ff', '#9be15d', '#ff9ecb'];

const geoCache = new Map();
function geoOf(file) {
  if (!geoCache.has(file)) geoCache.set(file, fetch(`data/geo/${file}`).then((r) => r.json()));
  return geoCache.get(file);
}
const linesOf = (g) => (g?.type === 'LineString' ? [g.coordinates] : g?.type === 'MultiLineString' ? g.coordinates : []);

/** Spearman's rank correlation, enough to say whether numbers climb with position. */
function rankCorr(xs, ys) {
  const rank = (v) => {
    const idx = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
    const r = new Array(v.length);
    idx.forEach(([, i], k) => { r[i] = k; });
    return r;
  };
  const a = rank(xs);
  const b = rank(ys);
  const n = a.length;
  const ma = (n - 1) / 2;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - ma); da += (a[i] - ma) ** 2; db += (b[i] - ma) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

function nbPlatePane(kind) {
  const spec = PLATES[kind];
  const zh = getLang() === 'zh';
  const counts = {};
  for (const r of app.index) {
    if (r.sys !== kind) continue;
    const c = spec.classes.find((x) => x.test(r))?.key;
    counts[c] = (counts[c] || 0) + 1;
  }
  const cards = spec.classes.filter((c) => counts[c.key]).map((c) => `
    <button class="nb-cls" type="button" data-c="${c.key}" style="--k:${c.colour}">
      <span class="nb-cls-hd"><i></i><b>${c.h[zh ? 'zh' : 'en']}</b><em>${num(counts[c.key])}</em></span>
      ${c.p[zh ? 'zh' : 'en'] ? `<span class="nb-cls-p">${c.p[zh ? 'zh' : 'en']}</span>` : ''}
      <span class="nb-fit" data-fit="${c.key}"></span>
    </button>`).join('');
  return `${anatomy(kind)}<div class="nb-wrap nb-wrap-plate">
    <div class="nb-plate" data-plate="${kind}">
      <div class="nb-read" aria-live="polite"></div>
      <p class="nb-load">${t('nb.loading')}</p>
    </div>
    <div class="nb-note">
      <h4>${t('nb.plate.h', { sys: t(`sys.${kind}`) })}</h4>
      <p class="nb-hint">${t('nb.plate.hint')}</p>
      <div class="nb-clss">${cards}</div>
      ${spec.note ? `<p class="nb-src">${spec.note[zh ? 'zh' : 'en']}</p>` : ''}
    </div>
  </div>`;
}

async function drawPlate(kind, host) {
  const spec = PLATES[kind];
  let gj;
  try { gj = await geoOf(spec.file); } catch { host.querySelector('.nb-load').textContent = t('nb.loadFail'); return; }
  if (!host.isConnected) return;
  const zh = getLang() === 'zh';
  const classOf = (p) => spec.classes.find((c) => c.test(p)) || spec.classes[spec.classes.length - 1];

  let lon0 = 180, lon1 = -180, lat0 = 90, lat1 = -90;
  for (const f of gj.features) {
    for (const line of linesOf(f.geometry)) {
      for (const [x, y] of line) {
        if (x < lon0) lon0 = x; if (x > lon1) lon1 = x;
        if (y < lat0) lat0 = y; if (y > lat1) lat1 = y;
      }
    }
  }
  const k = Math.cos(((lat0 + lat1) / 2) * Math.PI / 180);
  const aspect = ((lon1 - lon0) * k) / (lat1 - lat0);
  const W = aspect >= 1.1 ? 640 : Math.round(470 * aspect);
  const H = aspect >= 1.1 ? Math.round(640 / aspect) : 470;
  const pad = 10;
  const TOP = 26;
  const RIGHT = 46;
  const s = Math.min((W - 2 * pad) / ((lon1 - lon0) * k), (H - 2 * pad) / (lat1 - lat0));
  const px = (lon) => pad + (lon - lon0) * k * s;
  const py = (lat) => TOP + pad + (lat1 - lat) * s;

  // Paths, thinned to what the plate can show, and each line's actual run.
  const fit = {};
  const paths = [];
  gj.features.forEach((f) => {
    const p = f.properties;
    const cls = classOf(p);
    let d = '';
    let bx0 = 180, bx1 = -180, by0 = 90, by1 = -90;
    for (const line of linesOf(f.geometry)) {
      let lx = null, ly = null;
      for (const [x, y] of line) {
        if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
        if (y < by0) by0 = y; if (y > by1) by1 = y;
        const X = px(x), Y = py(y);
        if (lx !== null && Math.abs(X - lx) + Math.abs(Y - ly) < 1.1) continue;
        d += `${lx === null ? 'M' : 'L'}${X.toFixed(1)} ${Y.toFixed(1)}`;
        lx = X; ly = Y;
      }
    }
    if (!d) return;
    const want = typeof cls.orient === 'function' ? cls.orient(p) : cls.orient;
    if (want) {
      const runs = (by1 - by0) > (bx1 - bx0) * k ? 'ns' : 'ew';
      fit[cls.key] ??= { ok: 0, n: 0, miss: [] };
      fit[cls.key].n++;
      if (runs === want) fit[cls.key].ok++;
      else fit[cls.key].miss.push(routeLabel(p.label));
    }
    const colour = spec.perRoute ? HK_PALETTE[(Number(p.base) - 1) % HK_PALETTE.length] : cls.colour;
    const name = zh ? (p.plan?.short || p.named?.find((n) => /[\u4e00-\u9fff]/.test(n)) || '') : (p.plan?.en || p.named?.find((n) => !/[\u4e00-\u9fff]/.test(n)) || '');
    const order = spec.classes.length - spec.classes.indexOf(cls);
    paths.push([order, `<path class="nb-route nb-geo" data-id="${esc(p.id)}" data-c="${cls.key}" data-label="${esc(routeLabel(p.label))}" data-name="${esc(name)}"
      stroke="${colour}" stroke-width="${p.tier === 'primary' ? 1.9 : 1.2}" d="${d}"/>`]);
    if (spec.perRoute) {
      const mid = linesOf(f.geometry)[0]?.[Math.floor(linesOf(f.geometry)[0].length / 2)];
      if (mid) paths.push([99, `<text class="nb-hk" x="${px(mid[0]).toFixed(1)}" y="${(py(mid[1]) - 5).toFixed(1)}" fill="${colour}">${esc(p.num)}</text>`]);
    }
  });
  paths.sort((a, b) => a[0] - b[0]);

  // The direction each class climbs, measured rather than asserted.
  const marks = [];
  const defs = [];
  const fitText = {};
  for (const cls of spec.classes) {
    if (!cls.arrow) continue;
    const best = new Map();
    for (const r of app.index) {
      if (r.sys !== kind || r.tier !== 'primary' || classOf(r) !== cls) continue;
      const prev = best.get(r.base);
      if (!prev || r.mi > prev.mi) best.set(r.base, r);
    }
    const rows = [...best.values()].sort((a, b) => a.base - b.base);
    if (rows.length < 3) continue;
    defs.push(`<marker id="nbA-${kind}-${cls.key}" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L8 4L0 8z" fill="${cls.colour}"/></marker>`);
    const first = routeLabel(rows[0].label);
    const last = routeLabel(rows[rows.length - 1].label);
    if (cls.arrow === 'radial') {
      const [cx0, cy0] = [px(spec.centre[0]), py(spec.centre[1])];
      let prev = null;
      const angs = rows.map((r) => {
        let a = Math.atan2(py(r.cy) - cy0, px(r.cx) - cx0);
        if (prev !== null) { while (a - prev > Math.PI) a -= 2 * Math.PI; while (a - prev < -Math.PI) a += 2 * Math.PI; }
        prev = a;
        return a;
      });
      const a0 = angs[0];
      const a1 = angs[angs.length - 1];
      const R = 30;
      const pt = (a, rr = R) => [cx0 + Math.cos(a) * rr, cy0 + Math.sin(a) * rr];
      const [x0, y0] = pt(a0);
      const [x1, y1] = pt(a1);
      const sweep = a1 > a0 ? 1 : 0;
      const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
      const [lx0, ly0] = pt(a0, R + 13);
      const [lx1, ly1] = pt(a1, R + 13);
      marks.push(`<g class="nb-mark" data-c="${cls.key}">
        <circle cx="${cx0.toFixed(1)}" cy="${cy0.toFixed(1)}" r="3.2" fill="${cls.colour}"/>
        <path d="M${x0.toFixed(1)} ${y0.toFixed(1)}A${R} ${R} 0 ${large} ${sweep} ${x1.toFixed(1)} ${y1.toFixed(1)}" stroke="${cls.colour}" class="nb-arc" marker-end="url(#nbA-${kind}-${cls.key})"/>
        <text x="${lx0.toFixed(1)}" y="${(ly0 + 3).toFixed(1)}" text-anchor="middle" fill="${cls.colour}">${esc(first)}</text>
        <text x="${lx1.toFixed(1)}" y="${(ly1 + 3).toFixed(1)}" text-anchor="middle" fill="${cls.colour}">${esc(last)}</text>
      </g>`);
      fitText[cls.key] = sweep ? t('nb.fit.cw') : t('nb.fit.ccw');
      continue;
    }
    const along = cls.arrow === 'x' ? (r) => r.cx : (r) => r.cy;
    const rho = rankCorr(rows.map((r) => r.base), rows.map(along));
    const lo = Math.min(...rows.map(along));
    const hi = Math.max(...rows.map(along));
    // Climbing means the arrow runs from the low numbers' side to the high.
    const up = rho >= 0;
    if (cls.arrow === 'x') {
      const xa = px(up ? lo : hi), xb = px(up ? hi : lo);
      const y = 13;
      marks.push(`<g class="nb-mark" data-c="${cls.key}">
        <line x1="${xa.toFixed(1)}" y1="${y}" x2="${xb.toFixed(1)}" y2="${y}" stroke="${cls.colour}" marker-end="url(#nbA-${kind}-${cls.key})"/>
        <text x="${(xa + (xb > xa ? -4 : 4)).toFixed(1)}" y="${y + 3}" text-anchor="${xb > xa ? 'end' : 'start'}" fill="${cls.colour}">${esc(first)}</text>
        <text x="${(xb + (xb > xa ? 9 : -9)).toFixed(1)}" y="${y + 3}" text-anchor="${xb > xa ? 'start' : 'end'}" fill="${cls.colour}">${esc(last)}</text>
      </g>`);
      fitText[cls.key] = t(up ? 'nb.fit.e' : 'nb.fit.w', { r: Math.abs(rho).toFixed(2) });
    } else {
      // Latitude runs up the page, so a positive correlation climbs northward.
      const ya = py(up ? lo : hi), yb = py(up ? hi : lo);
      const x = W + 16;
      marks.push(`<g class="nb-mark" data-c="${cls.key}">
        <line x1="${x}" y1="${ya.toFixed(1)}" x2="${x}" y2="${yb.toFixed(1)}" stroke="${cls.colour}" marker-end="url(#nbA-${kind}-${cls.key})"/>
        <text x="${x}" y="${(ya + (yb > ya ? -6 : 12)).toFixed(1)}" text-anchor="middle" fill="${cls.colour}">${esc(first)}</text>
        <text x="${x}" y="${(yb + (yb > ya ? 16 : -10)).toFixed(1)}" text-anchor="middle" fill="${cls.colour}">${esc(last)}</text>
      </g>`);
      fitText[cls.key] = t(up ? 'nb.fit.n' : 'nb.fit.s', { r: Math.abs(rho).toFixed(2) });
    }
  }

  host.querySelector('.nb-load')?.remove();
  host.insertAdjacentHTML('beforeend', `<svg viewBox="0 0 ${W + RIGHT} ${H + TOP}" class="nb-plate-svg">
    <defs>${defs.join('')}</defs>
    <g class="nb-geos">${paths.map((x) => x[1]).join('')}</g>${marks.join('')}</svg>`);

  for (const cls of spec.classes) {
    const el = host.closest('.nb-wrap')?.querySelector(`[data-fit="${cls.key}"]`);
    if (!el) continue;
    const parts = [];
    if (fitText[cls.key]) parts.push(fitText[cls.key]);
    const f = fit[cls.key];
    if (f) {
      parts.push(t('nb.fit.orient', { ok: f.ok, n: f.n }));
      if (f.miss.length && f.miss.length <= 4) parts.push(`${t('nb.fit.except')} ${f.miss.map(esc).join(zh ? '、' : ', ')}`);
    }
    if (parts.length) el.innerHTML = `${f ? `<i class="nb-fit-bar"><i style="width:${(100 * f.ok / f.n).toFixed(0)}%"></i></i>` : ''}${parts.join(' · ')}`;
  }
  wirePlate(host);
}

function wirePlate(host) {
  const wrap = host.closest('.nb-wrap');
  const read = host.querySelector('.nb-read');
  const geos = [...host.querySelectorAll('.nb-geo')];
  let iso = null;
  const paintIso = () => {
    for (const g of geos) g.classList.toggle('dim', !!iso && g.dataset.c !== iso);
    for (const m of host.querySelectorAll('.nb-mark')) m.classList.toggle('dim', !!iso && m.dataset.c !== iso);
    for (const c of wrap.querySelectorAll('.nb-cls')) c.classList.toggle('on', c.dataset.c === iso);
  };
  for (const c of wrap.querySelectorAll('.nb-cls')) {
    c.addEventListener('click', () => { iso = iso === c.dataset.c ? null : c.dataset.c; paintIso(); });
  }
  host.addEventListener('mouseover', (e) => {
    const g = e.target.closest('.nb-geo');
    if (!g) return;
    for (const x of geos) x.classList.toggle('hot', x.dataset.id === g.dataset.id);
    read.innerHTML = `<b>${esc(g.dataset.label)}</b>${g.dataset.name ? ` <span>${esc(g.dataset.name)}</span>` : ''}`;
    read.classList.add('on');
  });
  host.addEventListener('mouseleave', () => {
    for (const x of geos) x.classList.remove('hot');
    read.classList.remove('on');
  });
  host.addEventListener('click', (e) => {
    const g = e.target.closest('.nb-geo');
    if (!g) return;
    closeSheet();
    select(g.dataset.id);
  });
}

/* Provincial roads are numbered by thirty-one provinces at once, so the pane
   counts the series rather than drawing five thousand lines. */
const CN_SERIES = [
  ['radial', /^S1\d\d$/, '#ff5a7a', L('S1xx: out of the provincial capital', 'S1 字头：省会放射线')],
  ['ns', /^S2\d\d$/, '#35e7ff', L('S2xx: north–south', 'S2 字头：南北纵线')],
  ['ew', /^S3\d\d$/, '#ffd166', L('S3xx: east–west', 'S3 字头：东西横线')],
  ['hi', /^S[4-9]\d\d$/, '#ff9f68', L('S4xx and up: connectors and province-specific series', 'S4 字头及以上：联络线与各省自定序列')],
  ['xway', /^S\d{1,2}$|^S\d{4}$/, '#6ef7a5', L('One, two or four digits: provincial expressways', '一、二或四位数：省级高速公路')],
];

function nbProvincialPane() {
  const zh = getLang() === 'zh';
  const rows = app.index.filter((r) => r.sys === 'cn-provincial');
  const tally = CN_SERIES.map(([key, re, colour, label]) => {
    const hit = rows.filter((r) => re.test(String(r.num ?? '')));
    return { key, colour, label, n: hit.length, mi: hit.reduce((s, r) => s + r.mi, 0) };
  });
  const other = rows.length - tally.reduce((s, x) => s + x.n, 0);
  const max = Math.max(...tally.map((x) => x.n), 1);
  // The same number in many provinces: each one numbers its own.
  const where = new Map();
  for (const r of rows) {
    if (!where.has(r.num)) where.set(r.num, new Set());
    where.get(r.num).add(r.st);
  }
  const shared = [...where.entries()].sort((a, b) => b[1].size - a[1].size).slice(0, 6);
  const provinces = new Set(rows.map((r) => r.st)).size;
  return `${anatomy('cn-provincial')}<div class="nb-wrap nb-wrap-plate">
    <div class="nb-viz nb-series">
      ${tally.map((x) => `<div class="nb-ser" style="--k:${x.colour}">
        <span class="nb-ser-k">${x.label[zh ? 'zh' : 'en']}</span>
        <span class="nb-ser-bar"><i style="width:${(100 * x.n / max).toFixed(1)}%"></i></span>
        <span class="nb-ser-v">${num(x.n)}<small>${dist(x.mi)}</small></span>
      </div>`).join('')}
      ${other ? `<p class="nb-src">${t('nb.cn.other', { n: num(other) })}</p>` : ''}
      <h4 class="nb-ser-h">${t('nb.cn.shared')}</h4>
      <div class="nb-shared">${shared.map(([n, sts]) => `<span><b>${esc(n)}</b>${t('nb.cn.inN', { n: sts.size })}</span>`).join('')}</div>
    </div>
    <div class="nb-note">
      <h4>${t('nb.cn.h')}</h4>
      <div class="nb-rule"><span class="nb-rule-n">1</span><span class="nb-rule-t">
        <b>${zh ? '与国道同一套规则，缩到一省之内' : 'The national rule, shrunk to a province'}</b><br>
        ${zh ? '1 字头从省会放射，2 字头南北、3 字头东西，只是中心换成了省会，范围换成了省界。'
    : 'Radials out of the provincial capital in the 100s, north–south in the 200s, east–west in the 300s - the national pattern, centred on the capital and bounded by the province.'}
      </span></div>
      <div class="nb-rule"><span class="nb-rule-n">2</span><span class="nb-rule-t">
        <b>${zh ? '每个省各编各的' : 'Every province numbers its own'}</b><br>
        ${zh ? `本图谱收录 ${provinces} 个省级行政区的省道。号码只在省内唯一，所以同一个 S301 会在许多省份同时出现。`
    : `Provincial roads from ${provinces} provinces are in this atlas. A number is unique only inside its province, so the same S301 turns up in province after province.`}
      </span></div>
      <div class="nb-rule"><span class="nb-rule-n">3</span><span class="nb-rule-t">
        <b>${zh ? '位数区分高速与普通省道' : 'The digit count tells an expressway'}</b><br>
        ${zh ? '省级高速用一、二或四位数（S15、S1511），普通省道用三位数（S301）。' : 'Provincial expressways take one, two or four digits (S15, S1511); ordinary provincial roads take three (S301).'}
      </span></div>
    </div>
  </div>`;
}

/* ── number anatomy: one real number taken apart ────────────────────────── */

const ANATOMY = {
  'us-interstate': [
    ['I-95', [['I-', '#8fb4ff', L('Interstate', '州际公路')], ['9', '#35e7ff', L('odd: north–south', '奇数：南北向')], ['5', '#ffd166', L('ends in 5: a long-haul spine', '尾数 5：长途主干线')]]],
    ['I-80', [['I-', '#8fb4ff', L('Interstate', '州际公路')], ['8', '#35e7ff', L('even: east–west, high = north', '偶数：东西向，号大在北')], ['0', '#ffd166', L('ends in 0: coast to coast', '尾数 0：横贯东西海岸')]]],
  ],
  'us-numbered': [
    ['US 1', [['US ', '#8fb4ff', L('US Route', '美国国道')], ['1', '#35e7ff', L('odd and lowest: the Atlantic edge', '奇数且最小：贴着大西洋岸')]]],
    ['US 50', [['US ', '#8fb4ff', L('US Route', '美国国道')], ['5', '#35e7ff', L('even: east–west, high = south', '偶数：东西向，号大在南')], ['0', '#ffd166', L('ends in 0: transcontinental', '尾数 0：横贯大陆')]]],
  ],
  aux: [
    ['I-275', [['2', '#6ef7a5', L('even first digit: a loop, both ends on the parent', '首位偶数：环线，两端都接主路')], ['75', '#35e7ff', L('the parent: I-75', '母路：I-75')]]],
    ['I-175', [['1', '#ffb545', L('odd first digit: a spur, one end only', '首位奇数：支线，只接一端')], ['75', '#35e7ff', L('the parent: I-75', '母路：I-75')]]],
  ],
  ca: [
    ['A-440', [['A-', '#8fb4ff', L('Québec autoroute', '魁北克高速公路')], ['4', '#6ef7a5', L('even first digit: a bypass', '首位偶数：绕行线')], ['40', '#35e7ff', L('the parent: A-40', '母路：A-40')]]],
    ['A-720', [['A-', '#8fb4ff', L('Québec autoroute', '魁北克高速公路')], ['7', '#ffb545', L('odd first digit: a spur', '首位奇数：支线')], ['20', '#35e7ff', L('the parent: A-20', '母路：A-20')]]],
  ],
  'mx-federal': [
    ['MEX-15D', [['MEX-', '#8fb4ff', L('federal highway', '联邦公路')], ['15', '#35e7ff', L('odd: north–south, from the west', '奇数：南北向，自西编起')], ['D', '#f06bff', L('directo: the toll road beside MEX-15', 'directo：与 15 号并行的收费公路')]]],
    ['MEX-2', [['MEX-', '#8fb4ff', L('federal highway', '联邦公路')], ['2', '#ffd166', L('even: east–west, the northernmost', '偶数：东西向，最北的一条')]]],
  ],
  'cn-expressway': [
    ['G4', [['G', '#2fd37a', L('national (国家)', '国家级')], ['4', '#ff5a7a', L('one digit: the 4th radial out of Beijing', '一位数：第 4 条首都放射线')]]],
    ['G45', [['G', '#2fd37a', L('national', '国家级')], ['45', '#35e7ff', L('odd: north–south, numbered east to west', '奇数：南北纵线，自东向西编号')]]],
    ['G4201', [['G', '#2fd37a', L('national', '国家级')], ['42', '#ffd166', L('parent: G42, Shanghai–Chengdu', '主线：G42 沪蓉高速')], ['0', '#6ef7a5', L('0: a city ring', '0：城市绕城环线')], ['1', '#8fb4ff', L('the first such ring', '序号')]]],
    ['G0421', [['G', '#2fd37a', L('national', '国家级')], ['04', '#ff5a7a', L('parent: G4, padded to two digits', '主线：G4，补零为两位')], ['2', '#f06bff', L('2: a parallel line', '2：并行线')], ['1', '#8fb4ff', L('sequence', '序号')]]],
  ],
  'cn-national': [
    ['G109', [['G', '#ff5a5a', L('national road', '国道')], ['1', '#ff5a7a', L('1: out of Beijing', '1：首都放射线')], ['09', '#8fb4ff', L('9th, clockwise', '顺时针第 9 条')]]],
    ['G219', [['G', '#ff5a5a', L('national road', '国道')], ['2', '#35e7ff', L('2: north–south', '2：南北纵线')], ['19', '#8fb4ff', L('sequence, east to west', '序号，自东向西')]]],
    ['G318', [['G', '#ff5a5a', L('national road', '国道')], ['3', '#ffd166', L('3: east–west', '3：东西横线')], ['18', '#8fb4ff', L('sequence, north to south', '序号，自北向南')]]],
  ],
  'cn-provincial': [
    ['S301', [['S', '#f4c542', L('provincial (省)', '省道')], ['3', '#ffd166', L('3: east–west', '3：东西横线')], ['01', '#8fb4ff', L('sequence within the province', '省内序号')]]],
    ['S15', [['S', '#f4c542', L('provincial', '省道')], ['15', '#6ef7a5', L('two digits: a provincial expressway', '两位数：省级高速')]]],
  ],
  'tw-freeway': [
    ['国道3号甲线', [['国道', '#5aa9ff', L('National Freeway', '国道（高速公路）')], ['3', '#35e7ff', L('odd: north–south', '奇数：南北向')], ['甲', '#f06bff', L('甲: the first branch', '甲：第一条支线')]]],
  ],
  'tw-provincial': [
    ['台74线', [['台', '#ff9f68', L('Provincial Highway', '省道')], ['74', '#ffd166', L('even, 62–88: an east–west expressway', '62–88 偶数：东西向快速公路')]]],
    ['台9丁线', [['台', '#ff9f68', L('Provincial Highway', '省道')], ['9', '#6ef7a5', L('the east-coast trunk road', '东部纵贯干线')], ['丁', '#f06bff', L('丁: the fourth branch', '丁：第四条支线')]]],
  ],
  'hk-route': [
    ['Route 9', [['Route ', '#f06bff', L('Hong Kong trunk route', '香港干线')], ['9', '#ffd166', L('a label: the New Territories circuit', '只是代号：新界环迴线')]]],
  ],
};

function anatomy(kind) {
  const ex = ANATOMY[kind];
  if (!ex) return '';
  const zh = getLang() === 'zh';
  return `<div class="nb-ana">
    <span class="nb-ana-k">${t('nb.anatomy')}</span>
    <div class="nb-ana-chips">${ex.map(([code], i) => `<button type="button" class="nb-ana-chip${i ? '' : ' on'}" data-ana="${i}">${esc(code)}</button>`).join('')}</div>
    ${ex.map(([, parts], i) => `<div class="nb-ana-code${i ? '' : ' on'}" data-ana="${i}">
      ${parts.map(([txt, colour, cap]) => `<span class="nb-ana-p" style="--k:${colour}"><b>${esc(txt.trim())}</b><small>${cap[zh ? 'zh' : 'en']}</small></span>`).join('')}
    </div>`).join('')}
  </div>`;
}

function wirePane(body) {
  for (const chip of body.querySelectorAll('.nb-ana-chip')) {
    chip.addEventListener('click', () => {
      for (const el of body.querySelectorAll('[data-ana]')) el.classList.toggle('on', el.dataset.ana === chip.dataset.ana);
    });
  }
  const plate = body.querySelector('.nb-plate');
  if (plate) drawPlate(plate.dataset.plate, plate);
}

export function wireNumbering() {
  const body = document.getElementById('nbBody');
  const tabsHost = document.getElementById('nbTabs');
  const paint = (kind) => {
    nbTabOf[nbCountry] = kind;
    body.innerHTML = nbPane(kind);
    wirePane(body);
    for (const line of body.querySelectorAll('.nb-viz .nb-route[data-id]')) {
      line.addEventListener('mouseenter', () => {
        const n = line.dataset.n;
        for (const el of body.querySelectorAll('.nb-route')) el.classList.toggle('dim', el.dataset.n !== n);
        for (const el of body.querySelectorAll('.nb-lab')) el.classList.toggle('hot', el.dataset.n === n);
        line.classList.add('hot');
      });
      line.addEventListener('mouseleave', () => {
        for (const el of body.querySelectorAll('.nb-route')) el.classList.remove('dim', 'hot');
        for (const el of body.querySelectorAll('.nb-lab')) el.classList.remove('hot');
      });
      line.style.cursor = 'pointer';
      line.addEventListener('click', () => { closeSheet(); select(line.dataset.id); });
    }
  };
  // Switching language rebuilds the whole sheet, so the country and the tab
  // within it are kept rather than thrown back to the first.
  const showCountry = (cc) => {
    nbCountry = cc;
    for (const b of document.querySelectorAll('.nb-cc')) b.classList.toggle('on', b.dataset.cc === cc);
    const c = NB_COUNTRIES.find((x) => x.cc === cc);
    const kind = c.tabs.includes(nbTabOf[cc]) ? nbTabOf[cc] : c.tabs[0];
    tabsHost.hidden = c.tabs.length < 2;
    tabsHost.innerHTML = c.tabs.map((k) => `<button class="btn${k === kind ? ' on' : ''}" data-nb="${k}" type="button">${t(NB_TAB_KEY[k] || `sys.${k}`)}</button>`).join('');
    for (const tab of tabsHost.querySelectorAll('[data-nb]')) {
      tab.addEventListener('click', () => {
        for (const o of tabsHost.querySelectorAll('[data-nb]')) o.classList.toggle('on', o === tab);
        paint(tab.dataset.nb);
      });
    }
    paint(kind);
  };
  for (const b of document.querySelectorAll('.nb-cc')) b.addEventListener('click', () => showCountry(b.dataset.cc));
  showCountry(nbCountry);
}
