// Usage:
//   node tools/render.mjs                 -> render the full video (out/video_01.mp4)
//   node tools/render.mjs --stills 1,8.5  -> PNG snapshots at those times (out/still_*.png)
//   node tools/render.mjs --serve         -> just serve the preview at http://localhost:8080
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const spec = JSON.parse(fs.readFileSync(path.join(root, 'spec.json'), 'utf8'));
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i < 0 ? null : args[i + 1] ?? true; };

const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.ttf': 'font/ttf' };
const server = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(opt('--serve') ? 8080 : 0, r));
const port = server.address().port;
if (opt('--serve')) { console.log(`preview: http://localhost:${port}`); await new Promise(() => {}); }

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const browser = await chromium.launch();
const { width, height } = spec.meta.canvas;
const page = await browser.newPage({ viewport: { width, height } });
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction('window.__ready === true');
const grab = async (t) => {
  const b64 = await page.evaluate((t) => { window.__r.draw(t); return document.getElementById('c').toDataURL('image/png').split(',')[1]; }, t);
  return Buffer.from(b64, 'base64');
};
fs.mkdirSync(path.join(root, 'out'), { recursive: true });

if (opt('--stills')) {
  for (const t of String(opt('--stills')).split(',').map(Number)) {
    const f = path.join(root, 'out', `still_${t.toFixed(1)}.png`);
    fs.writeFileSync(f, await grab(t)); console.log(f);
  }
} else {
  const fps = spec.meta.fps, total = Math.round(spec.meta.total_duration_sec * fps);
  const outFile = path.join(root, 'out', spec.output.filename);
  // audio: per-scene narration (placed at scene.start) + optional BGM; skipped if files are absent
  const inputs = [], filters = [], mix = [];
  const addAudio = (file, delaySec, vol) => {
    const n = inputs.length + 1; // input 0 is the video pipe
    inputs.push('-i', file);
    filters.push(`[${n}:a]adelay=${Math.round(delaySec * 1000)}|${Math.round(delaySec * 1000)},volume=${vol}[a${n}]`);
    mix.push(`[a${n}]`);
  };
  for (const s of spec.scenes) {
    const f = path.join(root, spec.audio.narration_file_pattern.replace('{id}', s.id));
    if (fs.existsSync(f)) addAudio(f, s.start, 1);
  }
  const bgm = path.join(root, spec.audio.bgm.file);
  if (fs.existsSync(bgm)) addAudio(bgm, 0, spec.audio.bgm.volume);
  const ff = ['-y', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-', ...inputs];
  if (mix.length) ff.push('-filter_complex', `${filters.join(';')};${mix.join('')}amix=inputs=${mix.length}:normalize=0[aout]`, '-map', '0:v', '-map', '[aout]', '-c:a', 'aac', '-b:a', '192k');
  ff.push('-c:v', 'libx264', '-b:v', spec.output.bitrate, '-pix_fmt', 'yuv420p', '-r', String(fps), '-t', String(spec.meta.total_duration_sec), outFile);
  const p = spawn('ffmpeg', ff, { stdio: ['pipe', 'ignore', 'inherit'] });
  const done = new Promise((r) => p.on('close', r));
  console.log(`audio tracks: ${mix.length}${mix.length ? '' : ' (silent video: put narration in audio/scene_{id}.mp3)'}`);
  for (let i = 0; i < total; i++) {
    if (!p.stdin.write(await grab(i / fps))) await new Promise((r) => p.stdin.once('drain', r));
    if (i % 150 === 0) console.log(`frame ${i}/${total}`);
  }
  p.stdin.end();
  console.log('ffmpeg exit', await done, '->', outFile);
}
await browser.close(); server.close();
