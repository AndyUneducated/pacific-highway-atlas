# Working on Interstate Atlas

A static map site (vanilla ES modules, MapLibre vendored, no bundler, nothing from npm in the
browser) over data prebuilt offline by Node scripts. GitHub Pages serves the repository as it is.

## Where things are

| Path | What |
| --- | --- |
| `index.html`, `assets/` | the site; `schema.js` is shared with `tools/` |
| `tools/fetch-*.mjs` | the only scripts that touch the network; write `tools/src/` (gitignored, ~9 GB) and `content/reference/` |
| `tools/build-*.mjs` | offline, deterministic; write `data/` |
| `content/dossiers/` | hand-written route profiles, en + zh |
| `content/reference/` | sourced extracts and hand-kept records |
| `data/` | build output, committed; the only thing the site reads |
| `test/` | unit tests (`node:test`) |

## Commands

| Command | When |
| --- | --- |
| `npm test` | before every commit; unit tests, i18n parity, content and data checks, README figures. Idempotent: CI fails if it leaves a diff |
| `npm run serve`, then `PW_CHANNEL=chrome npm run verify` | before a commit that touches `assets/` or `data/`; ~7 min, must end with 0 failed steps and 0 console errors |
| `npm run build` | after any change to `tools/` or a source; tens of minutes, needs `tools/src/` on disk |
| `node tools/build-content.mjs --check` | validate dossiers; without `--check` it publishes them to `data/` |
| `npm run build:elevation` | after adding a dossier: every route with a dossier has a profile |

## Rules that hold everywhere

- Never edit `data/` by hand. Fix the build or the content, then rebuild.
- Every figure is one of three kinds — measured, reported, published ([ACCURACY.md §1](docs/ACCURACY.md#1-three-kinds-of-figure)) —
  and says which. A published figure carries its source or a `why`; `build-content` fails otherwise.
  A weak source is worded "reported at …; not checked against …", never silently trusted.
- No data means nothing is shown: no zero, no estimate, no default dressed as a measurement.
- A reported figure joins its route by designation, never by position (D-2). Where a source
  has only coordinates, the join still requires the route's own number nearby (D-65, D-74).
- English and Chinese stay in step: every i18n key in both (`check-i18n`), and `docs/zh/` mirrors
  `DATA-SOURCES.md` and `ACCURACY.md` row for row (`build-docs` compares the shapes).
- A rule about how a source is used is a decision: add a `D-n` row to
  [DATA-SOURCES.md §5](docs/DATA-SOURCES.md#5-decision-log) with why and where it is enforced.
  A gap is a row in [ACCURACY.md §6](docs/ACCURACY.md#6-known-gaps) (kind: source, pending or not planned).
- Comments state constraints the code cannot show; match the surrounding code's density.

## Which document to update

| Change | Update |
| --- | --- |
| new or re-fetched source | DATA-SOURCES §3 register, README source summary |
| new rule or exception | DATA-SOURCES §5, en + zh |
| new gap, or a gap closed | ACCURACY §6, en + zh, and the README's short list |
| pipeline or client structure | ARCHITECTURE |
| planned work, milestone done | ROADMAP |
| writing dossiers | read [DOSSIER-BRIEF.md](docs/DOSSIER-BRIEF.md) first |

Write docs as a register, not a narrative: one row per source, decision or gap, with the
figure and the reason. Do not restate in one document what another holds; link to it.
