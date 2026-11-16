# WORLD AT WAR: FRONTLINES

Single-player, real-time operational/grand strategy in the browser. Real geography (Natural Earth + elevation),
automatic combat, supply and fuel, fog of war, historical + dynamic events, persistent saves (IndexedDB).

## Run locally
Requires Node 20+ (developed on Node 24).
```
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npx vitest run     # tests
npx tsc -p tsconfig.app.json --noEmit
```
Regenerate map data (needs network): `node scripts/data/fetch.mjs && node scripts/data/build.mjs`.

## Status
Phase 1 vertical slice: Fall of France (Standard + Short), playable as Germany, France or the UK.
Other campaigns are listed as locked/planned. See docs/DEVELOPMENT_ROADMAP.md and docs/KNOWN_ISSUES.md.

## Docs
TECHNICAL_ARCHITECTURE, CAMPAIGN_DATA_GUIDE, HISTORICAL_SOURCES, UI_AUDIO, TESTING_REPORT, KNOWN_ISSUES, CHANGELOG in `docs/`.
Map: OpenStreetMap raster tiles (ODbL) by default - replace the tile URL for production use; offline vector basemap available.
