/* Влить детали из GLB-дополнений (сборщики в Blender) в готовый слой сайта без перенарезки слоя: узлы с
   заданными именами удаляются, детали дополнений встают под корень слоя (DA40 ROOT…), сжатие — как в pack.js.

     node tools/da40/merge_addon.js models/da40/da40-electrical.glb out.glb '["имя", ...]' addon1-raw.glb [addon2-raw.glb ...]

   Подписи новых деталей — из addon-raw.labels.json рядом с дополнением (если есть) — в content/da40-labels.json
   добавляет `node tools/da40/merge_addon.js --labels content/da40-labels.json addon1-raw.glb ...`. */
const fs = require('fs');
const path = require('path');
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { dedup, meshopt, prune, weld, mergeDocuments, unpartition } = require('@gltf-transform/functions');
const { MeshoptEncoder, MeshoptDecoder } = require('meshoptimizer');

/* Матрицы 4×4 по столбцам (как в glTF). Корни слоёв сдвинуты по-разному (у колёс — не на подъём 0,939, как у
   сборщиков Blender), поэтому деталь дополнения переводим из системы своего корня в систему корня слоя. */
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function invertAffine(m) {
  const [a, b, c, d, e, f, g, h, i] = [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  const r = [A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
             B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
             C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
  const t = [m[12], m[13], m[14]];
  return [r[0], r[3], r[6], 0, r[1], r[4], r[7], 0, r[2], r[5], r[8], 0,
          -(r[0] * t[0] + r[1] * t[1] + r[2] * t[2]), -(r[3] * t[0] + r[4] * t[1] + r[5] * t[2]), -(r[6] * t[0] + r[7] * t[1] + r[8] * t[2]), 1];
}

function mergeLabels(labelsPath, addons) {
  const dict = JSON.parse(fs.readFileSync(labelsPath, 'utf8'));
  let n = 0;
  for (const a of addons) {
    const side = a.replace(/\.glb$/, '.labels.json');
    if (!fs.existsSync(side)) continue;
    const extra = JSON.parse(fs.readFileSync(side, 'utf8'));
    for (const [k, v] of Object.entries(extra.labels || {})) { if (dict.labels[k] !== v) n++; dict.labels[k] = v; }
    for (const [k, v] of Object.entries(extra.materials || {})) { if (dict.materials[k] !== v) n++; dict.materials[k] = v; }
  }
  fs.writeFileSync(labelsPath, JSON.stringify(dict, null, 1) + '\n');
  console.log('подписей добавлено/обновлено:', n);
}

(async () => {
  const args = process.argv.slice(2);
  if (args[0] === '--labels') return mergeLabels(args[1], args.slice(2));
  const [site, out, removeJson, ...addons] = args;
  await MeshoptDecoder.ready; await MeshoptEncoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  const doc = await io.read(site);
  const remove = new Set(JSON.parse(removeJson));
  let removed = 0;
  for (const n of doc.getRoot().listNodes()) if (remove.has(n.getName())) { n.dispose(); removed++; }
  if (removed !== remove.size) throw new Error(`удалено ${removed} узлов из ${remove.size}: имена не совпали`);
  const scene = doc.getRoot().listScenes()[0];
  const target = scene.listChildren().find((n) => n.getName().startsWith('DA40 ROOT'));
  if (!target) throw new Error('нет корня DA40 ROOT в слое');
  let added = 0;
  for (const a of addons) {
    const src = await io.read(a);
    const srcScene0 = src.getRoot().listScenes()[0];
    const map = mergeDocuments(doc, src);
    const srcScene = map.get(srcScene0);
    const back = invertAffine(target.getWorldMatrix());
    for (const r of srcScene.listChildren()) {
      const off = mul(back, r.getWorldMatrix());
      for (const c of r.listChildren()) { c.setMatrix(mul(off, c.getMatrix())); target.addChild(c); added++; }
      r.dispose();
    }
    srcScene.dispose();
  }
  for (const m of doc.getRoot().listMaterials()) {
    const f = m.getBaseColorFactor();
    if (f[3] < 1) { m.setAlphaMode('BLEND'); m.setDoubleSided(true); }
  }
  await doc.transform(unpartition(), dedup(), weld(), prune({ keepAttributes: false }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(out, doc);
  const meshes = doc.getRoot().listNodes().filter((n) => n.getMesh()).length;
  console.log(path.basename(out), (fs.statSync(out).size / 1048576).toFixed(2), 'МБ: удалено', removed, 'добавлено', added, 'деталей', meshes,
    'клипы', doc.getRoot().listAnimations().map((x) => x.getName()));
})();
