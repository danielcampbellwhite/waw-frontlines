import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Modal } from '../components/kit';
import { useUiSettings } from '../settings';
import { TOUR_STEPS, placeCard, type Rect } from './steps';
import '../ui.css';

function useAnchorRect(selector: string | null): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);
  useLayoutEffect(() => {
    if (!selector) { setRect(null); return; }
    const measure = () => {
      const el = document.querySelector(selector) as HTMLElement | null;
      if (!el) { setRect(null); return; }
      const r = el.getBoundingClientRect();
      setRect(r.width < 4 || r.height < 4 ? null : { left: r.left, top: r.top, width: r.width, height: r.height });
    };
    measure();
    window.addEventListener('resize', measure);
    const t = setInterval(measure, 500); // panels can open/close under the tour
    return () => { window.removeEventListener('resize', measure); clearInterval(t); };
  }, [selector]);
  return rect;
}

function StepBody({ index }: { index: number }) {
  const k = useUiSettings().keybinds;
  const step = TOUR_STEPS[index];
  return <>{step.body(k).map((p, i) => <p key={i}>{p}</p>)}</>;
}

function Dots({ index, onGo }: { index: number; onGo: (i: number) => void }) {
  return (
    <div className="tour-dots" role="tablist" aria-label="Tour steps">
      {TOUR_STEPS.map((s, i) => <button key={s.id} type="button" role="tab" aria-selected={i === index} aria-label={`Step ${i + 1}: ${s.title}`} className={i === index ? 'on' : i < index ? 'done' : ''} onClick={() => onGo(i)} />)}
    </div>
  );
}

function useTourKeys(index: number, setIndex: (i: number) => void, onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (index >= TOUR_STEPS.length - 1) onClose(); else setIndex(index + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); setIndex(Math.max(0, index - 1)); }
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [index, setIndex, onClose]);
}

/** In-game spotlight tour. Pure UI: never touches the engine. Esc and Skip close it. */
export function Tour({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const step = TOUR_STEPS[index];
  const rect = useAnchorRect(step.anchor);
  const cardRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 340, h: 220 });
  useLayoutEffect(() => { const r = cardRef.current?.getBoundingClientRect(); if (r) setSize(s => (Math.abs(s.w - r.width) > 1 || Math.abs(s.h - r.height) > 1 ? { w: r.width, h: r.height } : s)); }, [index, rect]);
  useTourKeys(index, setIndex, onClose);
  const pos = placeCard(rect, step.side, size, { w: window.innerWidth, h: window.innerHeight });
  const last = index === TOUR_STEPS.length - 1;
  return (
    <div className="tour-layer" role="dialog" aria-modal aria-label="Guided tour">
      {rect ? <div className="tour-spot" style={{ left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8 }} /> : <div className="tour-dim" />}
      <div className="tour-card" ref={cardRef} style={{ left: pos.left, top: pos.top }}>
        <div className="kicker">Tour, step {index + 1} of {TOUR_STEPS.length}</div>
        <h3>{step.title}</h3>
        <div className="tour-text"><StepBody index={index} /></div>
        <Dots index={index} onGo={setIndex} />
        <div className="tour-actions">
          <button type="button" className="btn" onClick={onClose}>{last ? 'Close' : 'Skip tour'}</button>
          <span className="grow" />
          <button type="button" className="btn" disabled={index === 0} onClick={() => setIndex(index - 1)}>Back</button>
          <button type="button" className="btn primary" autoFocus onClick={() => (last ? onClose() : setIndex(index + 1))}>{last ? 'Start playing' : 'Next'}</button>
        </div>
      </div>
    </div>
  );
}

/** The same steps as a plain dialog, for the main menu where there is no game behind it. */
export function TutorialDialog({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const step = TOUR_STEPS[index];
  useTourKeys(index, setIndex, onClose);
  const last = index === TOUR_STEPS.length - 1;
  return (
    <Modal title={step.title} kicker={`Tutorial, step ${index + 1} of ${TOUR_STEPS.length}`} onClose={onClose}
      footer={<>
        <button type="button" className="btn" onClick={onClose}>Close</button>
        <button type="button" className="btn" disabled={index === 0} onClick={() => setIndex(index - 1)}>Back</button>
        <button type="button" className="btn primary" onClick={() => (last ? onClose() : setIndex(index + 1))}>{last ? 'Done' : 'Next'}</button>
      </>}>
      <div className="tour-text"><StepBody index={index} /></div>
      <Dots index={index} onGo={setIndex} />
      <p className="hint">Inside a game, open the ? button for Help and to replay this tour next to the real screen.</p>
    </Modal>
  );
}
