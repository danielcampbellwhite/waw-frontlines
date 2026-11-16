import { Modal } from '../components/kit';
import { SOUND_CREDITS } from '../../audio';
import photoCredits from '../../art/credits.json';
import '../ui.css';

interface PhotoCredit { id: string; subject: string; author: string; license: string; sourceUrl: string }
const PHOTO_CREDITS = photoCredits as PhotoCredit[];
/** Tidy scraped author strings: collapse doubled text ("Unknown authorUnknown author") and stray trailing dots. */
function tidyAuthor(a: string): string {
  const t = a.trim(); const h = t.length / 2;
  const s = Number.isInteger(h) && t.slice(0, h) === t.slice(h) ? t.slice(0, h) : t;
  return s.replace(/\.+\s*$/, '').trim() || 'Unknown author';
}

export function Credits({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Credits" onClose={onClose}>
      <div className="credits">
        <h4>Design and engineering</h4><p>World at War: Frontlines was built by a team of specialised agents: simulation, military systems, AI and events, campaign data, map, interface and audio, and quality assurance.</p>
        <h4>Data and sources</h4><p>Terrain from Natural Earth and public elevation data. Every unit, place and date in a campaign traces to the source register in the project documentation; where history is uncertain it is marked as such.</p>
        <h4>Sound</h4>
        <p>Sound effects are CC0 / public-domain recordings, trimmed and converted for the game. Music and any effect that has not loaded are generated live with Web Audio.</p>
        <ul className="sound-credits">
          {SOUND_CREDITS.map(c => (
            <li key={c.pack}>
              <a href={c.url} target="_blank" rel="noreferrer noopener">{c.pack}</a> by {c.author}. {c.licence}, retrieved {c.retrieved}.{c.note ? ` ${c.note}` : ''}
            </li>
          ))}
        </ul>
        <h4>Photographs</h4>
        <p>Unit photographs come from Wikimedia Commons and other open archives. Each remains under its own licence, listed here with its source.</p>
        <ul className="sound-credits">
          {PHOTO_CREDITS.map(c => (
            <li key={c.id}>
              <a href={c.sourceUrl} target="_blank" rel="noreferrer noopener">{c.subject}</a> by {tidyAuthor(c.author)}. {c.license}.
            </li>
          ))}
        </ul>
        <h4>Type and software</h4><p>Big Shoulders Display and Barlow Semi Condensed (SIL Open Font Licence), MapLibre GL JS, React, Vite.</p>
      </div>
    </Modal>
  );
}
