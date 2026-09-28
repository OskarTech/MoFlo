/**
 * Monta las vistas previas de la App Store (App Previews) a partir de las
 * grabaciones de pantalla del iPhone que hay en raw/. Los tramos y los textos
 * de cada vídeo están en previews.config.js.
 *
 *   node scripts/previews/build.js          → monta los vídeos en out/
 *   node scripts/previews/build.js 2        → monta solo el segundo
 *   node scripts/previews/build.js frames   → hojas de fotogramas de cada
 *                                             grabación, para elegir cortes
 *
 * Usa el ffmpeg del PATH, o el que indique la variable FFMPEG.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { videos } = require('./previews.config');

const DIR = __dirname;
const ROOT = path.join(DIR, '..', '..');
const OUT = path.join(DIR, 'out');
const WORK = path.join(OUT, '.work');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FONT = path.join(ROOT, 'node_modules', '@expo-google-fonts', 'poppins', '700Bold', 'Poppins_700Bold.ttf');

// Formato de Apple para iPhone de 6,9" y 6,5": 886×1920 en vertical, 30 fps,
// entre 15 y 30 segundos, con pista de audio (va en silencio)
const W = 886;
const H = 1920;
const FPS = 30;
const MIN_SECONDS = 15;
const MAX_SECONDS = 30;

// Maquetación: el texto en la franja de arriba y la grabación debajo, con las
// esquinas redondeadas y una sombra suave sobre el degradado verde de la marca
const BG_TOP = [0x16, 0x65, 0x34];
const BG_BOTTOM = [0x06, 0x5f, 0x46];
const CAPTION_BAND = 360;
const FONT_SIZE = 64;
const LINE_HEIGHT = 80;
const CAP_HEIGHT = 46;
const MAX_LINE_CHARS = 20;
const FOOTAGE_BOTTOM = 48;
const SIDE_MARGIN = 40;
const RADIUS = 44;
const SHADOW = 60;
const FADE = 0.3;
// La barra de estado del iPhone (hora, batería y el aviso rojo de grabación)
// se recorta de todas las grabaciones
const STATUS_BAR = 0.065;

const even = (n) => Math.round(n / 2) * 2;

const ffmpeg = (args, cwd = WORK) => {
  const res = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { cwd, stdio: 'inherit' });
  if (res.error) throw new Error(`No se pudo ejecutar ffmpeg (${FFMPEG}): ${res.error.message}`);
  if (res.status !== 0) throw new Error('ffmpeg ha fallado');
};

// Tamaño de la grabación tal y como se ve (las giradas 90° llevan el ancho y
// el alto cambiados en el archivo)
const probeSize = (file) => {
  const { stderr } = spawnSync(FFMPEG, ['-hide_banner', '-i', file], { encoding: 'utf8' });
  const size = stderr.match(/Video:.*?, (\d{2,5})x(\d{2,5})/);
  if (!size) throw new Error(`No se ha podido leer el tamaño de ${file}`);
  const [w, h] = [Number(size[1]), Number(size[2])];
  const rotated = /rotation of -?90/.test(stderr);
  return rotated ? { w: h, h: w } : { w, h };
};

// Texto en líneas: respeta los \n del config y, si no hay, parte por palabras
const wrap = (text) => {
  if (text.includes('\n')) return text.split('\n');
  const lines = [];
  for (const word of text.split(' ')) {
    const last = lines[lines.length - 1];
    if (last && `${last} ${word}`.length <= MAX_LINE_CHARS) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
};

const prepareWork = (name) => {
  const dir = path.join(WORK, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(FONT, path.join(dir, 'font.ttf'));
  return dir;
};

// Fondo, máscara de esquinas redondeadas y sombra: imágenes fijas que se
// generan una vez por vídeo porque dependen del tamaño de la grabación
const renderStills = (work, fw, fh) => {
  const lerp = (i) => `lerp(${BG_TOP[i]},${BG_BOTTOM[i]},Y/H)`;
  ffmpeg(['-f', 'lavfi', '-i', `color=black:s=${W}x${H}`, '-frames:v', '1',
    '-vf', `format=gbrp,geq=r='${lerp(0)}':g='${lerp(1)}':b='${lerp(2)}'`, 'bg.png'], work);

  const dx = `max(0,max(${RADIUS}-X,X-(W-1-${RADIUS})))`;
  const dy = `max(0,max(${RADIUS}-Y,Y-(H-1-${RADIUS})))`;
  ffmpeg(['-f', 'lavfi', '-i', `color=black:s=${fw}x${fh}`, '-frames:v', '1',
    '-vf', `format=gray,geq=lum='255*clip(${RADIUS}+0.5-hypot(${dx},${dy}),0,1)'`, 'mask.png'], work);

  const sw = fw + SHADOW * 2;
  const sh = fh + SHADOW * 2;
  ffmpeg(['-i', 'mask.png', '-frames:v', '1', '-filter_complex',
    `[0]pad=${sw}:${sh}:${SHADOW}:${SHADOW}:color=black,boxblur=24:2,format=gray[a];` +
    `color=black:s=${sw}x${sh}[c];[c][a]alphamerge,colorchannelmixer=aa=0.35`, 'shadow.png'], work);
};

const build = (video, index) => {
  const source = path.join(DIR, video.source);
  if (!fs.existsSync(source)) {
    console.log(`– ${video.out}: falta ${video.source}, se salta`);
    return;
  }

  const total = video.segments.reduce((sum, s) => sum + (s.to - s.from), 0);
  if (total < MIN_SECONDS || total > MAX_SECONDS) {
    throw new Error(`${video.out} dura ${total.toFixed(1)} s y Apple pide entre ${MIN_SECONDS} y ${MAX_SECONDS}`);
  }

  // Recorte de la barra de estado y tamaño de la grabación dentro del marco
  const { w: srcW, h: srcH } = probeSize(source);
  const cropY = even(srcH * STATUS_BAR);
  const cropH = even(srcH - cropY);
  const aspect = srcW / cropH;
  let fh = H - CAPTION_BAND - FOOTAGE_BOTTOM;
  let fw = even(fh * aspect);
  if (fw > W - SIDE_MARGIN * 2) {
    fw = even(W - SIDE_MARGIN * 2);
    fh = even(fw / aspect);
  }
  const fx = (W - fw) / 2;
  const fy = CAPTION_BAND;

  const work = prepareWork(String(index + 1));
  renderStills(work, fw, fh);

  const n = video.segments.length;
  const inputs = [];
  const filters = [];
  video.segments.forEach((s, i) => {
    inputs.push('-ss', String(s.from), '-to', String(s.to), '-i', source);
    filters.push(`[${i}:v]setpts=PTS-STARTPTS,fps=${FPS},crop=${srcW}:${cropH}:0:${cropY},` +
      `scale=${fw}:${fh}:flags=lanczos,setsar=1[s${i}]`);
  });
  inputs.push('-framerate', String(FPS), '-loop', '1', '-i', 'bg.png');
  inputs.push('-framerate', String(FPS), '-loop', '1', '-i', 'shadow.png');
  inputs.push('-framerate', String(FPS), '-loop', '1', '-i', 'mask.png');
  inputs.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');

  filters.push(`${video.segments.map((_, i) => `[s${i}]`).join('')}concat=n=${n}:v=1:a=0,format=yuva420p[body]`);
  filters.push(`[${n + 2}:v]format=gray[mask]`);
  filters.push('[body][mask]alphamerge[fg]');
  filters.push(`[${n}:v][${n + 1}:v]overlay=${fx - SHADOW}:${fy - SHADOW + 14}[bgs]`);

  // Textos: cada línea centrada por separado y con la misma línea base; el
  // primero sin fundido para que el fotograma inicial ya lleve el texto
  const texts = [];
  let start = 0;
  video.segments.forEach((s, i) => {
    const end = i === n - 1 ? total + 1 : start + (s.to - s.from);
    const lines = wrap(s.caption);
    const blockH = (lines.length - 1) * LINE_HEIGHT + CAP_HEIGHT;
    const firstBaseline = Math.round(CAPTION_BAND / 2 - blockH / 2 + CAP_HEIGHT);
    const alpha = i === 0 ? '1' : `min(1,(t-${start})/${FADE})`;
    lines.forEach((line, j) => {
      const file = `c${i}_${j}.txt`;
      fs.writeFileSync(path.join(work, file), line, 'utf8');
      texts.push(`drawtext=fontfile=font.ttf:textfile=${file}:fontsize=${FONT_SIZE}:fontcolor=white:` +
        `x=(w-text_w)/2:y=${firstBaseline + j * LINE_HEIGHT}-max_glyph_a:` +
        `enable='gte(t,${start})*lt(t,${end})':alpha='${alpha}'`);
    });
    start = end;
  });
  filters.push(`[bgs][fg]overlay=${fx}:${fy}:shortest=1,${texts.join(',')},format=yuv420p[v]`);

  fs.mkdirSync(OUT, { recursive: true });
  const outFile = path.join(OUT, video.out);
  ffmpeg([...inputs, '-filter_complex', filters.join(';'),
    '-map', '[v]', '-map', `${n + 3}:a`, '-t', String(total),
    '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.0', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-b:v', '10M', '-maxrate', '12M', '-bufsize', '16M',
    '-c:a', 'aac', '-b:a', '256k', '-ar', '44100', '-ac', '2',
    '-movflags', '+faststart', outFile], work);
  console.log(`✓ ${video.out} (${total.toFixed(1)} s)`);
};

// Hojas de 6×4 fotogramas (uno cada medio segundo) con el tiempo encima, para
// decidir los tramos del config mirando la grabación
const frames = (video, index) => {
  const source = path.join(DIR, video.source);
  if (!fs.existsSync(source)) return;
  const work = prepareWork('frames');
  const dir = path.join(OUT, 'frames');
  fs.mkdirSync(dir, { recursive: true });
  ffmpeg(['-i', source, '-vf',
    'fps=2,scale=220:-2,drawtext=fontfile=font.ttf:text=\'%{pts\\:hms}\':fontsize=18:fontcolor=white:' +
    'box=1:boxcolor=black@0.6:boxborderw=4:x=6:y=6,tile=6x4',
    '-fps_mode', 'vfr', path.join(dir, `${index + 1}-%02d.jpg`)], work);
  console.log(`✓ fotogramas de ${video.source}`);
};

const arg = process.argv[2];
if (arg === 'frames') {
  videos.forEach(frames);
} else {
  videos.forEach((video, i) => {
    if (!arg || Number(arg) === i + 1) build(video, i);
  });
}
