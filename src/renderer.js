/* Scene renderer: draw(t) paints one frame of the video onto a canvas.
 * Pure function of time -> deterministic, so any frame can be rendered in any order. */
(function (global) {
  'use strict';

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const easeOut = (p) => 1 - Math.pow(1 - p, 3);
  const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

  // evenly spaced keyframes, eased per segment
  function kf(arr, p) {
    if (arr.length === 1) return arr[0];
    const seg = clamp(p, 0, 1) * (arr.length - 1);
    const i = Math.min(Math.floor(seg), arr.length - 2);
    const f = seg - i;
    const e = arr.length === 2 ? easeInOut(f) : easeOut(f);
    return arr[i] + (arr[i + 1] - arr[i]) * e;
  }

  function createRenderer(canvas, spec, opts) {
    opts = opts || {};
    const ctx = canvas.getContext('2d');
    const { width: W, height: H } = spec.meta.canvas;
    const pal = spec.style.palette;
    const LW = 12;
    const FONT = `${spec.style.font.weight} %spx "${spec.style.font.family}", "IPAGothic", sans-serif`;
    const font = (px) => FONT.replace('%s', px);
    const col = (name) => pal[name] || name;
    canvas.width = W;
    canvas.height = H;

    // ---------- motion ----------
    function motionAt(name, ms) {
      const m = { sx: 1, ox: 0, oy: 0, op: 1, rot: 0, prog: 1, push: 0, visible: ms >= 0 };
      const p = spec.motion_presets[name];
      if (!p || ms < 0) return m;
      const rep = p.repeat || 1;
      const total = p.duration_ms * rep;
      const lp = ms >= total ? 1 : (ms % p.duration_ms) / p.duration_ms;
      const pp = ms >= total ? 1 : lp;
      if (p.scale) m.sx = kf(p.scale, pp);
      if (p.x) m.ox = kf(p.x, pp);
      if (p.y) m.oy = kf(p.y, pp);
      if (p.opacity) m.op = kf(p.opacity, pp);
      if (p.head_rotate_deg) m.rot = (kf(p.head_rotate_deg, pp) * Math.PI) / 180;
      if (p.stroke_progress) m.prog = kf(p.stroke_progress, pp);
      if (p.x_offset) m.push = kf(p.x_offset, pp);
      return m;
    }

    // ---------- characters ----------
    const ARMS = { // hand positions (right side; left is mirrored)
      neutral: [120, -12], sad: [84, 34], happy: [124, -150], surprised: [126, -168],
    };
    function drawMouth(kind, color) {
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = LW; ctx.lineCap = 'round';
      ctx.beginPath();
      if (kind === 'happy') ctx.arc(0, -178, 26, 0.1 * Math.PI, 0.9 * Math.PI);
      else if (kind === 'sad') ctx.arc(0, -140, 26, 1.1 * Math.PI, 1.9 * Math.PI);
      else if (kind === 'surprised') { ctx.arc(0, -168, 15, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); }
      else { ctx.moveTo(-24, -168); ctx.lineTo(24, -168); }
      ctx.stroke();
    }
    function drawCharacter(el, m, t) {
      const c = col(spec.assets.characters[el.id].color);
      const s = (el.scale || 1) * m.sx;
      if (s <= 0.001) return;
      const breathe = Math.sin(t * 2.6) * 4;
      ctx.save();
      ctx.translate(el.position[0] + m.ox, el.position[1] + m.oy + breathe);
      ctx.scale(s, s);
      ctx.fillStyle = c; ctx.strokeStyle = c; ctx.lineWidth = LW; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // legs
      for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(d * 26, 60); ctx.lineTo(d * 42, 190); ctx.stroke(); }
      // arms
      const [hx, hy] = ARMS[el.mouth] || ARMS.neutral;
      for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(d * 52, -82); ctx.lineTo(d * hx, hy); ctx.stroke(); }
      // body
      ctx.beginPath(); ctx.roundRect(-56, -108, 112, 176, 52); ctx.fill();
      // head (pivot at neck)
      ctx.save();
      ctx.translate(0, -104); ctx.rotate(m.rot); ctx.translate(0, 104);
      ctx.beginPath(); ctx.arc(0, -184, 78, 0, Math.PI * 2); ctx.fill();
      drawMouth(el.mouth, pal.background);
      ctx.restore();
      ctx.restore();
    }

    // ---------- icons ----------
    function drawIcon(el, m) {
      const s = (el.scale || 1) * m.sx;
      if (s <= 0.001) return;
      const c = col('accent');
      ctx.save();
      ctx.translate(el.position[0] + m.ox, el.position[1] + m.oy);
      ctx.scale(s, s);
      ctx.globalAlpha = m.op;
      ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = LW; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const circ = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); };
      const line = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
      switch (el.name) {
        case 'question': case 'exclaim':
          circ(0, 0, 78);
          ctx.font = font(104); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(el.name === 'question' ? '?' : '!', 0, 6);
          break;
        case 'brain':
          circ(-46, -22, 62); circ(46, -22, 62); circ(0, 44, 46);
          line(0, -80, 0, -4);
          ctx.beginPath(); ctx.moveTo(-70, -22); ctx.quadraticCurveTo(-46, -50, -22, -22); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(70, -22); ctx.quadraticCurveTo(46, -50, 22, -22); ctx.stroke();
          break;
        case 'bulb':
          circ(0, -22, 62); line(-26, 52, 26, 52); line(-18, 76, 18, 76);
          for (const a of [-2.4, -1.57, -0.74]) line(Math.cos(a) * 92, -22 + Math.sin(a) * 92, Math.cos(a) * 118, -22 + Math.sin(a) * 118);
          break;
        case 'heart_broken':
          ctx.beginPath(); ctx.moveTo(0, 70);
          ctx.bezierCurveTo(-110, -10, -70, -90, 0, -40);
          ctx.bezierCurveTo(70, -90, 110, -10, 0, 70); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, -40); ctx.lineTo(-16, -10); ctx.lineTo(14, 8); ctx.lineTo(-6, 40); ctx.stroke();
          break;
        case 'check':
          ctx.beginPath(); ctx.moveTo(-64, 0); ctx.lineTo(-16, 46); ctx.lineTo(66, -52); ctx.stroke();
          break;
      }
      ctx.restore();
    }

    // ---------- diagrams ----------
    const DASH = [26, 22];
    function drawDiagram(el, m) {
      const c = col(el.color || 'ink');
      ctx.save();
      ctx.globalAlpha = m.op;
      ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = LW; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const circle = (cx, cy, r, prog, dashed) => {
        ctx.setLineDash(dashed ? DASH : []);
        ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(prog, 0.0001, 1)); ctx.stroke();
        ctx.setLineDash([]);
      };
      switch (el.shape) {
        case 'circle': circle(...el.center, el.radius, m.prog, false); break;
        case 'dashed_circle': circle(...el.center, el.radius, m.prog, true); break;
        case 'line': case 'dashed_line': case 'arrow': {
          const [x1, y1] = el.from, [x2, y2] = el.to;
          const x = x1 + (x2 - x1) * m.prog, y = y1 + (y2 - y1) * m.prog;
          ctx.setLineDash(el.shape === 'dashed_line' ? DASH : []);
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x, y); ctx.stroke();
          ctx.setLineDash([]);
          if (el.shape === 'arrow' && m.prog > 0.02) {
            const a = Math.atan2(y2 - y1, x2 - x1), L = 56;
            ctx.beginPath();
            ctx.moveTo(x - Math.cos(a - 0.5) * L, y - Math.sin(a - 0.5) * L); ctx.lineTo(x, y);
            ctx.lineTo(x - Math.cos(a + 0.5) * L, y - Math.sin(a + 0.5) * L); ctx.stroke();
          }
          break;
        }
        case 'venn_overlap': {
          const [[x1, y1], [x2, y2]] = el.centers, r = el.radius;
          // lens: diagonal hatch clipped to the intersection (keeps to the 3-colour palette)
          ctx.save();
          ctx.beginPath(); ctx.arc(x1, y1, r, 0, Math.PI * 2); ctx.clip();
          ctx.beginPath(); ctx.arc(x2, y2, r, 0, Math.PI * 2); ctx.clip();
          ctx.strokeStyle = col(el.colors[0]);
          for (let k = -H; k < W + H; k += 44) { ctx.beginPath(); ctx.moveTo(k, y1 + r); ctx.lineTo(k + 2 * r, y1 - r); ctx.stroke(); }
          ctx.restore();
          ctx.strokeStyle = col(el.colors[0]); circle(x1, y1, r, 1, false);
          ctx.strokeStyle = col(el.colors[1]); circle(x2, y2, r, 1, false);
          break;
        }
        case 'label':
          ctx.font = font(el.size || 72); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.translate(el.position[0] + m.ox, el.position[1] + m.oy);
          ctx.scale(m.sx, m.sx);
          ctx.fillText(el.text, 0, 0);
          break;
      }
      ctx.restore();
    }

    // ---------- text ----------
    const PARTICLES = 'はがをにでともへ';
    function breakEmphasis(text, maxW) {
      ctx.font = font(spec.style.emphasis_text.size);
      if (ctx.measureText(text).width <= maxW) return [text];
      const mid = text.length / 2;
      let best = Math.round(mid), bd = 1e9;
      for (let i = 2; i < text.length - 1; i++) {
        const d = Math.abs(i - mid) + ('／、＝'.includes(text[i - 1]) ? -2.5 : 0) + (PARTICLES.includes(text[i - 1]) ? -1.5 : 0);
        if (d < bd) { bd = d; best = i; }
      }
      return [text.slice(0, best), text.slice(best)];
    }

    // subtitle chunks: split narration at punctuation, pack to <=24 chars, wrap to <=12 chars/line
    const MAXL = spec.style.subtitle.max_chars_per_line;
    function wrapChunk(s) {
      if (s.length <= MAXL) return [s];
      const n = Math.ceil(s.length / MAXL);
      if (n > 2) { // rare: fall back to even split
        const size = Math.ceil(s.length / n), out = [];
        for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
        return out;
      }
      // two lines: break near the middle, preferring after particles/punctuation, never inside 「」
      let best = Math.ceil(s.length / 2), bc = 1e9;
      for (let i = Math.max(2, s.length - MAXL); i <= Math.min(MAXL, s.length - 2); i++) {
        const before = s.slice(0, i);
        const inQuote = (before.match(/「/g) || []).length > (before.match(/」/g) || []).length;
        const cost = Math.abs(i - s.length / 2)
          + (PARTICLES.includes(s[i - 1]) ? -2 : 0) + ('、」'.includes(s[i - 1]) ? -4 : 0)
          + (inQuote ? 6 : 0)
          + ('」』）、。？！'.includes(s[i]) ? 8 : 0);
        if (cost < bc) { bc = cost; best = i; }
      }
      return [s.slice(0, best), s.slice(best)];
    }
    function buildChunks(scene) {
      const segs = scene.narration.match(/[^、。？！]+[、。？！]?/g) || [scene.narration];
      const chunks = []; let buf = '';
      for (const s of segs) {
        if (buf && (buf + s).length > 2 * MAXL) { chunks.push(buf); buf = ''; }
        buf += s;
        if (/[。？！]$/.test(buf) && buf.length >= 8) { chunks.push(buf); buf = ''; }
      }
      if (buf) chunks.push(buf);
      const clean = chunks.map((c) => c.replace(/[、。]+$/, ''));
      const total = clean.reduce((a, c) => a + c.length, 0);
      const span = scene.duration - 0.5; // leave a short tail for the pause between scenes
      let acc = 0.15;
      return clean.map((c) => {
        const dur = (c.length / total) * span;
        const o = { lines: wrapChunk(c), from: acc, to: acc + dur };
        acc += dur; return o;
      });
    }
    const chunkCache = new Map();

    function drawSubtitle(scene, lt) {
      if (!chunkCache.has(scene.id)) chunkCache.set(scene.id, buildChunks(scene));
      const ch = chunkCache.get(scene.id).find((c) => lt >= c.from && lt < c.to);
      if (!ch) return;
      const st = spec.style.subtitle, lh = st.size * 1.25;
      ctx.font = font(st.size); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round'; ctx.lineWidth = 14;
      ch.lines.forEach((ln, i) => {
        const y = st.y + (i - (ch.lines.length - 1) / 2) * lh;
        ctx.strokeStyle = st.outline; ctx.strokeText(ln, W / 2, y);
        ctx.fillStyle = st.color; ctx.fillText(ln, W / 2, y);
      });
    }

    function drawEmphasis(scene, lt) {
      const e = spec.style.emphasis_text;
      const lines = breakEmphasis(scene.emphasis_text, W - 2 * spec.meta.safe_area.side);
      const p = clamp(lt / 0.35, 0, 1);
      const s = kf([0.6, 1.08, 1], p);
      ctx.save();
      ctx.globalAlpha = clamp(lt / 0.15, 0, 1);
      ctx.fillStyle = e.color; ctx.font = font(e.size); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const lh = e.size * 1.2;
      ctx.translate(W / 2, e.y); ctx.scale(s, s);
      lines.forEach((ln, i) => ctx.fillText(ln, 0, (i - (lines.length - 1) / 2) * lh + (lines.length - 1) * lh / 2));
      ctx.restore();
    }

    // ---------- frame ----------
    function draw(t) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = pal.background; ctx.fillRect(0, 0, W, H);
      const scenes = spec.scenes;
      let scene = scenes[scenes.length - 1];
      for (const s of scenes) if (t >= s.start && t < s.start + s.duration) { scene = s; break; }
      const lt = t - scene.start;
      for (const el of scene.elements) {
        const ms = lt * 1000 - (el.delay_ms || 0);
        let name = el.motion;
        if (!name && el.type !== 'character') name = 'fadeIn';
        const m = motionAt(name, ms);
        if (!m.visible) continue;
        if (el.type === 'character') drawCharacter(el, m, t);
        else if (el.type === 'icon') drawIcon(el, m);
        else if (el.type === 'diagram') drawDiagram(el, m);
      }
      drawEmphasis(scene, lt);
      drawSubtitle(scene, lt);
      if (opts.safeArea) {
        const sa = spec.meta.safe_area;
        ctx.save(); ctx.strokeStyle = '#f00'; ctx.lineWidth = 2; ctx.setLineDash([10, 10]);
        ctx.strokeRect(sa.side, sa.top, W - 2 * sa.side, H - sa.top - sa.bottom); ctx.restore();
      }
    }
    return { draw, width: W, height: H, fps: spec.meta.fps, duration: spec.meta.total_duration_sec };
  }

  global.VideoRenderer = { createRenderer };
})(typeof window !== 'undefined' ? window : globalThis);
