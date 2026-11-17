import type { BattleReport } from '../../core/types';
import { equipmentDef } from '../../military/catalog';

/** Display name for an equipment id (catalog name, falling back to a prettified id). */
export function equipName(id: string): string {
  const d = equipmentDef(id);
  const n = d.name === id ? id.replace(/_/g, ' ') : d.name;
  return n.charAt(0).toUpperCase() + n.slice(1);
}

const unique = <T,>(xs: T[]) => Array.from(new Set(xs));

/**
 * Cleans the sim's consequence lines for display: de-duplicates unit lists ("Retreated: 51e DI, 51e DI"),
 * swaps raw equipment ids for catalog names, and always says who gained ground.
 */
export function tidyConsequences(r: BattleReport): string[] {
  const out: string[] = [];
  for (const line of r.consequences) {
    let m = /^(Retreated|Destroyed|Surrendered): (.*)\.$/.exec(line);
    if (m) { out.push(`${m[1]}: ${unique(m[2].split(', ')).join(', ')}.`); continue; }
    m = /^Equipment lost: (.*)\.$/.exec(line);
    if (m) {
      const parts = m[1].split(', ').map(p => { const q = /^(\d+) (.+)$/.exec(p); return q ? `${q[1]} ${equipName(q[2]).toLowerCase()}` : p; });
      out.push(`Equipment lost: ${parts.join(', ')}.`); continue;
    }
    out.push(line);
  }
  if (r.territoryChangeCells > 0) {
    const side = r.attackerSide === 'axis' ? 'Axis' : r.attackerSide === 'allies' ? 'Allied' : 'The attacker';
    out.push(r.outcome === 'attacker_victory'
      ? `${side} forces gained ground: about ${r.territoryChangeCells} map cells changed hands.`
      : `The front line shifted around the battle site (about ${r.territoryChangeCells} map cells changed control).`);
  }
  return out;
}

export const uniqueRetreats = (r: BattleReport) => unique(r.retreats);

const OUTCOME_TEXT: Record<BattleReport['outcome'], string> = {
  attacker_victory: 'the attack succeeded', defender_victory: 'the defence held', stalemate: 'no decision', attacker_withdrew: 'the attacker withdrew',
};

type UnitLite = { side: string; nation: string; shortName?: string; name: string };

const listNames = (xs: string[]) => (xs.length === 0 ? '' : xs.length === 1 ? xs[0] : xs.length === 2 ? `${xs[0]} and ${xs[1]}` : `${xs[0]}, ${xs[1]} and others`);

/**
 * One-line headline for a battle report: who attacked whom, where, the outcome and the losses on each side.
 * Built only from the report and the units that fought; nothing is invented.
 */
export function reportHeadline(r: BattleReport, units: Record<string, UnitLite | undefined>, nationName: (id: string) => string): string {
  const att: string[] = [], def: string[] = [];
  let la = 0, ld = 0;
  for (const c of r.casualties ?? []) {
    const u = units[c.unitId];
    const n = c.killed + c.wounded + c.captured;
    if (u && u.side === r.attackerSide) { la += n; att.push(nationName(u.nation)); }
    else { ld += n; def.push(u ? nationName(u.nation) : 'defenders'); }
  }
  const side = (s: string) => (s === 'axis' ? 'Axis' : s === 'allies' ? 'Allied' : 'The attacker');
  const a = listNames(unique(att)) || `${side(r.attackerSide)} forces`;
  const d = listNames(unique(def)) || 'the defenders';
  const place = r.placeName ?? 'an unnamed position';
  const fmt = (n: number) => n.toLocaleString('en-GB');
  return `${a} attacked ${d} at ${place}: ${OUTCOME_TEXT[r.outcome] ?? 'outcome unknown'}. Losses: ${fmt(la)} attackers, ${fmt(ld)} defenders.`;
}
