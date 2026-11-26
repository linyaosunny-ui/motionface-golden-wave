import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {useMemo} from 'react';

/**
 * Golden particle wave — a Remotion recreation of a motion study.
 *
 * Deterministic: every visual value is a pure function of (frame, seed).
 * No Math.random at render time, so repeated renders are identical.
 */

const SEED = 20261030;

// Deterministic PRNG (mulberry32)
const prng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// Value noise (deterministic, smooth)
const makeNoise = (seed: number) => {
  const rand = prng(seed);
  const grad = Array.from({length: 512}, () => rand());
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x: number) => {
    const xi = Math.floor(x);
    const xf = x - xi;
    const a = grad[((xi % 512) + 512) % 512];
    const b = grad[(((xi + 1) % 512) + 512) % 512];
    return a + (b - a) * smooth(xf);
  };
};

type Particle = {
  u: number; // position along the ridge [0,1]
  v: number; // vertical offset from the ridge line, in ridge-heights
  size: number;
  twinkle: number; // phase for brightness shimmer
  alpha: number;
};

// Ridge height profile: a peak left-of-center with a slope down to the right,
// matching the reference silhouette.
const ridgeHeight = (u: number) => {
  const peak = 0.34;
  const w = 0.16;
  const gPeak = Math.exp(-((u - peak) ** 2) / (2 * w * w)) * 0.62;
  const slope = 0.55 - 0.34 * Math.tanh((u - 0.5) * 2.4);
  const shoulder = Math.exp(-((u - 0.72) ** 2) / (2 * 0.12 * 0.12)) * 0.1;
  return Math.min(1, 0.18 + gPeak + slope * 0.62 + shoulder);
};

export const GoldenWave: React.FC = () => {
  const frame = useCurrentFrame();
  const {width, height, durationInFrames} = useVideoConfig();
  const t = frame / durationInFrames; // 0..1 progress

  const W = 1920;
  const H = 1080;

  // Camera: slow push-in, slight drift, subtle vertical bob.
  const zoom = 1.06 + 0.085 * t;
  const panX = -10 * t + 4 * Math.sin(t * Math.PI * 0.9);
  const panY = 6 * t + 3 * Math.sin(t * Math.PI * 1.3);

  const noiseA = useMemo(() => makeNoise(SEED), []);
  const noiseB = useMemo(() => makeNoise(SEED + 77), []);

  // Particle field generated once; animation comes from per-frame sampling.
  const particles = useMemo<Particle[]>(() => {
    const rand = prng(SEED + 13);
    const out: Particle[] = [];
    const COUNT = 26000;
    for (let i = 0; i < COUNT; i++) {
      // Bias u toward the left/peak region for density, but cover full width.
      const u = rand();
      // Vertical spread: tighter near the top edge of the band, looser below.
      const spread = 0.055 + 0.09 * Math.pow(rand(), 1.6);
      const v = (rand() * 2 - 1) * spread;
      out.push({
        u,
        v,
        size: 0.6 + rand() * 1.7,
        twinkle: rand() * Math.PI * 2,
        alpha: 0.35 + rand() * 0.65,
      });
    }
    return out;
  }, []);

  // Render particles to a <canvas>-like buffer via <circle> is too heavy;
  // use a single canvas painted per frame in a React effect-free way:
  // build an offscreen canvas once and paint per frame with requestAnimationFrame
  // is not available in render; instead paint synchronously with useMemo on frame.

  const canvasRef = useMemo(() => ({current: null as HTMLCanvasElement | null}), []);

  return (
    <AbsoluteFill style={{backgroundColor: '#000000'}}>
      <ParticleCanvas
        width={W}
        height={H}
        frame={frame}
        t={t}
        zoom={zoom}
        panX={panX}
        panY={panY}
        particles={particles}
        noiseA={noiseA}
        noiseB={noiseB}
        canvasRef={canvasRef}
      />
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse 70% 55% at 47% 44%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.55) 100%)',
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
};

const ParticleCanvas: React.FC<{
  width: number;
  height: number;
  frame: number;
  t: number;
  zoom: number;
  panX: number;
  panY: number;
  particles: Particle[];
  noiseA: (x: number) => number;
  noiseB: (x: number) => number;
  canvasRef: {current: HTMLCanvasElement | null};
}> = ({width, height, t, zoom, panX, panY, particles, noiseA, noiseB, canvasRef}) => {
  // Paint synchronously during render into a data-less canvas via ref callback.
  const paint = (canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    canvasRef.current = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    // Ridge vertical placement in screen space.
    const baseY = height * 0.62;
    const ampY = height * 0.30;

    // Camera transform.
    ctx.save();
    ctx.translate(width / 2 + panX, height / 2 + panY);
    ctx.scale(zoom, zoom);
    ctx.translate(-width / 2, -height / 2);

    ctx.globalCompositeOperation = 'lighter';

    // Precompute ridge x positions with a slight left-skew (matching the wave).
    const skew = (u: number) => {
      const s = u + 0.03 * Math.sin(u * Math.PI * 1.7);
      return s;
    };

    // Twinkle phase advances with time; use t (0..1) mapped to seconds-ish.
    const time = t * 4.0;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const u = skew(p.u);

      // Wave shimmer: vertical undulation along the ridge that slowly travels.
      const travel = noiseA(u * 6.5 + time * 0.35) - 0.5;
      const shimmer = (noiseB(u * 14.0 - time * 0.6) - 0.5) * 0.6 + travel * 0.9;

      const ry = baseY - ampY * ridgeHeight(u);
      let x = u * width;
      let y = ry + p.v * ampY * 1.35 + shimmer * ampY * 0.07;

      // Edge fade: fade particles beyond the frame edges.
      const edge = Math.min(
        1,
        Math.max(0, Math.min(x / (width * 0.06), (width - x) / (width * 0.06))),
      );

      // Density fade at the top of the band (sparser crest highlight).
      const crestFade =
        p.v < -0.02 ? Math.max(0, 1 - (Math.abs(p.v) - 0.02) / 0.06) : 1;

      const twinkle =
        0.72 + 0.28 * Math.sin(p.twinkle + time * 2.2 + p.u * 40);
      let a = p.alpha * twinkle * edge * crestFade;
      if (a <= 0.02) continue;
      a = Math.min(1, a);

      // Gold palette: bright crest ~ (255, 232, 160), deeper body ~ (160, 120, 40).
      const depth = 0.55 + 0.45 * Math.min(1, Math.abs(p.v) / 0.12);
      const r = Math.round(255 - 70 * depth);
      const g = Math.round(228 - 96 * depth);
      const b = Math.round(150 - 105 * depth);

      ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
      ctx.beginPath();
      ctx.arc(x, y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // A faint glow pass along the crest: draw a few thousand soft dots slightly
    // brighter and larger, to mimic the bloom in the reference.
    for (let i = 0; i < particles.length; i += 37) {
      const p = particles[i];
      const u = skew(p.u);
      const travel = noiseA(u * 6.5 + time * 0.35) - 0.5;
      const ry = baseY - ampY * ridgeHeight(u);
      const x = u * width;
      const y = ry + p.v * ampY * 1.35 + travel * ampY * 0.06;
      if (Math.abs(p.v) > 0.045) continue;
      const edge = Math.min(1, Math.max(0, Math.min(x / (width * 0.05), (width - x) / (width * 0.05))));
      const a = 0.05 * edge;
      ctx.fillStyle = `rgba(255,240,190,${a})`;
      ctx.beginPath();
      ctx.arc(x, y, p.size * 4.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  };

  return (
    <canvas
      ref={paint}
      width={width}
      height={height}
      style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}}
    />
  );
};
