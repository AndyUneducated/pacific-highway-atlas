/* The overlay sheet: opening and closing it, and the two small views that
   live here, the jurisdiction picker and the about page. The larger views are
   numbering.js, dashboard.js and docs-view.js. */

import { countryOfJuris, getLang, t, stateName, dist, num } from './i18n.js';
import { app, loadState, zoomToState } from './app.js';
import { SYSTEMS, countryOf } from './schema.js';
import { frame, DASH_CC } from './sheet-kit.js';
import { renderNumbering, wireNumbering } from './numbering.js';
import { renderDashboard, wireDashboard } from './dashboard.js';
import { renderDocs, wireDocs, setDocsTab } from './docs-view.js';

let current = null;

export function isSheetOpen() { return current; }

export function closeSheet() {
  document.getElementById('sheet').classList.add('hidden');
  current = null;
}

export function openSheet(key) {
  const host = document.getElementById('sheet');
  const inner = document.getElementById('sheetInner');
  current = key;

  const render = {
    numbering: renderNumbering,
    dashboard: renderDashboard,
    states: renderStates,
    provinces: renderProvinces,
    mxstates: renderMxStates,
    cnprovinces: renderCnProvinces,
    about: renderAbout,
    docs: renderDocs,
  }[key];
  if (!render) { current = null; return; }

  inner.innerHTML = render();
  host.classList.remove('hidden');
  document.getElementById('shClose').addEventListener('click', closeSheet);
  host.onclick = (e) => { if (e.target.id === 'sheet') closeSheet(); };

  ({
    numbering: wireNumbering,
    dashboard: wireDashboard,
    states: wireStates,
    provinces: wireStates,
    mxstates: wireStates,
    cnprovinces: wireStates,
    about: wireAbout,
    docs: wireDocs,
  }[key])();
}

/* ══════════════════════════════════════════════════════════════════════
   Jurisdiction picker

   One picker, two tiers. American state routes and Canadian provincial
   highways are the same problem - too much geometry to ship as one file, so
   the reader chooses where to look - and they get the same sheet, filtered to
   the country that asked for it.
   ══════════════════════════════════════════════════════════════════════ */

function renderJurisdictions(sys) {
  const cc = countryOf(sys);
  const ca = cc === 'ca';
  const rows = Object.entries(app.stats.byState)
    .filter(([code]) => countryOfJuris(code) === cc)
    .sort((a, b) => stateName(a[0]).localeCompare(stateName(b[0]), getLang() === 'zh' ? 'zh' : 'en'));

  const title = { us: 'sys.pickState', ca: 'sys.pickProvince', mx: 'sys.pickMxState', cn: 'sys.pickCnProvince' }[cc];
  return frame(title, `sys.${sys}.meta`, `
    <div class="jur-grid">
      ${rows.map(([code, v]) => `<button class="sys jur" data-load="${code}" type="button">
        <span class="sys-txt">
          <span class="sys-name">${stateName(code)}</span>
          <span class="sys-meta">${num(v[sys] ? v.routes : 0)} · ${dist(v[sys] || 0)}</span>
        </span>
        ${app.stateLoaded.has(code) ? '<span class="pill">on</span>' : ''}
      </button>`).join('')}
    </div>
    ${ca ? `<div class="note" style="margin-top:13px">
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.6v.1"/></svg>
      <span>${t('ca.municipalWhy')}</span></div>` : ''}
    ${cc === 'mx' ? `<div class="note" style="margin-top:13px">
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.6v.1"/></svg>
      <span>${t('mx.unsignedStates')}</span></div>` : ''}
    ${cc === 'cn' ? `<div class="note" style="margin-top:13px">
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.6v.1"/></svg>
      <span>${t('cn.provincialWhy')}</span></div>` : ''}`);
}

const renderStates = () => renderJurisdictions('us-state');
const renderProvinces = () => renderJurisdictions('ca-provincial');
const renderMxStates = () => renderJurisdictions('mx-state');
const renderCnProvinces = () => renderJurisdictions('cn-provincial');

function wireStates() {
  for (const btn of document.querySelectorAll('[data-load]')) {
    btn.addEventListener('click', async () => {
      const st = btn.dataset.load;
      closeSheet();
      await loadState(st);
      zoomToState(st);
    });
  }
}

/* ══════════════════════════════════════════════════════════════════════
   About
   ══════════════════════════════════════════════════════════════════════ */

