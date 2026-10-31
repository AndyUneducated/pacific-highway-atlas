# Roadmap

The work done and the work planned, across every region the atlas covers. What each figure is
and where it comes from stays in [DATA-SOURCES.md](DATA-SOURCES.md); what is missing and why in
[ACCURACY.md §6](ACCURACY.md#6-known-gaps). This file only tracks the work.

Dossiers now: United States 175, mainland China 76, Canada 37, Taiwan 30, Mexico 25, Hong Kong 10
(353 in all). Macao numbers none of its roads, so it has no routes and none are planned.

## Milestones

| Milestone | Date | What it delivered |
| --- | --- | --- |
| M0 | by 2026-10-14 | East Asia title lockup in every system: shield beside the name, the other language under it, other names as chips (D-75). Names are searchable. East Asian fields moved to where North America has them. |
| M1 | by 2026-10-14 | Elevation profiles for every mainland national, Taiwan and Hong Kong route. Lanes, bridge and tunnel share from OpenStreetMap (D-76). Hong Kong traffic from the census (HK-3), road names in Chinese (HK-4). |
| M2 | by 2026-10-14 | System histories: mainland 1981–2025, Taiwan freeways 1964–2013 and provincial 1939–2026, Hong Kong 1972–2025. |
| M3 | by 2026-10-14 | 41 East Asian dossiers. Termini oriented by coordinate, end labels from geography (D-77). |
| M4 | by 2026-10-14 | 28 more: all 36 national expressway main lines, Taiwan freeways 1–6 and 10, nine provincial highways. |
| M5 | 2026-10-31 | Unit tests (`test/`, `node:test`) in `npm test`; GitHub Actions runs `npm test` on every push and fails on a stale diff; the i18n check finds built keys itself. |
| M6 | 2026-10-31 | `sheets.js` split into `numbering.js`, `dashboard.js`, `docs-view.js` over a shared `sheet-kit.js`; one `esc()`. |
| M7 | 2026-10-31 | P14 revised: Canadian official lengths shown however far from the drawn piece, with a note past 20% (D-87). Spanish interface, CAPUFE and P13 marked not planned. |
| M8 | 2026-10-31 | The 48 second-round dossiers' "reported, not checked" figures checked against primary sources (see below). |
| M9 | 2026-10-31 | 48 more dossiers: mainland 10, Taiwan 8, Mexico 10, Canada 10, United States 10, with elevation profiles. |
| M10 | 2026-10-31 | `AGENTS.md`; stale statements in the docs fixed; README source and gap tables cut to summaries that link here. |

## Planned work, P1 to P14

Each was a *pending* row in [ACCURACY.md §6](ACCURACY.md#6-known-gaps); a row leaves §6 when done.

| # | Work | Outcome |
| --- | --- | --- |
| P1 | Taiwan freeway official lengths | **done** 2026-10-19 (TW-6, D-78) |
| P2 | Taiwan freeway tolls and gantries | **done** 2026-10-19 (TW-7, TW-8, D-79) |
| P3 | Hong Kong tunnel tolls | **done** 2026-10-19 (HK-5, D-80) |
| P4 | Elevation profiles for North America's national tiers | **done** 2026-10-19 (D-81) |
| P5 | Mainland and Hong Kong land ports | **done** 2026-10-19 (CN-3, CN-4, D-82): 69 of 84 placed |
| P6 | Quebec bridges with year built | **done** 2026-10-19 (CA-18, D-83) |
| P7 | US bridges with year built | **done** 2026-10-19 (US-11, D-84) |
| P8 | More dossiers | **done** 2026-10-19 and 2026-10-31; more can follow [DOSSIER-BRIEF.md](DOSSIER-BRIEF.md), route by route |
| P9 | Mainland opening years into the buildout chart | **done** 2026-10-19 (D-85) |
| P10 | Mexican federal official lengths | **done** 2026-10-20 (MX-8, D-89): in the provenance section, never the headline |
| P11 | Alberta bridges | **skipped**: no licence stated, so not open under [§2](DATA-SOURCES.md#2-what-a-source-must-meet) |
| P12 | Taiwan provincial roughness | **done** 2026-10-19 (TW-9, D-86) |
| P13 | Alberta and Ontario pavement roughness | **not planned** 2026-10-31: two provinces of ten would read as a national figure |
| P14 | Canadian official lengths per route | **done** 2026-10-19, revised 2026-10-31 (CA-19 to CA-22, D-87): 1,368 highways, 167 of them with the past-20% note |

Nothing is pending now. New work starts as a *pending* row in ACCURACY §6 and a row here.

## Open minor points

- Hong Kong census road names are traditional (OSM's local names); the rest of the zh UI is
  simplified. Kept on purpose, like the sign labels (3號幹線).
- Dossier figures marked "reported, not checked". The 23 in the first-round dossiers were
  checked on 2026-10-19: 13 confirmed or corrected, nine kept the mark. The 35 in the second
  round were checked on 2026-10-31: 5 confirmed, 7 corrected (among them G320's Gao'an
  realignment, 1.25 billion yuan, not 1.771; MEX-80's coast road opened September 1964, not
  1960; AB-2's "$2 billion" is the whole CANAMEX corridor's), 23 kept the mark because no
  primary source could be read (1989 AASHTO route log, 1940s Ontario Hansard, Colorado's
  turnpike statements and several mainland section costs). The 48 dossiers of M9 have a few
  marked figures of their own, unchecked.
