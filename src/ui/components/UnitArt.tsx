import { useMemo, useState } from 'react';
import type { NationId, SideId, UnitEquipment, UnitType } from '../../core/types';
import { unitIllustrationSvg, unitPhotoInfo } from '../mapAdapter';
import { UnitIcon } from './kit';

const cache = new Map<string, string | null>();
function svgFor(type: string, nation: string): string | null {
  const k = `${type}|${nation}`;
  if (cache.has(k)) return cache.get(k)!;
  let out: string | null = null;
  try { const s = unitIllustrationSvg?.(type, nation); if (typeof s === 'string' && s.includes('<svg')) out = s; } catch { out = null; }
  cache.set(k, out);
  return out;
}

const HQ_SUBJECT = /headquarter|HQ|staff|command|conference|briefing|map table|radio truck|signals/i;
export const hasUnitArt = () => !!unitIllustrationSvg;

/**
 * Unit illustration. Uses the map module's vector art when available, otherwise falls back to the NATO frame icon
 * so layouts never break. `size` is the box height in px for variant "small"; "large" fills its container.
 */
export function UnitArt({ type, nation, side, variant = 'small', size = 28, equipment, seed }: { type: UnitType; nation: NationId; side: SideId; variant?: 'small' | 'large'; size?: number; equipment?: UnitEquipment; seed?: string }) {
  const svg = useMemo(() => svgFor(type, nation), [type, nation]);
  const info = useMemo(() => unitPhotoInfo(type, nation, equipment, seed), [type, nation, equipment, seed]);
  // HQ units never borrow a generic infantry/armour photo: they show the HQ illustration unless the photo is HQ-specific.
  // Photos are unreadable at row size (< 40 px): tiny rows keep the illustration.
  const usable = info && (variant === 'large' || size >= 40) && (type !== 'hq' || HQ_SUBJECT.test(info.subject ?? ''));
  const url = usable && info ? (variant === 'large' ? info.panel ?? info.thumb : info.thumb) : null;
  const [bad, setBad] = useState<string | null>(null);
  if (usable && info && url && bad !== url) {
    const credit = info.credit ? `Photo: ${info.credit}` : undefined;
    const footer = info.credit || info.subject;
    return (
      <span className={`unit-art ${variant} photo`} style={variant === 'small' ? { width: size * 1.5, height: size } : undefined} title={credit}>
        <img src={url} alt={info.subject ?? ''} loading="lazy" onError={() => setBad(url)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        {variant === 'large' && footer && <span className="photo-credit">{footer}</span>}
      </span>
    );
  }
  if (!svg) return variant === 'large'
    ? <div className="unit-art large fallback" aria-hidden><UnitIcon type={type} side={side} size={92} /></div>
    : <UnitIcon type={type} side={side} size={size * 0.8} />;
  return <span className={`unit-art ${variant}`} style={variant === 'small' ? { width: size * 1.5, height: size } : undefined} aria-hidden dangerouslySetInnerHTML={{ __html: svg }} />;
}