function renderAbout() {
  const zh = getLang() === 'zh';
  const s = app.stats;
  const totalMi = Object.values(s.bySystem).reduce((a, b) => a + b.mi, 0);
  const juris = Object.keys(s.byState).length;

  // The accuracy sentence is built from the figure the last build measured,
  // not from a claim typed in here, so it cannot quietly stop being true.
  const a = s.accuracy;
  const acc = {
    en: a
      ? `Across the ${num(a.routes)} routes where an official figure exists to check against,
         the median disagreement is ${a.median > 0 ? '+' : ''}${a.median}%, and
         ${a.within5}% land within 5%.`
      : '',
    zh: a
      ? `在有官方里程可供核对的 ${num(a.routes)} 条路线上，实测值与官方值的中位差为
         ${a.median > 0 ? '+' : ''}${a.median}%，其中 ${a.within5}% 的路线差距在 5% 以内。`
      : '',
  };

  const sysChips = DASH_CC.map((cc) => `<p class="ab-cc"><span class="flagdot flag-${cc}"></span><b>${t(`sys.country.${cc}`)}</b>
    ${SYSTEMS.filter((x) => x.cc === cc).map((x) => `<span class="ab-chip" style="--sys-col:${x.colour}">${t(`sys.${x.id}`)}</span>`).join('')}</p>`).join('');
  const go = (tab, label) => `<button class="ab-go" type="button" data-docs="${tab}">${label}<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>`;
  const L = (href, text) => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;

  const copy = zh ? {
    what: ['它是什么', `北美三国与中国大陆、台湾、香港的编号公路网：${SYSTEMS.length} 个路网系统、${num(app.index.length)} 条路线、${dist(totalMi)} 制图里程，覆盖 ${juris} 个州、省、地区与县市。每条线都可以点开，看起止点、分州里程、路段构成、海拔剖面，部分路线还有成文介绍。`],
    data: ['数据从哪里来', [
      ['us', `几何取自 ${L('https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html', 'TIGER/Line')}，官方里程取自 FHWA 路线名录，车流、路况、车道取自 ${L('https://www.fhwa.dot.gov/policyinformation/hpms.cfm', 'HPMS')}。`],
      ['ca', `几何取自加拿大统计局《${L('https://www.statcan.gc.ca/en/lode/databases/odr', '国家道路网')}》，NHS 名录取自交通部，车流量取自公开批量数据的七个省与地区。`],
      ['mx', `几何取自 INEGI《${L('https://www.inegi.org.mx/programas/rnc/', '国家道路网')}》2025 版，车流量取自 SICT《${L('https://www.datos.gob.mx/dataset/datos_viales', 'Datos Viales')}》。`],
      ['cn', `几何取自 ${L('https://www.openstreetmap.org/copyright', 'OpenStreetMap')} 贡献者（Geofabrik 提取，ODbL 许可）——官方的天地图对境外访问不开放，这是本站唯一一处非官方几何来源，没有官方里程与车流。`],
      ['tw', `几何取自国土测绘中心《${L('https://data.gov.tw/dataset/73232', '道路中心線')}》，省道官方里程取自交通部公路局《${L('https://data.gov.tw/dataset/105020', '省道公路路線表')}》，国道里程取自高速公路局《${L('https://data.gov.tw/dataset/37652', '路段基本資訊')}》。`],
      ['hk', `几何取自运输署《${L('https://portal.csdi.gov.hk/csdi-webpage/dataset/td_rcd_1638949160594_2844', '道路網絡')}》（空间数据共享平台）。`],
    ], '底图 OpenFreeMap（OpenStreetMap），卫星影像 Esri，地形 Mapzen。'],
    read: ['怎么读', [
      ['实测', `长度、起止点、分州里程、路段等级，均由几何在本站算出，分向行驶的公路只计一次。${acc.zh}`],
      ['上报', '车流、路况、车道、限速，来自各国机构，一律按编号而非位置匹配，并注明覆盖了全线多少。'],
      ['撰写', '历史、造价、驾驶体验，每个数字都附来源；找不到公开数据就直接写明，不做估算。'],
    ], '官方里程与实测不一致时两者并列，差异会说明原因；渡轮、共线、未建成路段不绘制也不计入，详情面板会写明缺了多少。'],
    links: [['sources', '全部来源与许可'], ['coverage', '覆盖率'], ['accuracy', '准确性与已知缺口'], ['decisions', '处理决策']],
    keys: '键盘',
  } : {
    what: ['What it is', `The numbered highway networks of the three North American countries, mainland China, Taiwan and Hong Kong: ${SYSTEMS.length} route systems, ${num(app.index.length)} routes and ${dist(totalMi)} of mapped road across ${juris} states, provinces, territories and counties. Every line opens into its termini, its length by jurisdiction, what it is built as, an elevation profile and, for some, a written profile.`],
    data: ['Where the data comes from', [
      ['us', `Geometry from ${L('https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html', 'TIGER/Line')}, official lengths from the FHWA Route Log, traffic, condition and lanes from ${L('https://www.fhwa.dot.gov/policyinformation/hpms.cfm', 'HPMS')}.`],
      ['ca', `Geometry from Statistics Canada's ${L('https://www.statcan.gc.ca/en/lode/databases/odr', 'National Road Network')}, the NHS from Transport Canada, traffic from the seven jurisdictions that publish counts in bulk.`],
      ['mx', `Geometry from INEGI's ${L('https://www.inegi.org.mx/programas/rnc/', 'Red Nacional de Caminos')} 2025, traffic from SICT's ${L('https://www.datos.gob.mx/dataset/datos_viales', 'Datos Viales')}.`],
      ['cn', `Geometry from ${L('https://www.openstreetmap.org/copyright', 'OpenStreetMap')} contributors (Geofabrik extract, ODbL) - the official Tianditu service is closed to access from abroad, so this is the one place the atlas draws on a source that is not an authority, and there are no official lengths or traffic.`],
      ['tw', `Geometry from the NLSC's ${L('https://data.gov.tw/dataset/73232', 'road centrelines')}, provincial official lengths from the Highway Bureau's ${L('https://data.gov.tw/dataset/105020', 'provincial highway register')}, freeway lengths from the Freeway Bureau's ${L('https://data.gov.tw/dataset/37652', 'section chainages')}.`],
      ['hk', `Geometry from the Transport Department's ${L('https://portal.csdi.gov.hk/csdi-webpage/dataset/td_rcd_1638949160594_2844', 'Road Network')}, on the CSDI portal.`],
    ], 'Base map OpenFreeMap (OpenStreetMap), imagery Esri, terrain Mapzen.'],
    read: ['How to read it', [
      ['Measured', `Length, termini, length by jurisdiction and roadway class, computed here from the geometry, with a divided highway counted once. ${acc.en}`],
      ['Reported', 'Traffic, condition, lanes and speeds, as each country’s agencies publish them, joined by designation and never by position, with the share of the road they cover.'],
      ['Written', 'History, cost and character, each figure with its source. Where there is no public figure the page says so rather than estimating one.'],
    ], 'Where the official length and the measured one disagree, both are shown and the difference is explained. Ferries, concurrencies and unbuilt pieces are neither drawn nor counted, and the detail panel says how much is missing.'],
    links: [['sources', 'Every source and licence'], ['coverage', 'Coverage'], ['accuracy', 'Accuracy and known gaps'], ['decisions', 'Processing decisions']],
    keys: 'Keyboard',
  };

  const body = `
    <div class="ab">
      <section class="ab-part">
        <span class="ab-n">01</span><h4>${copy.what[0]}</h4>
        <p>${copy.what[1]}</p>
        ${sysChips}
      </section>
      <section class="ab-part">
        <span class="ab-n">02</span><h4>${copy.data[0]}</h4>
        ${copy.data[1].map(([cc, text]) => `<p class="ab-row"><span class="flagdot flag-${cc}"></span><span>${text}</span></p>`).join('')}
        <p class="ab-fine">${copy.data[2]}</p>
        <div class="ab-links">${go(copy.links[0][0], copy.links[0][1])}${go(copy.links[1][0], copy.links[1][1])}</div>
      </section>
      <section class="ab-part">
        <span class="ab-n">03</span><h4>${copy.read[0]}</h4>
        ${copy.read[1].map(([k, text]) => `<p class="ab-row"><b class="ab-k">${k}</b><span>${text}</span></p>`).join('')}
        <p class="ab-fine">${copy.read[2]}</p>
        <div class="ab-links">${go(copy.links[2][0], copy.links[2][1])}${go(copy.links[3][0], copy.links[3][1])}</div>
      </section>
    </div>
    <p class="ab-keys"><span>${copy.keys}</span><b>/</b> <b>Ctrl-K</b> ${zh ? '搜索' : 'search'} · <b>F</b> ${zh ? '巡航所选路线' : 'fly the selected route'} · <b>T</b> ${zh ? '三维地形' : '3D terrain'} · <b>Z</b> ${zh ? '隐藏界面' : 'hide the interface'} · <b>L</b> <b>S</b> <b>M</b> ${zh ? '图层、设置、更多' : 'layers, settings, more'} · <b>Esc</b> ${zh ? '返回' : 'back out'}</p>`;

  return frame('about.title', 'about.sub', body);
}

function wireAbout() {
  for (const b of document.querySelectorAll('[data-docs]')) {
    b.addEventListener('click', () => { setDocsTab(b.dataset.docs); openSheet('docs'); });
  }
}
