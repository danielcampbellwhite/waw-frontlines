// Dev-only harness: stub Engine with 600 synthetic units to eyeball/stress <TacticalMap>. Not shipped by the app.
import { createRoot } from 'react-dom/client';
import { useEffect, useMemo, useState } from 'react';
import type { ControlGrid, Engine, GameState, TerrainGrid, Unit, UnitType } from '../../core/types';
import { TacticalMap } from '../TacticalMap';
import type { MapOverlays } from '../TacticalMap';
import { loadInfra, loadTerrainGrid } from '../terrain';
import { setPhotoProvider } from '../photos';

// Layout preview only: synthetic placeholder 'photos' (NOT real art) when ?photos=1
if (new URLSearchParams(location.search).get('photos')) {
  const cache = new Map<string, string>();
  setPhotoProvider((type, nation) => {
    const k = `${type}${nation}`;
    if (!cache.has(k)) {
      const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d')!;
      const g = x.createLinearGradient(0, 0, 256, 256); g.addColorStop(0, '#8b9aa8'); g.addColorStop(1, '#3d4a3a'); x.fillStyle = g; x.fillRect(0, 0, 256, 256);
      x.fillStyle = 'rgba(255,255,255,0.85)'; x.font = 'bold 34px sans-serif'; x.textAlign = 'center'; x.fillText('PHOTO', 128, 120); x.font = '26px sans-serif'; x.fillText(`${type}`, 128, 160);
      cache.set(k, c.toDataURL());
    }
    return { thumb: cache.get(k)!, credit: 'test', subject: 'test' };
  });
}

const types: UnitType[] = ['infantry', 'armoured', 'mechanised', 'motorised', 'paratroop', 'artillery', 'antitank', 'recon', 'engineer', 'logistics', 'hq', 'air_fighter', 'air_bomber', 'naval', 'carrier'];
const QS = new URLSearchParams(location.search);
const SCENARIO = QS.get('scenario'); // e.g. stalingrad.short: real scenario units/locations instead of the synthetic demo
const scenarios = import.meta.glob('../../data/campaigns/*.short.json', { eager: true, import: 'default' }) as Record<string, { id: string; terrainFile: string; units: Unit[]; locations: Record<string, unknown>[] }>;
const SC = SCENARIO ? Object.values(scenarios).find((x) => x.id === SCENARIO) : undefined;
const REGION = SC ? SC.terrainFile.replace(/^terrain_|.json$/g, '') : (QS.get('region') ?? 'westeurope');
function makeState(terrain: TerrainGrid): GameState {
  const cols = terrain.cols, rows = terrain.rows, owner: number[] = [], contested: number[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const lon = terrain.bbox.west + c * terrain.cellDeg, lat = terrain.bbox.north - r * terrain.cellDeg;
    const land = terrain.cells[r * cols + c] !== 0;
    owner.push(!land ? 0 : lon > 5 + Math.sin(lat * 1.3) * 1.2 ? 2 : lat > 50.6 && lon > 3 ? 3 : 1);
    contested.push(Math.abs(lon - 5 - Math.sin(lat * 1.3) * 1.2) < 0.15 ? 60 : 0);
  }
  const control: ControlGrid = { bbox: terrain.bbox, cellDeg: terrain.cellDeg, cols, rows, nations: ['NEUTRAL', 'FRA', 'GER', 'BEL'], owner, contested };
  const units: Record<string, Unit> = {};
  for (let i = 0; i < 600; i++) {
    const ax = i % 2 === 0, lon = ax ? 5.3 + ((i * 37) % 40) / 10 : 0 + ((i * 53) % 50) / 10, lat = 46 + ((i * 29) % 80) / 10;
    units[`u${i}`] = { id: `u${i}`, name: `Unit ${i}`, shortName: `${i + 1}.${ax ? 'PzD' : 'DI'}`, nation: ax ? 'GER' : (['FRA', 'GBR', 'BEL'] as const)[i % 3], side: ax ? 'axis' : 'allies', type: types[i % types.length], domain: 'land', pos: [lon, lat], manpower: 500 + (i % 5) * 2000, manpowerMax: 10000, equipment: { held: {}, authorised: {} }, organisation: 80, morale: 70, experience: 50, fuel: 80, ammo: 80, supply: (i * 7) % 100, fatigue: 0, readiness: 80, entrenchment: 0, moveStatus: 'stationary', combatStatus: i % 41 === 0 ? 'encircled' : 'idle', posture: 'hold', orders: [], kills: 0 } as Unit;
  }
  // piles: dozens of units on the same spot (declutter test)
  for (let i = 0; i < 90; i++) {
    const ax = i % 3 === 0, c = i < 50 ? [4.94, 49.7] : [2.35, 48.85];
    units[`p${i}`] = { ...units.u2, id: `p${i}`, name: `Pile ${i}`, shortName: `${100 + i}.${ax ? 'ID' : 'DI'}`, nation: ax ? 'GER' : 'FRA', side: ax ? 'axis' : 'allies', type: types[(i * 7) % types.length], pos: [c[0] + ((i * 13) % 7) * 0.004, c[1] + ((i * 17) % 5) * 0.004], manpower: 1000 + (i % 5) * 1800, equipment: { held: { rifle: 900, ...(i % 4 === 0 ? { tank_medium: 60 } : {}) }, authorised: {} }, encircled: false } as Unit;
  }
  units.u0.route = [[5.5, 48], [6.5, 49], [7.5, 49.5]]; units.u0.routeEtaMinutes = 1500;
  return { schema: 1, scenarioId: SC?.id ?? 'x', playerNation: 'FRA', playerSide: 'allies', settings: {} as never, clock: { minutes: Number(QS.get('min') ?? 0), speed: 1, startMinutes: 0, accumulatorMs: 0 }, rng: { s: 1 }, seed: 1, idCounter: 0, units, nations: { FRA: { side: 'allies' }, GER: { side: 'axis' } } as never, locations: { paris: { id: 'paris', name: 'Paris', kind: 'city', pos: [2.35, 48.85], owner: 'FRA', originalOwner: 'FRA', value: 10 }, sedan: { id: 'sedan', name: 'Sedan', kind: 'town', pos: [4.94, 49.7], owner: 'FRA', originalOwner: 'FRA', value: 6 } } as never, control, weather: { kind: QS.get('weather') ?? 'clear', intensity: Number(QS.get('int') ?? 0.7), temperatureC: 5, nextChangeMinutes: 99999 } as never, supply: { nodes: [{ locationId: 'paris', stock: 900, throughput: 5 }], unitSupplyDistKm: {}, cutOffUnits: ['u1', 'u3'] }, battles: { b1: { id: 'b1', pos: [5.1, 49.5], attackers: ['u0'], defenders: ['u1'], startedAt: 0, rounds: 1, terrain: 1, weather: 'clear', log: [] } }, reports: [], operations: {}, events: [], eventState: {}, log: [], objectives: [], aiState: {}, special: {}, history: [] };
}

