// Ink-outlined paper confetti on a full-screen canvas. Skipped for reduced-motion users.
import { PALETTE, INK } from "./palette.js";
import { randomInt } from "./random.js";

export function confetti(canvas, { count = 170, durationMs = 3200 } = {}) {
  if (!canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const c = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);

  const parts = Array.from({ length: count }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 200,
    y: innerHeight / 2,
    vx: (Math.random() - 0.5) * 18,
    vy: -Math.random() * 18 - 6,
    w: 8 + Math.random() * 8,
    h: 5 + Math.random() * 6,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.4,
    color: PALETTE[randomInt(PALETTE.length)],
  }));

  const t0 = performance.now();
  (function step(now) {
    c.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 0.5;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.r);
      c.fillStyle = p.color;
      c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      c.lineWidth = 1.5;
      c.strokeStyle = INK;
      c.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h);
      c.restore();
    }
    if (now - t0 < durationMs) requestAnimationFrame(step);
    else c.clearRect(0, 0, innerWidth, innerHeight);
  })(t0);
}
