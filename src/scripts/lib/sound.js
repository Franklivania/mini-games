// Tiny Web Audio sound kit — no assets, created lazily on first user gesture.

let ctx;
function audio() {
  ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone({ freq, type = "sine", start = 0, length = 0.2, gain = 0.1, slideTo }) {
  try {
    const a = audio();
    const t = a.currentTime + start;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + length);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + length + 0.02);
  } catch {
    /* audio unavailable */
  }
}

export const sound = {
  tick: () => tone({ freq: 1400 + Math.random() * 300, type: "square", length: 0.05, gain: 0.05 }),
  fanfare: () => [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, type: "triangle", start: i * 0.09, length: 0.35, gain: 0.12 })),
  ding: () => {
    tone({ freq: 988, type: "triangle", length: 0.5, gain: 0.14 });
    tone({ freq: 1319, type: "triangle", start: 0.08, length: 0.6, gain: 0.12 });
  },
  buzz: () => {
    tone({ freq: 140, type: "sawtooth", length: 0.55, gain: 0.12 });
    tone({ freq: 147, type: "square", length: 0.55, gain: 0.06 });
  },
  whoosh: () => tone({ freq: 300, type: "sine", length: 0.25, gain: 0.05, slideTo: 900 }),
};
