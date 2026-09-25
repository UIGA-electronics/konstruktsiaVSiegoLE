/* Упаковка слоя, собранного в Blender, для сайта: те же настройки, что у
   остальных файлов (meshopt + квантование), подписи — в общий словарь.

     node tools/da40/pack.js raw.glb models/da40/da40-fuel.glb [content/da40-labels.json]

   Рядом с raw.glb должен лежать raw.labels.json от построителя. */
const fs = require('fs');
const path = require('path');
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { dedup, meshopt, prune, weld } = require('@gltf-transform/functions');
const { MeshoptEncoder } = require('meshoptimizer');

(async () => {
  const [src, out, labelsPath] = process.argv.slice(2);
  await MeshoptEncoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const doc = await io.read(src);
  for (const m of doc.getRoot().listMaterials()) {
    const f = m.getBaseColorFactor();
    if (f[3] < 1) { m.setAlphaMode('BLEND'); m.setDoubleSided(true); }
  }
  await doc.transform(dedup(), weld(), prune({ keepAttributes: false }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(out, doc);
  const nodes = doc.getRoot().listNodes().filter((n) => n.getMesh()).length;
  console.log(path.basename(out), (fs.statSync(out).size / 1048576).toFixed(2), 'МБ, деталей', nodes);

  const side = src.replace(/\.glb$/, '.labels.json');
  if (labelsPath && fs.existsSync(side)) {
    const dict = JSON.parse(fs.readFileSync(labelsPath, 'utf8'));
    const extra = JSON.parse(fs.readFileSync(side, 'utf8'));
    let n = 0;
    for (const [k, v] of Object.entries(extra.labels || {})) { if (dict.labels[k] !== v) n++; dict.labels[k] = v; }
    for (const [k, v] of Object.entries(extra.materials || {})) { if (dict.materials[k] !== v) n++; dict.materials[k] = v; }
    fs.writeFileSync(labelsPath, JSON.stringify(dict, null, 1) + '\n');
    console.log('подписей добавлено/обновлено:', n);
  }
})();
