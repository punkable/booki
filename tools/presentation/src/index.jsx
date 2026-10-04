import React from 'react';
import { registerRoot, Composition, AbsoluteFill, Img, interpolate, useCurrentFrame, staticFile, delayRender, continueRender } from 'remotion';
const copy = {
  en: [
    ['Your Windows. Your workspace.', 'Booki · a smart dock for Windows'],
    ['Everything within reach.', 'Apps, folders and live widgets. One place to start.'],
    ['A little more focus.', 'Timers. Tasks. Calendar. Optional city weather.'],
    ['Less searching. More doing.', 'Find installed apps and suggestions from local usage.'],
    ['Make it yours.', 'Preview your dock. Choose how it behaves. Keep your setup.'],
    ['Meet the next Booki.', '0.70 preview · Windows 10 / 11 · punkable/booki'],
  ],
  es: [
    ['Tu Windows. Tu espacio.', 'Booki · un dock inteligente para Windows'],
    ['Todo al alcance.', 'Apps, carpetas y widgets. Un lugar para empezar.'],
    ['Un poco más de enfoque.', 'Temporizador. Tareas. Calendario. Clima opcional.'],
    ['Menos búsqueda. Más acción.', 'Apps instaladas y sugerencias según tu uso local.'],
    ['Hazlo tuyo.', 'Previsualiza tu dock. Elige cómo se comporta. Conserva tu configuración.'],
    ['Conoce el próximo Booki.', 'Vista previa 0.70 · Windows 10 / 11 · punkable/booki'],
  ],
};
const font = 'Inter, Arial, Helvetica, sans-serif';
const fontReady = delayRender('Load the presentation typeface');
const face = new FontFace('Inter', `url(${staticFile('Inter.ttf')})`, { weight: '100 900' });
face.load().then((loaded) => { document.fonts.add(loaded); continueRender(fontReady); }).catch((error) => { throw error; });
function Background() {
  return <AbsoluteFill style={{ background: '#ffffff', overflow: 'hidden' }}>
    <div style={{ position: 'absolute', left: 250, right: 250, top: 470, height: 420, background: 'radial-gradient(ellipse, #f7f5f1, #ffffff00 72%)' }} />
  </AbsoluteFill>;
}
function Label({ locale }) {
  return <div style={{ position: 'absolute', top: 68, right: 84, padding: '12px 22px', border: '1px solid #e8e8ed', borderRadius: 40, color: '#737378', fontSize: 17, letterSpacing: 1.4 }}>
    {locale === 'es' ? 'VISTA PREVIA · 0.70' : 'PREVIEW · 0.70'}
  </div>;
}
function Brand({ width = 220 }) { return <Img src={staticFile('logo.svg')} style={{ width }} />; }
function Content({ scene, locale, time = 60 }) {
  const words = copy[locale][scene];
  const reveal = interpolate(time, [0, 24], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const shift = (1 - reveal) * 32;
  if (scene === 0 || scene === 5) return <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 40, opacity: reveal, transform: `translateY(${shift}px)` }}>
    <Brand width={430} />
    <h1 style={{ fontSize: 78, letterSpacing: -3.4, fontWeight: 600, margin: '12px 0 0', textAlign: 'center' }}>{words[0]}</h1>
    <p style={{ fontSize: 30, color: '#6e6e73', margin: 0 }}>{words[1]}</p>
    {scene === 5 && <div style={{ padding: '15px 30px', border: '1px solid #e9ddcf', background: '#faf6ef', borderRadius: 50, color: '#87613b', fontSize: 24 }}>{locale === 'es' ? 'Código abierto. Sin cuentas. Tu configuración, local.' : 'Open source. No accounts. Your setup stays local.'}</div>}
  </AbsoluteFill>;
  const image = scene === 1 ? 'dock.png' : scene === 2 ? `widgets-${locale}.png` : scene === 3 ? `apps-${locale}.png` : `home-${locale}.png`;
  return <AbsoluteFill style={{ padding: '68px 84px', opacity: reveal, transform: `translateY(${shift}px)` }}>
    <Brand width={180} />
    <div style={{ marginTop: 66, maxWidth: 1700 }}>
      <h1 style={{ margin: 0, fontSize: 76, letterSpacing: -3.2, fontWeight: 600 }}>{words[0]}</h1>
      <p style={{ margin: '20px 0 0', fontSize: 28, color: '#6e6e73', lineHeight: 1.4 }}>{words[1]}</p>
    </div>
    {scene === 1 ? <>
      <div style={{ position: 'absolute', left: 150, right: 150, top: 555, height: 270, borderRadius: 140, background: 'radial-gradient(ellipse, #dfaa7518, transparent 70%)' }} />
      <Img src={staticFile(image)} style={{ position: 'absolute', width: 1610, left: 155, top: 585, filter: 'drop-shadow(0 28px 28px #302f351c)' }} />
      <p style={{ position: 'absolute', bottom: 112, width: 1752, textAlign: 'center', color: '#6e6e73', fontSize: 21 }}>{locale === 'es' ? 'Ancla tus accesos. Mantén los archivos originales.' : 'Pin your shortcuts. Keep your original files.'}</p>
    </> : scene === 2 ? <div style={{ position: 'absolute', left: 260, right: 260, top: 460, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24 }}>
      {['timer', 'tasks', 'calendar', 'weather'].map((type) => <Img key={type} src={staticFile(`widget-${type}-${locale}.png`)} style={{ width: '100%', borderRadius: 18, boxShadow: '0 24px 48px #302f3514' }} />)}
    </div> : <div style={{ position: 'absolute', left: 370, top: 400, width: 1180, height: 620, border: '1px solid #e8e8ed', borderRadius: 20, overflow: 'hidden', boxShadow: '0 28px 70px #302f351c', transform: `perspective(2000px) rotateX(${interpolate(time, [0, 100], [3, 0], { extrapolateRight: 'clamp' })}deg)` }}>
      <Img src={staticFile(image)} style={{ width: '100%' }} />
    </div>}
    <span style={{ position: 'absolute', left: 84, bottom: 58, fontSize: 16, letterSpacing: 1.5, color: '#86868b' }}>{locale === 'es' ? 'INTERFAZ REAL · DATOS DE EJEMPLO' : 'ACTUAL INTERFACE · EXAMPLE DATA'}</span>
  </AbsoluteFill>;
}
export function Film({ locale = 'en', baked = false }) {
  const frame = useCurrentFrame();
  const scene = Math.min(5, Math.floor(frame / 150)); const time = frame % 150;
  const fade = interpolate(time, [0, 12, 135, 149], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  if (baked) return <AbsoluteFill style={{ background: '#ffffff' }}><Img src={staticFile(`scene-${scene}-${locale}.jpg`)} style={{ width: '100%', height: '100%', opacity: fade, transform: `scale(${interpolate(time, [0, 149], [1.01, 1])})` }} /></AbsoluteFill>;
  return <AbsoluteFill style={{ color: '#1d1d1f', fontFamily: font }}><Background /><div style={{ position: 'absolute', inset: 0, opacity: fade }}><Content scene={scene} locale={locale} time={time} /></div><Label locale={locale} /></AbsoluteFill>;
}
export function Poster({ locale = 'en', scene = 1 }) {
  return <AbsoluteFill style={{ color: '#1d1d1f', fontFamily: font }}><Background /><Content scene={scene} locale={locale} /><Label locale={locale} /></AbsoluteFill>;
}
function Root() { return <>
  <Composition id="BookiFilm" component={Film} durationInFrames={900} fps={30} width={1920} height={1080} defaultProps={{ locale: 'en' }} />
  <Composition id="BookiPoster" component={Poster} durationInFrames={1} fps={30} width={1920} height={1080} defaultProps={{ locale: 'en', scene: 1 }} />
</>; }
registerRoot(Root);