function App() {
  const [engine, setEngine] = useState<Engine | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [ov, setOv] = useState<MapOverlays>({ supply: true, control: true, fog: false, terrain: false });
  const [basemap, setBasemap] = useState<'offline'>('offline');
  const [log, setLog] = useState('');
  useEffect(() => {
    void (async () => {
      const [terrain, infra] = await Promise.all([loadTerrainGrid(`/data/terrain_${REGION}.json`), loadInfra(`/data/infra_${REGION}.json`)]);
      const state = makeState(terrain);
      if (SC) {
        state.units = Object.fromEntries(SC.units.map((u) => [u.id, u]));
        state.locations = Object.fromEntries(SC.locations.map((l) => [String(l.id), l])) as never;
        state.battles = {};
        (state as unknown as { special: unknown }).special = { sim: { ice: Number(QS.get('ice') ?? 0) } };
        state.supply = { nodes: [], unitSupplyDistKm: {}, cutOffUnits: [] };
      } else if (REGION !== 'westeurope') { // spread the westeurope-shaped demo data over this region's bbox
        const b = terrain.bbox, mx = (p: [number, number]): [number, number] => [b.west + ((p[0] + 6) / 16) * (b.east - b.west), b.south + ((p[1] - 44) / 11) * (b.north - b.south)];
        for (const u of Object.values(state.units)) { u.pos = mx(u.pos as [number, number]); if (u.route) u.route = u.route.map((q) => mx(q as [number, number])); }
        for (const l of Object.values(state.locations)) l.pos = mx(l.pos as [number, number]);
        for (const bt of Object.values(state.battles)) bt.pos = mx(bt.pos as [number, number]);
      }
      const e: Engine = { terrain, infra, getState: () => state, dispatch: () => ({ ok: true }), step: () => { state.clock.minutes += 60; }, advance: () => 0, setSpeed: () => {}, subscribe: () => () => {}, serialize: () => state, visibleUnits: () => Object.values(state.units).filter((u) => SC || u.side === 'allies') };
      setEngine(e);
      (window as unknown as { eng: Engine }).eng = e;
    })();
  }, []);
  const props = useMemo(() => ({ overlays: ov }), [ov]);
  if (!engine) return <p>loading…</p>;
  return (
    <div style={{ height: '100%', position: 'relative' }}>
      <TacticalMap handleRef={(h) => { (window as unknown as { hm: unknown }).hm = h; }} engine={engine} selection={sel} overlays={props.overlays} basemap={basemap}
        onSelect={(ids, add) => { setSel((s) => (add ? [...new Set([...s, ...ids])] : ids)); setLog(`select ${ids.length} add=${add}`); }}
        onMapClick={(p, b) => setLog(`click ${p.map((x) => x.toFixed(3))} b${b}`)} onContextOrder={(p) => setLog(`order ${p.map((x) => x.toFixed(3))}`)} />
      <div style={{ position: 'absolute', top: 8, left: 8, background: '#fff', padding: 6, font: '12px sans-serif', zIndex: 9 }}>
        {(['supply', 'control', 'fog', 'terrain'] as const).map((k) => <label key={k} style={{ marginRight: 8 }}><input type="checkbox" checked={ov[k]} onChange={() => setOv({ ...ov, [k]: !ov[k] })} />{k}</label>)}
        <button onClick={() => setBasemap('offline')}>{basemap}</button> <button onClick={() => engine.step()}>tick</button> <span id="log">{log} sel={sel.length}</span>
      </div>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
