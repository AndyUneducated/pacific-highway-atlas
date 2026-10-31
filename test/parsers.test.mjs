// How each source's designations are read. Every case here is a real spelling
// the source uses (ARCHITECTURE.md §6).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseName } from '../tools/tiger.mjs';
import { normaliseRoute, parseRoute, state, routePrefix } from '../tools/mexico.mjs';
import { parseRef, classify } from '../tools/china.mjs';
import { parseNumber, taiwanLabel, tm2ToLonLat } from '../tools/taiwan.mjs';
import { decode, splitCsv, parseCsv } from '../tools/csv.mjs';

const nums = (r) => r.map((x) => `${x.system}:${x.number}${x.qualifier ? `:${x.qualifier}` : ''}`);

test('TIGER names', () => {
  assert.deepEqual(nums(parseName('I- 95', 'I')), ['us-interstate:95']);
  assert.deepEqual(nums(parseName('I- H-1', 'I', 'HI')), ['us-interstate:H1']);
  assert.deepEqual(nums(parseName('US Hwy 11/15', 'U')), ['us-numbered:11', 'us-numbered:15']);
  assert.deepEqual(nums(parseName('State Hwy M 28', 'S', 'MI')), ['us-state:M28']);
  assert.deepEqual(nums(parseName('State Rte 2 A', 'S', 'MA')), ['us-state:2A']);
  assert.deepEqual(nums(parseName('State Loop 265', 'S', 'TX')), ['us-state:265:loop']);
  assert.deepEqual(nums(parseName('FM 1960', 'S', 'TX')), ['us-state:FM1960']);
  assert.deepEqual(nums(parseName('US Hwy 1 Bus', 'U')), ['us-numbered:1:business']);
  assert.deepEqual(nums(parseName('E State Rte 10 W', 'S')), ['us-state:10']);
});

test('TIGER names that are not designations', () => {
  assert.deepEqual(parseName('Old US Hwy 395', 'U'), []);
  assert.deepEqual(parseName('Hst Rte 66', 'S'), []);
  assert.deepEqual(parseName('State Highway Patrol Rd', 'S'), []);
  assert.deepEqual(parseName('Main St', 'M'), []);
  assert.deepEqual(parseName('County Rd 12', 'C'), []);
  assert.deepEqual(parseName('', 'S'), []);
});

test('Mexican route numbers', () => {
  assert.deepEqual(normaliseRoute('MEX-15D'), [{ prefix: 'MEX', number: '015D', toll: true }]);
  assert.deepEqual(normaliseRoute('MEX 15 D'), [{ prefix: 'MEX', number: '015D', toll: true }]);
  assert.deepEqual(normaliseRoute('15'), [{ prefix: null, number: '015', toll: false }]);
  assert.deepEqual(normaliseRoute('EM-HGO'), [{ prefix: 'EM', number: 'HGO', toll: false }]);
  assert.equal(normaliseRoute('15/45').length, 2);
  assert.deepEqual(normaliseRoute('N/A'), []);
  assert.deepEqual(parseRoute('15', 'Calle'), [], 'CODIGO only counts on a carretera');
  assert.equal(parseRoute('15', 'Carretera')[0].number, '015');
});

test('Mexican states, however they are written', () => {
  assert.equal(state('Coahuila de Zaragoza').code, 'COA');
  assert.equal(state('Q.Roo.').code, 'ROO');
  assert.equal(state('Estado de México').code, 'MEX');
  assert.equal(state('33').code, 'FED');
  assert.equal(routePrefix(state('33')), 'MEX');
  assert.equal(routePrefix(state('15')), 'EM');
  assert.equal(state('nowhere'), null);
});

test('mainland ref tags', () => {
  assert.equal(parseRef('G4'), 'G4');
  assert.equal(parseRef('Ｇ４'), 'G4');
  assert.equal(parseRef('G0421'), 'G0421');
  assert.equal(parseRef('G045'), null, 'pre-2009 expressway number');
  assert.equal(parseRef('旧G105'), null);
  assert.equal(parseRef('G105(G106)'), 'G105');
  assert.equal(parseRef('X123'), null);
  assert.deepEqual(classify('G4'), { system: 'cn-expressway', tier: 'primary' });
  assert.deepEqual(classify('G0421'), { system: 'cn-expressway', tier: 'auxiliary' });
  assert.deepEqual(classify('G105'), { system: 'cn-national', tier: 'primary' });
  assert.deepEqual(classify('G506'), { system: 'cn-national', tier: 'auxiliary' });
  assert.equal(classify('S1').system, 'cn-provincial');
});

test('Taiwanese route numbers', () => {
  assert.deepEqual(parseNumber('台1甲'), { system: 'tw-provincial', base: 1, suffix: 'A', number: '1A' });
  assert.equal(parseNumber('國3甲').system, 'tw-freeway');
  assert.equal(parseNumber('臺61').number, '61');
  assert.equal(parseNumber('台16臨29'), null, 'provisional alignments are not routes');
  assert.equal(taiwanLabel('tw-freeway', '3A'), 'Fwy 3A');
  assert.equal(taiwanLabel('tw-provincial', '9'), 'PH 9');
  const [lon, lat] = tm2ToLonLat([250000, 2650000]);
  assert.ok(Math.abs(lon - 121) < 1e-9);
  assert.ok(lat > 23.9 && lat < 24.0);
});

test('CSV as ministries write it', () => {
  const rows = splitCsv('a,b\r\n"x, y","say ""hi"""\r\n"two\nlines",3\r\n\r\n');
  assert.deepEqual(rows, [['a', 'b'], ['x, y', 'say "hi"'], ['two\nlines', '3']]);
  assert.deepEqual(parseCsv('HIGHWAY NAME,Km\n401,828'), [{ 'highway name': '401', km: '828' }]);
  const bom = decode(new Uint8Array([0xef, 0xbb, 0xbf, 0x61]));
  assert.deepEqual(bom, { text: 'a', encoding: 'utf-8' });
  const latin = decode(new Uint8Array([0x4d, 0xe9, 0x78]));
  assert.deepEqual(latin, { text: 'Méx', encoding: 'windows-1252' });
});
