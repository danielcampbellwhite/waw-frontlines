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
