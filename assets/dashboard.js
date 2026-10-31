/* The statistics dashboard: network totals by system, jurisdiction, country
   and speed limit, and the buildout curves. */

import { getLang, t, stateName, ownerLabel, lenOf, lenUnit, lenNum, esc, num } from './i18n.js';
import { app, select, loadState, zoomToState } from './app.js';
import { SYSTEMS, countryOf, CLASS_COLOUR } from './schema.js';
import { loadSpeed, speedColour, bandLabel, speedUnit, BANDS, UNKNOWN } from './speed.js';
import { frame, SYS_COLOUR, DASH_CC, CC_COLOUR, bars } from './sheet-kit.js';
import { closeSheet } from './sheets.js';

/* The page holds the whole atlas and each country in turn. A rail of country
   cards picks which; every chart below is drawn again for the choice and the
   headline figures count across from the last one, so switching reads as
   the same page changing its subject rather than a new page. */
let dashCc = 'all';
const dashPrev = {};

function countryTotals() {
  const s = app.stats;
  return DASH_CC.map((cc) => {
    const systems = SYSTEMS.filter((x) => x.cc === cc && s.bySystem[x.id])
      .map((x) => ({ id: x.id, colour: x.colour, ...s.bySystem[x.id] }));
    return { cc, systems, mi: systems.reduce((a, x) => a + x.mi, 0), routes: systems.reduce((a, x) => a + x.routes, 0) };
  }).filter((c) => c.mi > 0);
}

export function renderDashboard() {
  const countries = countryTotals();
  const world = countries.reduce((a, c) => a + c.mi, 0);
  const C = 2 * Math.PI * 15.5;
  const card = (cc, mi, routes, colour, label) => `
    <button class="dash-cc${cc === dashCc ? ' on' : ''}" type="button" data-cc="${cc}" style="--cc:${colour}">
      <svg class="dash-ring" viewBox="0 0 36 36" aria-hidden="true"><circle class="bg" cx="18" cy="18" r="15.5"/>
        <circle class="fg" cx="18" cy="18" r="15.5" stroke-dasharray="${((mi / world) * C).toFixed(2)} ${C.toFixed(2)}"/></svg>
      <span class="dash-cc-t">${cc === 'all' ? '' : `<i class="flagdot flag-${cc}"></i>`}<b>${label}</b>
        <small>${num(lenOf(mi))} ${lenUnit()}</small><em>${cc === 'all' ? t('dash.nRoutes', { n: num(routes) }) : `${num((mi / world) * 100, mi / world < 0.1 ? 1 : 0)}%`}</em></span>
    </button>`;
  const rail = card('all', world, countries.reduce((a, c) => a + c.routes, 0), '#35e7ff', t('dash.all'))
    + countries.map((c) => card(c.cc, c.mi, c.routes, CC_COLOUR[c.cc], t(`sys.country.${c.cc}`))).join('');
  return frame('dash.title', 'dash.sub', `
    <div class="dash-rail" role="tablist">${rail}</div>
    <div id="dashBody" class="dash-body">${dashBody(dashCc)}</div>`,
  { n: num(countries.reduce((a, c) => a + c.routes, 0)) });
}

