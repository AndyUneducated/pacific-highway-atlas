// The stitching cases ARCHITECTURE.md §3 describes, each as a synthetic road.
// Every one of them once produced a confidently wrong length.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  haversineKm, lineLengthKm, simplify, chainLines, stitchRoute, drivenEdgeKm,
  stitchBetween, resample,
} from '../tools/geo.mjs';

const KM_PER_DEG = 111.195;
const SNAP = 0.0002;

/** A straight east-west line at `lat`, from lon a to b, with `n` vertices. */
const line = (a, b, lat = 0, n = 20) =>
  Array.from({ length: n }, (_, i) => [a + ((b - a) * i) / (n - 1), lat]);

/** Cut a polyline into `k` fragments that share their end vertices. */
function fragments(coords, k) {
  const step = Math.ceil((coords.length - 1) / k);
  const out = [];
  for (let i = 0; i < coords.length - 1; i += step) out.push(coords.slice(i, Math.min(i + step, coords.length - 1) + 1));
  return out;
}

const parts = (lines) => lines.map((coords) => ({ coords, props: {} }));
const near = (got, want, tol, msg) => assert.ok(Math.abs(got - want) <= tol, `${msg}: ${got.toFixed(2)} vs ${want.toFixed(2)}`);

test('haversine: one degree of latitude', () => {
  near(haversineKm([0, 0], [0, 1]), KM_PER_DEG, 0.01, 'km');
  near(lineLengthKm(line(0, 1)), KM_PER_DEG, 0.01, 'line');
});

test('simplify keeps both ends and drops collinear vertices', () => {
  const out = simplify(line(0, 1, 10, 50), 0.001);
  assert.deepEqual(out, [[0, 10], [1, 10]]);
  const bent = simplify([[0, 0], [0.5, 0.2], [1, 0]], 0.001);
  assert.equal(bent.length, 3);
});

test('chainLines joins continuations but never across a junction', () => {
  assert.equal(chainLines([[[0, 0], [1, 0]], [[1, 0], [2, 0]]]).length, 1);
  // three ends meet at [1,0]: a junction, so nothing joins there
  assert.equal(chainLines([[[0, 0], [1, 0]], [[1, 0], [2, 0]], [[1, 0], [1, 1]]]).length, 3);
});

test('fragments within the snap tolerance stitch into one road', () => {
  const pieces = fragments(line(0, 0.5), 5).map((c, i) => (i ? [[c[0][0] + 0.00005, c[0][1]], ...c.slice(1)] : c));
  const comps = stitchRoute(parts(pieces), { snapDeg: SNAP, bridgeKm: 0 });
  assert.equal(comps.length, 1);
  near(comps[0].pathKm, 0.5 * KM_PER_DEG, 0.1, 'pathKm');
});

test('a hole in the source is bridged, and the bridge is not counted as road', () => {
  const west = line(0, 0.5), east = line(0.6, 1.1);
  const bridged = stitchRoute(parts([west, east]), { snapDeg: SNAP, bridgeKm: 60 });
  assert.equal(bridged.length, 1, 'one road');
  near(bridged[0].gaps[0], 0.1 * KM_PER_DEG, 0.1, 'gap');
  near(bridged[0].pathKm, 1.0 * KM_PER_DEG, 0.1, 'pathKm excludes the gap');
  assert.equal(stitchRoute(parts([west, east]), { snapDeg: SNAP, bridgeKm: 5 }).length, 2, 'beyond the budget');
});

test('a ring is carried all the way round', () => {
  const r = 0.1;
  const circle = Array.from({ length: 73 }, (_, i) => {
    const a = (i / 72) * 2 * Math.PI;
    return [r * Math.cos(a), r * Math.sin(a)];
  });
  const comps = stitchRoute(parts(fragments(circle, 6)), { snapDeg: SNAP, bridgeKm: 0 });
  assert.equal(comps.length, 1);
  near(comps[0].pathKm, lineLengthKm(circle), 0.5, 'the whole loop');
});

test('a divided highway joined at both ends is measured once, not as a ring', () => {
  const a = line(0, 0.5, 0), b = line(0, 0.5, 0.0003);
  const ends = [[[0, 0], [0, 0.0003]], [[0.5, 0], [0.5, 0.0003]]];
  const comps = stitchRoute(parts([...fragments(a, 5), ...fragments(b, 5), ...ends]), { snapDeg: SNAP, bridgeKm: 0 });
  assert.equal(comps.length, 1);
  near(comps[0].pathKm, 0.5 * KM_PER_DEG, 0.5, 'one carriageway');
  assert.ok(comps[0].km > 1.9 * 0.5 * KM_PER_DEG, 'both carriageways are still pavement');
});

test('opposite carriageways in separate components are drawn but counted once', () => {
  const a = line(0, 0.5, 0), b = line(0, 0.5, 0.0003);
  const comps = stitchRoute(parts([a, b]), { snapDeg: SNAP, bridgeKm: 0, dedupe: true });
  assert.equal(comps.length, 1);
  assert.equal(comps[0].branches.length, 1, 'the far side becomes a branch');
});

test('a road folded out and back is driven once', () => {
  const out = line(0, 0.1, 0, 40), back = line(0.1, 0, 0.0002, 40);
  const edges = [{ coords: out, km: lineLengthKm(out) }, { coords: back, km: lineLengthKm(back) }];
  const driven = drivenEdgeKm(edges).reduce((s, x) => s + x, 0);
  // Within minAlongKm of the turn the two passes are too close along the path
  // to be told from a switchback, so up to 1.6 km there stays counted.
  const once = 0.1 * KM_PER_DEG;
  assert.ok(driven >= once - 0.1 && driven <= once + 1.6, `driven ${driven.toFixed(2)} of ${once.toFixed(2)}`);
});

test('switchbacks are genuine distance, not a doubled carriageway', () => {
  // ten 0.5 km legs, 60 m apart, joined by hairpins
  const legDeg = 0.5 / KM_PER_DEG, gap = 0.06 / KM_PER_DEG;
  const zig = [];
  for (let i = 0; i < 10; i++) {
    const y = i * gap;
    zig.push(...(i % 2 ? line(legDeg, 0, y, 10) : line(0, legDeg, y, 10)));
  }
  const km = lineLengthKm(zig);
  const driven = drivenEdgeKm([{ coords: zig, km }])[0];
  near(driven, km, 0.05, 'nothing discounted');
});

test('stitchBetween returns the path between two declared points', () => {
  const road = fragments(line(0, 1), 4);
  const got = stitchBetween(parts(road), [0.25, 0.001], [0.75, -0.001], { snapDeg: SNAP, bridgeKm: 0 });
  near(got.pathKm, 0.5 * KM_PER_DEG, 0.5, 'between');
  assert.ok(got.snapKm.every((d) => d < 0.2));
});

test('resample spaces points evenly along the line', () => {
  const pts = resample(line(0, 0.1, 0, 3), 1);
  assert.equal(pts.length, Math.floor(0.1 * KM_PER_DEG) + 1);
  near(haversineKm(pts[0], pts[1]), 1, 0.001, 'step');
});
