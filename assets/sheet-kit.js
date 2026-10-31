/* What every overlay view shares: the sheet frame, bilingual strings, the
   bar chart, the system and country colours, and inline Markdown. Imports only
   leaves, so the views can import it without joining the sheets.js cycle. */

import { t, esc, num } from './i18n.js';
import { SYSTEMS } from './schema.js';

export function frame(titleKey, subKey, bodyHtml, subVars) {
  return `<div class="sh-hd">
      <div>
        <h2>${t(titleKey)}</h2>
        <p>${t(subKey, subVars)}</p>
      </div>
      <span class="sp"></span>
      <button class="btn btn-ico" id="shClose" type="button" aria-label="Close">
        <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="1.8"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </div>
    <div class="sh-bd">${bodyHtml}</div>`;
}

/** A string in both languages. */
export function L(en, zh) { return { en, zh }; }

/* Straight off the system registry, so a country added to the atlas cannot
   reach the dashboard without a colour. The Canadian tiers used to fall
   through this table and draw their bars with `undefined` as a fill. */
export const SYS_COLOUR = Object.fromEntries(SYSTEMS.map((s) => [s.id, s.colour]));
/** Each country by the colour of its top tier, which is how the map shows it. */
export const DASH_CC = ['us', 'ca', 'mx', 'cn', 'tw', 'hk'];
export const CC_COLOUR = Object.fromEntries(DASH_CC.map((cc) => [cc, SYSTEMS.find((s) => s.cc === cc)?.colour]));

export function bars(rows, colourOf, maxOverride) {
  const max = maxOverride ?? Math.max(...rows.map((r) => r.v));
  return `<div class="hbars">${rows.map((r) => `
    <div class="hbar"${r.st ? ` data-st="${r.st}" style="cursor:pointer"` : ''}>
      <span class="hbar-k">${esc(r.k)}</span>
      <span class="hbar-t"><i style="width:${((r.v / max) * 100).toFixed(1)}%;background:${colourOf(r)}"></i></span>
      <span class="hbar-v">${num(r.v)}${r.suffix || ''}</span>
    </div>`).join('')}</div>`;
}

/** The handful of inline Markdown the documents use. */
export function inline(md) {
  const codes = [];
  let s = esc(md).replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, text, href) => (/^https?:/.test(href)
    ? `<a href="${href}" target="_blank" rel="noopener">${text}</a>`
    : `<span class="dc-ref">${text}</span>`));
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (m, i) => `<code>${codes[i]}</code>`);
}

export const plain = (md) => String(md).replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*`]/g, '').trim();
