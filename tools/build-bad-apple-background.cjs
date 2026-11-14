/* Precompute the video's background so file:// playback never needs canvas readback. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const fps = 10, width = 32, height = 24;
const source = path.join(root, 'docs/manual/assets/media/bad-apple.mp4');
const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', source,
  '-vf', `fps=${fps},scale=${width}:${height}:flags=area,format=gray`, '-an',
  '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1'], {maxBuffer: 8 * 1024 * 1024, windowsHide: true});
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(result.stderr.toString());
const frameSize = width * height;
const samples = Buffer.alloc(Math.floor(result.stdout.length / frameSize));
for (let frame = 0; frame < samples.length; frame++) {
  let total = 0, count = 0;
  // Most silhouettes occupy the center. The outer three-pixel band estimates
  // the background more reliably than averaging the entire frame.
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (x >= 3 && x < width - 3 && y >= 3 && y < height - 3) continue;
    total += result.stdout[frame * frameSize + y * width + x];
    count++;
  }
  samples[frame] = Math.round(total / count);
}
if (!samples.length) throw new Error('No video frames were decoded');
const file = path.join(root, 'docs/manual/bad-apple.js');
const script = fs.readFileSync(file, 'utf8');
const marker = /  \/\/ BEGIN GENERATED BACKGROUND TIMELINE[\s\S]*?  \/\/ END GENERATED BACKGROUND TIMELINE/;
if (!marker.test(script)) throw new Error('Missing timeline marker');
const generated = `  // BEGIN GENERATED BACKGROUND TIMELINE\n  const backgroundFPS = ${fps};\n  const backgroundTimeline = '${samples.toString('base64')}';\n  // END GENERATED BACKGROUND TIMELINE`;
fs.writeFileSync(file, script.replace(marker, generated));
let state = 'dark', switches = 0;
for (const sample of samples) {
  const next = sample >= 160 ? 'light' : sample <= 96 ? 'dark' : state;
  if (next !== state) switches++;
  state = next;
}
console.log(`Embedded ${samples.length} background samples at ${fps} fps; ${switches} palette changes across the video.`);
