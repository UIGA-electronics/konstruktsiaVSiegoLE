/* Предельные отклонения поверхностей управления в клипах — по AMM 06-00 рис. 2 (Control Surface Adjustment Report).

     node tools/da40/clip-limits.js models/da40/da40-airframe.glb [ещё.glb …]

   В клипах исходника (MSFS) поверхности отклоняются иначе: закрылки на 41°, элерон на 18° вверх и 22° вниз,
   руль высоты на 15° вверх и 13° вниз. Здесь ключи поворота костей поверхностей масштабируются так, чтобы
   крайние положения совпали с руководством: закрылки 42°, элерон 20° вверх и 13° вниз, руль высоты 21° вверх
   и 17° вниз. Триммер руля высоты идёт за рулём с передаточным отношением 0,7 (таблица ELEVATOR TRIM того же
   рисунка: при нейтральном триммере −27° / −20° / −13° на руле +10° / 0 / −10°).
   Те же пределы — в tools/da40/controls.py (FLAP_LDG, AIL_UP, AIL_DOWN, ELEV_UP, ELEV_DOWN): построенная проводка
   решается по этим углам. Повторный запуск ничего не меняет. Файлы переписываются на месте. */
const fs = require('fs');
const path = require('path');
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { MeshoptDecoder, MeshoptEncoder } = require('meshoptimizer');

/* Знак угла: поворот вокруг оси −X узла (в системе родителя) положителен — задняя кромка идёт вверх. */
const LIMITS = [
  { clip: /^Закрылки/, node: /^Bone_[lr]$/, up: null, down: 42 },
  { clip: /^Элероны/, node: /^Bone2_[lr]$/, up: 20, down: 13 },
  { clip: /^Руль высоты/, node: /^BONE_11$/, up: 21, down: 17 },
  { clip: /^Руль высоты/, node: /^BONE_13$/, like: 'BONE_11' },        // тяги триммера на стабилизаторе — с рулём
  { clip: /^Руль высоты/, node: /^BONE_10$/, follow: 'BONE_11', ratio: 0.7 }   // триммер относительно руля
];
const REF = [-1, 0, 0];
const DEG = 180 / Math.PI;

const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qconj = (q) => [-q[0], -q[1], -q[2], q[3]];

/* Канал поворота → { t, ang (град, со знаком по REF), axis (единичная, по REF), rest } */
function read(ch) {
  const n = ch.getTargetNode(), s = ch.getSampler();
  const t = Array.from(s.getInput().getArray()), q = s.getOutput().getArray();
  const rest = n.getRotation();
  let axis = null;
  const ang = t.map((_, i) => {
    let d = qmul([q[4 * i], q[4 * i + 1], q[4 * i + 2], q[4 * i + 3]], qconj(rest));
    if (d[3] < 0) d = d.map((v) => -v);
    const sn = Math.hypot(d[0], d[1], d[2]);
    if (sn < 1e-6) return 0;
    let ax = [d[0] / sn, d[1] / sn, d[2] / sn];
    let a = 2 * Math.atan2(sn, d[3]) * DEG;
    if (ax[0] * REF[0] + ax[1] * REF[1] + ax[2] * REF[2] < 0) { ax = ax.map((v) => -v); a = -a; }
    if (!axis && Math.abs(a) > 1) axis = ax;
    return a;
  });
  return { t, ang, axis: axis || REF, rest, sampler: s };
}

function write(c, ang) {
  const out = new Float32Array(ang.length * 4);
  ang.forEach((a, i) => {
    const h = a / DEG / 2, sn = Math.sin(h);
    const q = qmul([c.axis[0] * sn, c.axis[1] * sn, c.axis[2] * sn, Math.cos(h)], c.rest);
    out.set(q, 4 * i);
  });
  const acc = c.sampler.getOutput();
  acc.setArray(out);            // ключи поворота — без квантования
  acc.setNormalized(false);
}

const at = (c, time) => {       // линейная интерполяция угла по времени
  const { t, ang } = c;
  if (time <= t[0]) return ang[0];
  for (let i = 1; i < t.length; i++) if (time <= t[i]) return ang[i - 1] + (ang[i] - ang[i - 1]) * (time - t[i - 1]) / (t[i] - t[i - 1]);
  return ang[ang.length - 1];
};

(async () => {
  await MeshoptDecoder.ready; await MeshoptEncoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  for (const file of process.argv.slice(2)) {
    const doc = await io.read(file);
    const log = [];
    for (const anim of doc.getRoot().listAnimations()) {
      const chans = {};
      for (const ch of anim.listChannels()) {
        const n = ch.getTargetNode();
        if (n && ch.getTargetPath() === 'rotation') chans[n.getName()] = read(ch);
      }
      const rules = [];
      for (const [name, c] of Object.entries(chans)) {
        const rule = LIMITS.find((r) => r.clip.test(anim.getName()) && r.node.test(name));
        if (rule) rules.push([name, c, rule]);
      }
      // множители — по исходным углам, до правки
      const fac = {};
      for (const [name, c, r] of rules) {
        if (r.up === undefined) continue;
        const hi = Math.max(...c.ang), lo = -Math.min(...c.ang);
        fac[name] = { up: r.up && hi > 0.5 ? r.up / hi : 1, down: r.down && lo > 0.5 ? r.down / lo : 1 };
      }
      const next = {};
      for (const [name, c, r] of rules) {
        if (r.follow) continue;
        const f = fac[r.like || name];
        if (!f) continue;
        next[name] = c.ang.map((a) => a * (a > 0 ? f.up : f.down));
      }
      for (const [name, c, r] of rules) {
        if (!r.follow) continue;
        const lead = chans[r.follow];
        if (!lead) continue;
        const led = { t: lead.t, ang: next[r.follow] || lead.ang };
        next[name] = c.t.map((time) => r.ratio * at(led, time));
      }
      for (const [name, c] of rules) {
        if (!next[name]) continue;
        const was = [Math.min(...c.ang), Math.max(...c.ang)], now = [Math.min(...next[name]), Math.max(...next[name])];
        if (Math.abs(was[0] - now[0]) + Math.abs(was[1] - now[1]) < 0.02) continue;
        write(c, next[name]);
        log.push(`${anim.getName()} · ${name}: ${was[0].toFixed(1)}…${was[1].toFixed(1)}° → ${now[0].toFixed(1)}…${now[1].toFixed(1)}°`);
      }
    }
    if (log.length) await io.write(file, doc);
    console.log(path.basename(file), log.length ? '\n  ' + log.join('\n  ') : '— пределы уже по AMM, без изменений');
  }
})();
