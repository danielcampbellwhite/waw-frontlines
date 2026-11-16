import { UNIT_TYPES, unitIllustrationSvg } from '../illustrations';
const r = document.getElementById('r')!;
for (const t of UNIT_TYPES) {
  r.insertAdjacentHTML('beforeend', `<b>${t}</b>` + (['GER', 'FRA', 'GBR', 'USA'] as const).map((n) => unitIllustrationSvg(t, n)).join(''));
}
