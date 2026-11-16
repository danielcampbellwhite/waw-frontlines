# WORLD AT WAR: FRONTLINES (WorldAtWarFrontlines)
Browser WW2 real-time strategy game. Read `docs/TECHNICAL_ARCHITECTURE.md` first; contracts in `src/core/types.ts`.
- `npm run dev` / `npm run build` / `npx vitest run` / `npx tsc -p tsconfig.app.json --noEmit`
- TS is strict with `erasableSyntaxOnly`: no enums, no namespaces. Use const objects + union types.
- Sim code (`src/sim|military|ai|events`) is headless & deterministic: no DOM, no Math.random, no Date.now.
- UI mutates state only via `engine.dispatch(Command)`.
- Never invent historical data; cite in `docs/HISTORICAL_SOURCES.md`.
- Edit only the directories your role owns (see architecture doc).
