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
    for (const r of srcScene.listChildren()) {
      for (const c of r.listChildren()) { target.addChild(c); added++; }
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