function dashBody(cc) {
  const s = app.stats;
  const all = cc === 'all';
  const inCc = (sysId) => all || countryOf(sysId) === cc;
  const sysStats = Object.entries(s.bySystem).filter(([id]) => inCc(id)).map(([, v]) => v);
  const totalMi = sysStats.reduce((a, b) => a + b.mi, 0);
  const totalRoutes = sysStats.reduce((a, b) => a + b.routes, 0);
  const freewayMi = sysStats.reduce((a, b) => a + b.gsMi, 0);
  const index = all ? app.index : app.index.filter((r) => countryOf(r.sys) === cc);

  // One row per country, each a bar as long as its network and split into its
  // systems, so the country split and the system split read off one chart.
  // A single country gets a row per system instead, on the same idea.
  const countries = all
    ? countryTotals()
    : SYSTEMS.filter((x) => x.cc === cc && s.bySystem[x.id]).map((x) => ({
      cc, sys: x.id, systems: [{ id: x.id, colour: x.colour, ...s.bySystem[x.id] }],
      mi: s.bySystem[x.id].mi, routes: s.bySystem[x.id].routes,
    }));
  const maxCc = Math.max(...countries.map((c) => c.mi));

  // Each country ranked against itself: Texas, Ontario and Veracruz are not
  // on the same scale, and one mixed list was American below its third row.
  const stateRowsOf = (c, n = 8) => Object.entries(s.byState)
    .filter(([, v]) => v.cc === c)
    .sort((a, b) => b[1].mi - a[1].mi)
    .slice(0, n)
    .map(([st, v]) => ({ k: stateName(st), v: lenOf(v.mi), st, cc: v.cc }));
  const tollMi = sysStats.reduce((a, b) => a + (b.tollMi || 0), 0);
  const stateCount = Object.values(s.byState).filter((v) => all || v.cc === cc).length;

  // The shape of each system: how many routes, how long the typical one is,
  // and how much of it is freeway or tolled.
  const profile = SYSTEMS.filter((x) => s.bySystem[x.id] && inCc(x.id)).map((x) => {
    const b = s.bySystem[x.id];
    const own = app.index.filter((r) => r.sys === x.id);
    const lens = own.map((r) => r.mi).sort((p, q) => p - q);
    const longestOwn = own.reduce((m, r) => (!m || r.mi > m.mi ? r : m), null);
    return {
      id: x.id, cc: x.cc, colour: x.colour, routes: b.routes, mi: b.mi,
      median: lens.length ? lens[Math.floor(lens.length / 2)] : 0,
      gs: b.mi ? (b.gsMi / b.mi) * 100 : 0,
      toll: b.mi ? ((b.tollMi || 0) / b.mi) * 100 : 0,
      longest: longestOwn,
    };
  });

  // Route lengths fall over three orders of magnitude, so the buckets do too.
  const EDGES = [0, 10, 25, 50, 100, 250, 500, 1000, Infinity];
  // Stacked by country for the whole atlas, by system inside one country.
  const keys = all ? DASH_CC : SYSTEMS.filter((x) => x.cc === cc && s.bySystem[x.id]).map((x) => x.id);
  const keyOf = all ? (r) => countryOf(r.sys) : (r) => r.sys;
  const colourOfKey = all ? (k) => CC_COLOUR[k] : (k) => SYS_COLOUR[k];
  const nameOfKey = all ? (k) => t(`sys.country.${k}`) : (k) => t(`sys.${k}`);
  const hist = EDGES.slice(0, -1).map((lo, i) => {
    const hi = EDGES[i + 1];
    const by = Object.fromEntries(keys.map((k) => [k, 0]));
    for (const r of index) if (r.mi >= lo && r.mi < hi) by[keyOf(r)] += 1;
    return { lo, hi, by, n: Object.values(by).reduce((a, b) => a + b, 0) };
  });
  const histMax = Math.max(1, ...hist.map((h) => h.n));
  const edgeLabel = (v) => num(Math.round(lenOf(v) / (v >= 100 ? 10 : 1)) * (v >= 100 ? 10 : 1));

  const widest = index.slice().sort((a, b) => b.ns - a.ns || b.mi - a.mi).slice(0, 10);
  // The length check is made against official figures that exist for some
  // countries only, so it stays with the whole-atlas view.
  const acc = all ? s.accuracy : null;
  const accX = (pct) => 50 + Math.max(-25, Math.min(25, pct)) * 2;

  const types = all ? s.byType : s.byTypeCc?.[cc];
  const classTotal = types ? Object.values(types).reduce((a, b) => a + b, 0) : 0;
  const classRows = types ? Object.entries(types)
    .sort((a, b) => b[1] - a[1])
    .filter(([, v]) => v / classTotal > 0.002)
    .map(([k, v]) => ({ k: t(`comp.${k}`), v, cls: k })) : [];

  const longest = index.slice().sort((a, b) => b.mi - a.mi).slice(0, 14);
  const pctOf = (v, whole) => { const p = (v / whole) * 100; return num(p, p < 10 ? 1 : 0); };
  const tile = (key, label, v, unit = '') => `<div class="m"><span class="m-k">${label}</span><div class="m-v"><span data-tile="${key}" data-to="${v}">${num(v)}</span>${unit ? `<small>${unit}</small>` : ''}</div></div>`;
  const stateCols = all ? ['us', 'ca', 'mx', 'cn', 'tw'] : (stateCount > 1 ? [cc] : []);

  return `
    <div class="dash-top">
      ${tile('mi', t('dash.totalMi'), lenOf(totalMi), lenUnit())}
      ${tile('routes', t('dash.routes'), totalRoutes)}
      ${tile('states', t('dash.states'), stateCount)}
      ${tile('fwy', t('dash.freeway'), lenOf(freewayMi), lenUnit())}
      ${tile('toll', t('dash.tolled'), lenOf(tollMi), lenUnit())}
      ${acc ? `<div class="m" title="${esc(t('dash.accWhy', { n: num(acc.routes) }))}"><span class="m-k">${t('dash.accTile')}</span><div class="m-v">${acc.within5}<small>%</small></div></div>` : ''}
    </div>

    <div class="dash-card dash-wide">
      <h3>${t(all ? 'dash.bySystem' : 'dash.bySystemIn', { cc: t(`sys.country.${cc}`) })}</h3>
      <div class="in">
        <div class="cc-rows">${countries.map((c) => `
          <div class="cc-row">
            <div class="cc-hd">${c.sys ? `<i class="lg-dot" style="--sys-col:${SYS_COLOUR[c.sys]}"></i><b>${t(`sys.${c.sys}`)}</b>` : `<span class="flagdot flag-${c.cc}"></span><b>${t(`sys.country.${c.cc}`)}</b>`}
              <span>${num(lenOf(c.mi))} ${lenUnit()} · ${pctOf(c.mi, totalMi)}% · ${t('dash.nRoutes', { n: num(c.routes) })}</span></div>
            <div class="stack" style="width:${((c.mi / maxCc) * 100).toFixed(1)}%">${c.systems.map((x) => `<i style="flex:${x.mi};background:${x.colour}" title="${esc(t(`sys.${x.id}`))} · ${num(lenOf(x.mi))} ${lenUnit()}"></i>`).join('')}</div>
            <ul class="stack-key">${c.systems.map((x) => `<li><i style="background:${x.colour}"></i>${t(`sys.${x.id}`)}
              <b>${num(lenOf(x.mi))}</b><small>${pctOf(x.mi, c.mi)}%</small></li>`).join('')}</ul>
          </div>`).join('')}</div>
      </div>
    </div>

    <div class="dash-cols">
      ${classRows.length ? `<div class="dash-card">
        <h3>${t('dash.byClass')}</h3>
        <div class="in">
          <div class="stack stack-tall">${classRows.map((r) => `<i style="flex:${r.v};background:${CLASS_COLOUR[r.cls] || '#4a5768'}" title="${esc(r.k)}"></i>`).join('')}</div>
          <ul class="stack-key stack-key-col">${classRows.map((r) => `<li><i style="background:${CLASS_COLOUR[r.cls] || '#4a5768'}"></i>${r.k}
            <b>${num(lenOf(r.v))}</b><small>${pctOf(r.v, classTotal)}%</small></li>`).join('')}</ul>
          <p class="hbar-note">${t('dash.byClass.note')}</p></div>
      </div>` : ''}
      <div class="dash-card">
        <h3>${t('dash.lengths')}</h3>
        <div class="in">
          <div class="hist" role="img">${hist.map((h) => `
            <div class="hist-c" title="${num(h.n)}">
              <span class="hist-n">${num(h.n)}</span>
              <div class="hist-b" style="height:${((h.n / histMax) * 100).toFixed(1)}%">${[...keys].reverse().map((k) => (h.by[k]
                ? `<i style="flex:${h.by[k]};background:${colourOfKey(k)}"></i>` : '')).join('')}</div>
              <span class="hist-k">${h.hi === Infinity ? `${edgeLabel(h.lo)}+` : edgeLabel(h.hi)}</span>
            </div>`).join('')}</div>
          <ul class="stack-key">${keys.map((k) => `<li><i style="background:${colourOfKey(k)}"></i>${nameOfKey(k)}</li>`).join('')}</ul>
          <p class="hbar-note">${t('dash.lengths.note', { u: lenUnit() })}</p>
        </div>
      </div>
    </div>

    <div class="dash-card dash-wide" style="margin-top:20px">
      <h3>${t('dash.profile')}</h3>
      <div class="dc-tbl-w"><table class="tbl dash-prof">
        <thead><tr><th>${t('dash.profile.sys')}</th><th class="r">${t('dash.routes')}</th><th class="r">${t('dash.profile.len')} · ${lenUnit()}</th>
          <th class="r">${t('dash.profile.median')} · ${lenUnit()}</th><th>${t('dash.profile.gs')}</th><th>${t('dash.profile.toll')}</th><th>${t('dash.profile.longest')}</th></tr></thead>
        <tbody>${profile.map((p) => `<tr>
          <td><i class="lg-dot" style="--sys-col:${p.colour}"></i>${t(`sys.${p.id}`)}</td>
          <td class="r">${num(p.routes)}</td>
          <td class="r">${num(lenOf(p.mi))}</td>
          <td class="r">${lenNum(p.median)}</td>
          <td><span class="pbar"><i style="width:${p.gs.toFixed(1)}%;background:${p.colour}"></i></span><small>${num(p.gs, p.gs < 10 ? 1 : 0)}%</small></td>
          <td><span class="pbar"><i style="width:${p.toll.toFixed(1)}%;background:var(--amber)"></i></span><small>${num(p.toll, p.toll < 10 ? 1 : 0)}%</small></td>
          <td>${p.longest ? `<a class="dash-go" data-id="${p.longest.id}">${esc(p.longest.label)}</a> <small>${lenNum(p.longest.mi)}</small>` : ''}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>

    ${stateCols.length ? `<div class="dash-card dash-wide">
      <h3>${t('dash.byState')} · ${t('dash.mostMiles')}</h3>
      <div class="in ${all ? 'dash-3' : 'dash-1'}">${stateCols.map((c) => `
        <div><p class="dash-sub"><span class="flagdot flag-${c}"></span>${t(`sys.country.${c}`)}</p>
          ${bars(stateRowsOf(c, all ? 8 : 16), () => CC_COLOUR[c])}</div>`).join('')}</div>
    </div>` : ''}

    <div class="dash-cols">
      <div class="dash-card">
        <h3>${t('dash.widest')}</h3>
        <div class="in">
          <div class="hbars">${widest.map((r) => `
            <div class="hbar hbar-route" data-id="${r.id}">
              <span class="hbar-k"><b>${r.label}</b><small>${lenNum(r.mi)} ${lenUnit()}</small></span>
              <span class="hbar-t"><i style="width:${((r.ns / widest[0].ns) * 100).toFixed(1)}%;background:${SYS_COLOUR[r.sys] || 'var(--cyan)'}"></i></span>
              <span class="hbar-v">${r.ns}</span>
            </div>`).join('')}</div>
        </div>
      </div>
      ${acc ? `<div class="dash-card">
        <h3>${t('dash.acc')}</h3>
        <div class="in">
          <div class="acc-range">
            <div class="acc-axis"><span>−25%</span><span>0</span><span>+25%</span></div>
            <div class="acc-track">
              <i class="acc-band" style="left:${accX(acc.p10)}%;width:${accX(acc.p90) - accX(acc.p10)}%"></i>
              <i class="acc-mid" style="left:${accX(acc.median)}%"></i>
            </div>
            <p class="acc-k">${t('dash.acc.range', { lo: acc.p10, mid: acc.median > 0 ? `+${acc.median}` : acc.median, hi: `+${acc.p90}` })}</p>
          </div>
          ${bars([5, 10, 25].map((w) => ({ k: t('dash.acc.within', { n: w }), v: acc[`within${w}`], suffix: '%' })), () => 'var(--lime)', 100)}
          <p class="hbar-note">${t('dash.acc.note', { n: num(acc.routes) })}</p>
        </div>
      </div>` : ''}
    </div>

    <div class="dash-card dash-wide" id="dashSpeed" hidden></div>
    ${all || cc === 'us' ? '<div class="dash-card dash-wide" id="dashBuild" hidden></div>' : ''}
    ${all || cc === 'cn' ? '<div class="dash-card dash-wide" id="dashBuildCn" hidden></div>' : ''}

    <div class="dash-card dash-wide" style="margin-top:20px">
      <h3>${t('dash.longest')}</h3>
      <div class="in">
        <div class="hbars">${longest.map((r) => `
          <div class="hbar hbar-route" data-id="${r.id}">
            <span class="hbar-k"><b>${r.label}</b><small>${ownerLabel(r.sys, r.st)} · ${t('dash.nStates', { n: num(r.ns) })}</small></span>
            <span class="hbar-t"><i style="width:${((r.mi / longest[0].mi) * 100).toFixed(1)}%;background:${SYS_COLOUR[r.sys] || 'var(--cyan)'}"></i></span>
            <span class="hbar-v">${lenNum(r.mi)}</span>
          </div>`).join('')}</div>
      </div>
    </div>`;
}

/* How the Interstates were built, from FHWA's year-end mileage open to traffic.
   It is the one complete account of any system's growth in the atlas - no
   other country publishes a year-by-year series per system - so it is shown
   for the whole atlas and for the United States, and named as what it is. */
let buildPromise = null;
function buildout() {
  buildPromise ||= fetch('data/timeline.json').then((r) => (r.ok ? r.json() : null))
    .then((h) => (h?.mileage?.open?.length ? h : null)).catch(() => null);
  return buildPromise;
}

function buildoutCard(h) {
  const open = h.mileage.open.map(([year, mi, designated]) => ({ year, mi, designated }));
  const first = open[0];
  const last = open.at(-1);
  const top = Math.max(...open.map((o) => Math.max(o.mi, o.designated)));
  const W = 600;
  const H = 120;
  const x = (y) => ((y - first.year) / (last.year - first.year)) * W;
  const y = (mi) => H - (mi / top) * (H - 8);
  const line = open.map((o, i) => `${i ? 'L' : 'M'}${x(o.year).toFixed(1)} ${y(o.mi).toFixed(1)}`).join(' ');
  const goal = open.map((o, i) => `${i ? 'L' : 'M'}${x(o.year).toFixed(1)} ${y(o.designated).toFixed(1)}`).join(' ');
  // By decade, from the difference between year-ends; what was open by 1960
  // is its own bar, because the table does not say when before then it opened.
  const at = (yr) => open.find((o) => o.year === yr)?.mi ?? last.mi;
  const decades = [
    { k: t('build.before', { y: first.year }), v: first.mi },
    ...[1960, 1970, 1980, 1990].map((d) => ({
      k: d === 1990 ? `1990–${last.year}` : t('build.decade', { d }),
      v: at(Math.min(d + 9, last.year)) - (d === 1960 ? first.mi : at(d - 1)),
    })),
  ];
  const vmax = Math.max(...decades.map((d) => d.v));
  const events = (h.events || []).filter((e) => e.system && !e.kind && e.year >= first.year && e.year <= last.year);
  return `
    <h3>${t('build.title')}</h3>
    <div class="in build">
      <svg class="build-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
        <path class="build-area" d="${line} L${W} ${H} L0 ${H} Z"/>
        <path class="build-goal" d="${goal}"/>
        <path class="build-line" d="${line}"/>
      </svg>
      <div class="build-ev">${events.map((e) => `<i style="left:${((x(e.year) / W) * 100).toFixed(1)}%" title="${e.year} · ${esc(e[getLang()] || e.en)}"></i>`).join('')}</div>
      <div class="build-ax"><span>${first.year}</span><span>${last.year}</span></div>
      <div class="build-dec">${decades.map((d) => `
        <div><span class="build-b"><i style="height:${((d.v / vmax) * 100).toFixed(1)}%"></i></span>
          <b>${num(lenOf(d.v))}</b><small>${d.k}</small></div>`).join('')}</div>
      <p class="hbar-note">${t('build.note', { a: num(lenOf(first.mi)), b: num(lenOf(last.mi)), u: lenUnit(), y0: first.year, y1: last.year })}</p>
    </div>`;
}

/* The mainland publishes no year-by-year mileage per system, so its account is
   the year each main line's dossier says it was finished end to end - a count
   of lines, not of kilometres, with the lines no dossier dates listed as such. */
function mainlandCard(lines) {
  const dated = lines.filter((l) => l.year);
  const rest = lines.filter((l) => !l.year);
  if (!dated.length) return '';
  const y0 = Math.min(2000, dated[0].year);
  const y1 = Math.max(new Date().getFullYear(), dated.at(-1).year);
  const W = 600;
  const H = 120;
  const x = (yr) => ((yr - y0) / (y1 - y0)) * W;
  const y = (n) => H - (n / lines.length) * (H - 8);
  let n = 0;
  let line = `M0 ${H}`;
  for (const l of dated) {
    line += ` L${x(l.year).toFixed(1)} ${y(n).toFixed(1)}`;
    n += 1;
    line += ` L${x(l.year).toFixed(1)} ${y(n).toFixed(1)}`;
  }
  line += ` L${W} ${y(n).toFixed(1)}`;
  const chip = (l) => `<a class="dash-go" data-id="${l.id}">${esc(l.label)}</a>${l.year ? ` <small>${l.year}</small>` : ''}`;
  return `
    <h3>${t('build.cn.title')}</h3>
    <div class="in build">
      <svg class="build-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
        <path class="build-goal" d="M0 ${y(lines.length).toFixed(1)} L${W} ${y(lines.length).toFixed(1)}"/>
        <path class="build-area" d="${line} L${W} ${H} L0 ${H} Z"/>
        <path class="build-line" d="${line}"/>
      </svg>
      <div class="build-ev">${dated.map((l) => `<i style="left:${((x(l.year) / W) * 100).toFixed(1)}%" title="${l.year} · ${esc(l.label)}"></i>`).join('')}</div>
      <div class="build-ax"><span>${y0}</span><span>${y1}</span></div>
      <p class="dash-sub">${t('build.cn.dated', { n: dated.length, of: lines.length })}</p>
      <p class="build-chips">${dated.map(chip).join(' · ')}</p>
      ${rest.length ? `<p class="dash-sub">${t('build.cn.open', { n: rest.length })}</p>
      <p class="build-chips">${rest.map(chip).join(' · ')}</p>` : ''}
      <p class="hbar-note">${t('build.cn.note', { n: lines.length })}</p>
    </div>`;
}

/* How much of each network is signed at what, by length. A bar per country
   for the whole atlas and per system inside one. What was read off a sign
   is solid; what the law sets by default is hatched, so the two never pass
   for each other; grey is road no source covers. */
function speedCard(d, cc) {
  const all = cc === 'all';
  const rows = all
    ? DASH_CC.filter((c) => d.summary[c]).map((c) => ({ key: c, name: t(`sys.country.${c}`), flag: c, s: d.summary[c] }))
    : SYSTEMS.filter((x) => x.cc === cc && d.systems[x.id]).map((x) => ({ key: x.id, name: t(`sys.${x.id}`), colour: x.colour, s: d.systems[x.id] }));
  if (!rows.length) return '';
  const typical = (s) => {
    const by = BANDS.map((k) => [k, (s.bands[k] || 0) + (s.law[k] || 0)]);
    const half = by.reduce((a, [, v]) => a + v, 0) / 2;
    let acc = 0;
    for (const [k, v] of by) { acc += v; if (half && acc >= half) return k; }
    return null;
  };
  const pct = (v, w) => (w ? (v / w) * 100 : 0);
  const body = rows.map(({ name, flag, colour, s }) => {
    const known = (s.bySrc.p || 0) + (s.bySrc.o || 0);
    const unknown = Math.max(0, s.mi - known - (s.bySrc.l || 0));
    const typ = typical(s);
    const segs = [
      ...BANDS.filter((k) => s.bands[k]).map((k) => `<i style="flex:${s.bands[k]};background:${speedColour(k)}" title="${bandLabel(k)} ${speedUnit()} · ${num(lenOf(s.bands[k]))} ${lenUnit()}"></i>`),
      ...BANDS.filter((k) => s.law[k]).map((k) => `<i class="spd-law" style="flex:${s.law[k]};--c:${speedColour(k)}" title="${esc(t('spd.src.l'))} ${bandLabel(k)} ${speedUnit()} · ${num(lenOf(s.law[k]))} ${lenUnit()}"></i>`),
      unknown > 0 ? `<i style="flex:${unknown};background:${UNKNOWN};opacity:.35" title="${esc(t('spd.none'))} · ${num(lenOf(unknown))} ${lenUnit()}"></i>` : '',
    ].join('');
    return `<div class="spd-row">
      <div class="cc-hd">${flag ? `<span class="flagdot flag-${flag}"></span>` : `<i class="lg-dot" style="--sys-col:${colour}"></i>`}<b>${name}</b>
        <span>${typ ? t('dash.speed.typical', { v: `${bandLabel(typ)} ${speedUnit()}` }) + ' · ' : ''}${t('dash.speed.measured', { pct: num(pct(known, s.mi)) })}</span></div>
      <div class="stack">${segs}</div>
    </div>`;
  }).join('');
  const key = BANDS.map((k) => `<li><i style="background:${speedColour(k)}"></i>${bandLabel(k)}${k === 120 ? '+' : ''}</li>`).join('')
    + `<li><i class="spd-law" style="--c:${speedColour(80)}"></i>${t('spd.src.l')}</li>`
    + `<li><i style="background:${UNKNOWN};opacity:.35"></i>${t('spd.none')}</li>`;
  return `<h3>${t('dash.speed')} · ${speedUnit()}</h3>
    <div class="in">
      <div class="cc-rows">${body}</div>
      <ul class="stack-key spd-key">${key}</ul>
      <p class="hbar-note">${t('dash.speed.note')}</p>
    </div>`;
}

// The headline figures run from what they last said to what they say now.
function countTiles(host) {
  const ease = (x) => 1 - (1 - x) ** 3;
  const t0 = performance.now();
  const tiles = [...host.querySelectorAll('[data-tile]')].map((el) => ({
    el, key: el.dataset.tile, to: Number(el.dataset.to), from: dashPrev[el.dataset.tile] ?? 0,
  }));
  for (const x of tiles) dashPrev[x.key] = x.to;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const step = (now) => {
    const k = Math.min(1, (now - t0) / 700);
    for (const x of tiles) x.el.textContent = num(Math.round(x.from + (x.to - x.from) * ease(k)));
    if (k < 1 && host.isConnected) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function wireDashBody(host) {
  for (const row of host.querySelectorAll('.hbar-route[data-id], .dash-go[data-id]')) {
    row.addEventListener('click', () => { closeSheet(); select(row.dataset.id); });
  }
  for (const bar of host.querySelectorAll('.hbar[data-st]')) {
    bar.addEventListener('click', () => {
      const st = bar.dataset.st;
      closeSheet();
      loadState(st).then(() => zoomToState(st));
    });
  }
  host.classList.remove('anim');
  void host.offsetWidth;
  host.classList.add('anim');
  countTiles(host);
  const cc = dashCc;
  loadSpeed().then((d) => {
    const slot = host.querySelector('#dashSpeed');
    if (!d || !slot || cc !== dashCc) return;
    slot.innerHTML = speedCard(d, cc);
    slot.hidden = false;
  });
  buildout().then((h) => {
    const slot = host.querySelector('#dashBuild');
    if (!h || !slot) return;
    slot.innerHTML = buildoutCard(h);
    slot.hidden = false;
  });
  buildout().then((h) => {
    const slot = host.querySelector('#dashBuildCn');
    if (!h?.mainland?.length || !slot) return;
    slot.innerHTML = mainlandCard(h.mainland);
    slot.hidden = false;
    for (const a of slot.querySelectorAll('.dash-go[data-id]')) {
      a.addEventListener('click', () => { closeSheet(); select(a.dataset.id); });
    }
  });
}

export function wireDashboard() {
  const host = document.getElementById('dashBody');
  for (const b of document.querySelectorAll('.dash-cc')) {
    b.addEventListener('click', () => {
      if (b.dataset.cc === dashCc) return;
      dashCc = b.dataset.cc;
      for (const o of document.querySelectorAll('.dash-cc')) o.classList.toggle('on', o === b);
      host.innerHTML = dashBody(dashCc);
      wireDashBody(host);
    });
  }
  wireDashBody(host);
}
