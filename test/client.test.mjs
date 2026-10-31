// The browser modules that hold no DOM state: the schema the build shares, and
// the unit and label formatting every panel goes through.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

globalThis.document = { documentElement: { dataset: {} } };
const { SYSTEMS, COUNTRIES, FIELDS, system, systemOfCode } = await import('../assets/schema.js');
const i18n = await import('../assets/i18n.js');

test('schema: every system is unique and belongs to a country', () => {
  assert.equal(new Set(SYSTEMS.map((s) => s.id)).size, SYSTEMS.length);
  assert.equal(new Set(SYSTEMS.map((s) => s.code)).size, SYSTEMS.length);
  for (const s of SYSTEMS) {
    assert.ok(COUNTRIES.includes(s.cc), `${s.id} in a known country`);
    assert.equal(systemOfCode(s.code), s);
    assert.equal(system(s.id), s);
  }
});

test('schema: data/index.json is written with the fields the client reads', async () => {
  const idx = JSON.parse(await readFile(new URL('../data/index.json', import.meta.url), 'utf8'));
  assert.deepEqual(idx.fields, FIELDS);
  const codes = new Set(SYSTEMS.map((s) => s.code));
  const sys = FIELDS.indexOf('sys');
  for (const r of idx.routes) assert.ok(codes.has(r[sys]), `system code ${r[sys]}`);
});

test('units convert at display, never in storage', () => {
  const { setUnits, setLang, dist, lenNum, distKm, speedKph, num } = i18n;
  setLang('en');
  setUnits('metric');
  assert.equal(dist(100), '161 km');
  assert.equal(distKm(100), '100 km');
  assert.equal(speedKph(100), '100 km/h');
  setUnits('imperial');
  assert.equal(dist(100), '100 mi');
  assert.equal(distKm(161), '100 mi');
  assert.equal(speedKph(100), '62 mph');
  assert.equal(lenNum(0), '<1');
  assert.equal(num(null), '—');
  assert.equal(num(1234.5, 1), '1,234.5');
});

test('default units follow the reader\'s region', () => {
  assert.equal(i18n.defaultUnits('en-US'), 'imperial');
  assert.equal(i18n.defaultUnits('en-CA'), 'metric');
  assert.equal(i18n.defaultUnits('zh-CN'), 'metric');
});

test('labels and strings in Chinese', () => {
  const { setLang, routeLabel, t } = i18n;
  setLang('zh');
  assert.equal(routeLabel('Fwy 3A'), '國3甲');
  assert.equal(routeLabel('PH 61'), '台61');
  assert.equal(routeLabel('Route 9'), '9號幹線');
  assert.equal(routeLabel('TCH 1'), '横加公路 1');
  assert.equal(routeLabel('I-95'), 'I-95');
  assert.equal(t('no.such.key'), 'no.such.key');
  setLang('xx');
  assert.equal(i18n.getLang(), 'en', 'an unknown language falls back to English');
});
