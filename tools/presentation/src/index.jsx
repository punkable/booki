import React from 'react';
import { registerRoot, Composition, AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig, staticFile, delayRender, continueRender, Easing } from 'remotion';

/* Eight scenes, five seconds each. Every product image is a capture of the real
   built frontend with example data (see capture.mjs); only the backdrops,
   type and motion are drawn here. */
import { copy, SCENE, SCENES } from './copy.mjs';
const font = 'Inter, Arial, Helvetica, sans-serif';
const ink = '#1d1d1f'; const quiet = '#6e6e73';
const fontReady = delayRender('Load the presentation typeface');
const face = new FontFace('Inter', `url(${staticFile('Inter.ttf')})`, { weight: '100 900' });
face.load().then((loaded) => { document.fonts.add(loaded); continueRender(fontReady); }).catch((error) => { throw error; });

const ease = Easing.bezier(0.22, 1, 0.36, 1);
const lerp = (t, from, to, a, b) => interpolate(t, [from, to], [a, b], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
function useRise(t, delay = 0) { const { fps } = useVideoConfig(); return spring({ frame: t - delay, fps, config: { damping: 200, mass: 0.9 } }); }

function Title({ t, lines, color = ink, sub = quiet, align = 'left', size = 96, delay = 4, style }) {
  const a = useRise(t, delay); const b = useRise(t, delay + 8);
  return <div style={{ textAlign: align, ...style }}>
    <h1 style={{ margin: 0, fontSize: size, lineHeight: 1.04, letterSpacing: -size * 0.035, fontWeight: 650, color, opacity: a, transform: `translateY(${(1 - a) * 40}px)` }}>{lines[0]}</h1>
    {lines[1] && <p style={{ margin: '22px 0 0', fontSize: size * 0.33, lineHeight: 1.35, fontWeight: 450, color: sub, opacity: b, transform: `translateY(${(1 - b) * 30}px)` }}>{lines[1]}</p>}
  </div>;
}
function Note({ text, color = '#86868b' }) { return <span style={{ position: 'absolute', left: 96, bottom: 56, fontSize: 17, letterSpacing: 1.6, textTransform: 'uppercase', color }}>{text}</span>; }
function Window({ src, width, children, style }) {
  return <div style={{ position: 'absolute', width, borderRadius: 16, overflow: 'hidden', background: '#fff', boxShadow: '0 50px 100px #2a1d1033, 0 0 0 1px #00000014', ...style }}>
    <div style={{ height: 40, background: '#f3f1ee', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 30, padding: '0 22px', color: '#444', fontSize: 16 }}><span>—</span><span>☐</span><span>✕</span></div>
    <Img src={staticFile(src)} style={{ width: '100%', display: 'block' }} />{children}
  </div>;
}

function Intro({ t, c }) {
  const m = useRise(t, 2); const w = useRise(t, 16); const s = useRise(t, 30);
  return <AbsoluteFill style={{ background: '#fff', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
      <Img src={staticFile('mark.svg')} style={{ width: 200, opacity: m, transform: `scale(${0.6 + 0.4 * m}) rotate(${(1 - m) * -12}deg)` }} />
      <span style={{ fontSize: 190, fontWeight: 700, letterSpacing: -8, color: ink, opacity: w, transform: `translateX(${(1 - w) * -40}px)` }}>{c.intro[0]}</span>
    </div>
    <p style={{ position: 'absolute', top: 690, fontSize: 44, color: quiet, margin: 0, opacity: s, transform: `translateY(${(1 - s) * 24}px)` }}>{c.intro[1]}</p>
  </AbsoluteFill>;
}
function Desktop({ t, c, locale, theme = 'light' }) {
  const dock = useRise(t, 18); const zoom = lerp(t, 0, SCENE, 1.06, 1);
  const dark = theme === 'dark';
  return <AbsoluteFill style={{ overflow: 'hidden' }}>
    <Img src={staticFile(`wallpaper-${theme}.jpg`)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', transform: `scale(${zoom})` }} />
    <Title t={t} lines={dark ? c.dark : c.desktop} color={dark ? '#f5f5f7' : ink} sub={dark ? '#a1a1a6' : '#4a4a4f'} align="center" size={104} style={{ position: 'absolute', top: 210, width: '100%' }} />
    <Img src={staticFile(`dock-${theme}-${locale}.png`)} style={{ position: 'absolute', left: (1920 - 1700) / 2, width: 1700, top: 840 + (1 - dock) * 260, opacity: dock, filter: `drop-shadow(0 30px 40px ${dark ? '#00000080' : '#5a3d2030'})` }} />
    <Note text={c.note} color={dark ? '#8e8e93' : '#7a7068'} />
  </AbsoluteFill>;
}
function Widgets({ t, c, locale }) {
  // Glide along the bar from the apps to the widgets, then settle.
  const x = lerp(t, 10, 120, -40, -1690); const s = lerp(t, 0, 50, 1.6, 1.95);
  return <AbsoluteFill style={{ overflow: 'hidden' }}>
    <Img src={staticFile('wallpaper-light.jpg')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', filter: 'blur(6px)', transform: 'scale(1.1)' }} />
    <Title t={t} lines={c.widgets} size={92} style={{ position: 'absolute', left: 96, top: 140 }} />
    <div style={{ position: 'absolute', left: 300, top: 640, transformOrigin: '0 50%', transform: `translateX(${x}px) scale(${s})` }}>
      <Img src={staticFile(`dock-light-${locale}.png`)} style={{ width: 1700, filter: 'drop-shadow(0 18px 24px #5a3d2024)' }} />
    </div>
    <Note text={c.note} color="#7a7068" />
  </AbsoluteFill>;
}
function Focus({ t, c, locale }) {
  const panel = useRise(t, 14);
  return <AbsoluteFill style={{ background: '#fbfaf8' }}>
    <Title t={t} lines={c.focus} size={92} style={{ position: 'absolute', left: 96, top: 140, width: 900 }} />
    <Img src={staticFile(`tasks-${locale}.png`)} style={{ position: 'absolute', left: 1290, top: 150, width: 560, opacity: panel, transform: `translateY(${(1 - panel) * 60}px)`, filter: 'drop-shadow(0 40px 60px #5a3d2026)' }} />
    {['timer', 'tasks', 'calendar', 'weather'].map((type, i) => {
      const r = useRise(t, 30 + i * 7);
      return <Img key={type} src={staticFile(`widget-${type}-${locale}.png`)} style={{ position: 'absolute', left: 96 + i * 292, top: 520, width: 270, borderRadius: 18, opacity: r, transform: `translateY(${(1 - r) * 80}px)`, boxShadow: '0 24px 48px #302f3514' }} />;
    })}
    <Note text={c.note} />
  </AbsoluteFill>;
}
function Screen({ t, c, lines, src }) {
  const w = useRise(t, 12); const tilt = lerp(t, 12, 90, 14, 0);
  return <AbsoluteFill style={{ background: 'linear-gradient(#ffffff, #f5f1ec)', perspective: 2400 }}>
    <Title t={t} lines={lines} size={92} align="center" style={{ position: 'absolute', top: 90, width: '100%' }} />
    <Window src={src} width={1240} style={{ left: 340, top: 380 + (1 - w) * 200, opacity: w, transform: `rotateX(${tilt}deg)`, transformOrigin: '50% 0' }} />
    <Note text={c.note} />
  </AbsoluteFill>;
}
function Outro({ t, c }) {
  const a = useRise(t, 4); const b = useRise(t, 40); const d = useRise(t, 56);
  return <AbsoluteFill style={{ background: '#fff', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ opacity: a, transform: `translateY(${(1 - a) * 30}px)`, textAlign: 'center' }}>
      <h1 style={{ margin: 0, fontSize: 110, letterSpacing: -4, fontWeight: 650, color: ink }}>{c.outro[0]}</h1>
      <p style={{ margin: '24px 0 0', fontSize: 40, color: quiet }}>{c.outro[1]}</p>
    </div>
    <div style={{ position: 'absolute', top: 700, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28, opacity: b, transform: `scale(${0.94 + 0.06 * b})` }}>
      <Img src={staticFile('logo.svg')} style={{ width: 300 }} />
      <span style={{ fontSize: 24, color: '#87613b', padding: '12px 28px', borderRadius: 40, background: '#faf6ef', border: '1px solid #ecdfcf', opacity: d }}>{c.outro[2]}</span>
    </div>
  </AbsoluteFill>;
}
function Scene({ scene, t, locale }) {
  const c = copy[locale];
  switch (scene) {
    case 0: return <Intro t={t} c={c} />;
    case 1: return <Desktop t={t} c={c} locale={locale} />;
    case 2: return <Widgets t={t} c={c} locale={locale} />;
    case 3: return <Focus t={t} c={c} locale={locale} />;
    case 4: return <Screen t={t} c={c} lines={c.apps} src={`apps-${locale}.png`} />;
    case 5: return <Screen t={t} c={c} lines={c.home} src={`home-${locale}.png`} />;
    case 6: return <Desktop t={t} c={c} locale={locale} theme="dark" />;
    default: return <Outro t={t} c={c} />;
  }
}
export function Film({ locale = 'en' }) {
  const frame = useCurrentFrame();
  const scene = Math.min(SCENES - 1, Math.floor(frame / SCENE)); const t = frame % SCENE;
  const fade = scene === SCENES - 1 ? lerp(t, 0, 12, 0, 1) : interpolate(t, [0, 12, SCENE - 10, SCENE - 1], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ background: scene === 6 ? '#000' : '#fff', fontFamily: font }}><AbsoluteFill style={{ opacity: scene === 0 ? 1 : fade }}><Scene scene={scene} t={t} locale={locale} /></AbsoluteFill></AbsoluteFill>;
}
/* A still is a scene after its entrance has settled. */
export function Poster({ locale = 'en', scene = 1 }) {
  const t = scene === 2 ? SCENE - 1 : 110;
  return <AbsoluteFill style={{ fontFamily: font }}><Scene scene={scene} t={t} locale={locale} /></AbsoluteFill>;
}
function Root() { return <>
  <Composition id="BookiFilm" component={Film} durationInFrames={SCENE * SCENES} fps={30} width={1920} height={1080} defaultProps={{ locale: 'en' }} />
  <Composition id="BookiPoster" component={Poster} durationInFrames={1} fps={30} width={1920} height={1080} defaultProps={{ locale: 'en', scene: 1 }} />
</>; }
registerRoot(Root);
