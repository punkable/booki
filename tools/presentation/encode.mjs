import { writeCaptions } from './captions.mjs';
/* Assemble the six Remotion-rendered scenes without repainting static art. */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
export function encodeFilm(here, out, locale) {
  const inputs = Array.from({ length: 6 }, (_, scene) => ['-loop', '1', '-framerate', '30', '-t', '5', '-i', resolve(here, `public/scene-${scene}-${locale}.jpg`)]).flat();
  const prepared = Array.from({ length: 6 }, (_, scene) => `[${scene}:v]format=yuv420p,zoompan=z='max(1,1.012-0.012*on/149)':d=1:x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':s=1920x1080:fps=30,fade=t=in:st=0:d=0.22,fade=t=out:st=4.78:d=0.22,setpts=PTS-STARTPTS[v${scene}]`);
  prepared.push('[v0][v1][v2][v3][v4][v5]concat=n=6:v=1:a=0[film]');
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'warning', '-y', ...inputs, '-filter_complex_threads', '1', '-filter_complex', prepared.join(';'), '-map', '[film]', '-t', '30', '-r', '30', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p', '-threads', '2', '-movflags', '+faststart', resolve(out, `booki-070-preview-${locale}.mp4`)], { stdio: 'inherit' });
  writeCaptions(out, locale);
  console.log(`Encoded 30-second ${locale} film from the six Remotion scenes.`);
}
