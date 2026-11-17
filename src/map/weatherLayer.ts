/** Canvas weather overlay (rain / snow / storm lightning / sand / fog veil). Rendering only: pointer-events none, no network, no sim access.
 *  Animates only while precipitation is active; static veils are drawn once. Uses Math.random (visual only). */
import type { WeatherKind } from '../core/types';
import { weatherLook } from './atmosphere';
import type { WeatherLook } from './atmosphere';

interface P { x: number; y: number; v: number; s: number; ph: number }

export class WeatherLayer {
  private cv = document.createElement('canvas');
  private ctx = this.cv.getContext('2d');
  private look: WeatherLook = weatherLook('clear', 0);
  private parts: P[] = [];
  private raf = 0; private last = 0; private flash = 0; private nextFlash = 0; private w = 1; private h = 1;
  private ro: ResizeObserver | null = null;
  private enabled = true;

  private host: HTMLElement;
  constructor(host: HTMLElement) {
    this.host = host;
    Object.assign(this.cv.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '4' });
    host.appendChild(this.cv);
    this.ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { this.resize(); this.draw(0); }) : null;
    this.ro?.observe(host);
    this.resize();
  }

  private resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, this.host.clientWidth); this.h = Math.max(1, this.host.clientHeight);
    this.cv.width = Math.round(this.w * dpr); this.cv.height = Math.round(this.h * dpr);
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  set(kind: WeatherKind, intensity: number, enabled: boolean) {
    this.enabled = enabled;
    this.look = enabled ? weatherLook(kind, intensity) : weatherLook('clear', 0);
    const n = this.look.precip === 'none' ? 0 : this.look.count;
    while (this.parts.length < n) this.parts.push({ x: Math.random() * this.w, y: Math.random() * this.h, v: 0.7 + Math.random() * 0.6, s: Math.random(), ph: Math.random() * 6.28 });
    this.parts.length = n;
    const animated = n > 0 || this.look.lightning;
    if (animated && !this.raf && !document.hidden) { this.last = performance.now(); this.raf = requestAnimationFrame(this.frame); }
    if (!animated) { cancelAnimationFrame(this.raf); this.raf = 0; this.draw(0); }
  }

  private frame = (now: number) => {
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    if (document.hidden) { this.raf = requestAnimationFrame(this.frame); return; }
    this.draw(dt, now);
    this.raf = this.look.precip !== 'none' || this.look.lightning ? requestAnimationFrame(this.frame) : 0;
  };

  private draw(dt: number, now = performance.now()) {
    const c = this.ctx; if (!c) return;
    const { w, h, look } = this;
    c.clearRect(0, 0, w, h);
    if (!this.enabled || look.veil.a <= 0) return;
    const v = look.veil;
    c.fillStyle = `rgba(${v.r | 0},${v.g | 0},${v.b | 0},${v.a})`;
    c.fillRect(0, 0, w, h);
    if (look.lightning) {
      if (now > this.nextFlash) { this.flash = 1; this.nextFlash = now + 5000 + Math.random() * 9000; }
      if (this.flash > 0.02) { c.fillStyle = `rgba(235,240,255,${0.22 * this.flash})`; c.fillRect(0, 0, w, h); this.flash *= Math.pow(0.0005, dt || 0.016); }
    }
    if (look.precip === 'none') return;
    if (look.precip === 'rain') {
      c.strokeStyle = 'rgba(190,205,225,0.38)'; c.lineWidth = 1; c.beginPath();
      const dx = -0.22 * look.speed, sp = 900 * look.speed;
      for (const p of this.parts) {
        p.y += sp * p.v * dt; p.x += dx * sp * p.v * dt * 0.4;
        if (p.y > h + 20) { p.y = -20; p.x = Math.random() * (w + 60); }
        if (p.x < -30) p.x = w + 20;
        const len = 9 + 9 * p.v * look.speed;
        c.moveTo(p.x, p.y); c.lineTo(p.x + dx * len * 0.6, p.y + len);
      }
      c.stroke();
    } else if (look.precip === 'snow') {
      c.fillStyle = 'rgba(255,255,255,0.7)';
      for (const p of this.parts) {
        p.y += 55 * p.v * dt; p.ph += dt * (0.8 + p.s); p.x += Math.sin(p.ph) * 18 * dt;
        if (p.y > h + 6) { p.y = -6; p.x = Math.random() * w; }
        c.beginPath(); c.arc(p.x, p.y, 1.1 + p.s * 1.4, 0, 6.283); c.fill();
      }
    } else { // sand: fast near-horizontal streaks
      c.strokeStyle = 'rgba(225,195,140,0.35)'; c.lineWidth = 1.2; c.beginPath();
      for (const p of this.parts) {
        p.x += 700 * look.speed * p.v * dt; p.y += Math.sin((p.ph += dt * 2)) * 14 * dt;
        if (p.x > w + 40) { p.x = -40; p.y = Math.random() * h; }
        c.moveTo(p.x, p.y); c.lineTo(p.x - 26 * p.v, p.y + 2);
      }
      c.stroke();
    }
  }

  destroy() { cancelAnimationFrame(this.raf); this.raf = 0; this.ro?.disconnect(); this.cv.remove(); }
}
