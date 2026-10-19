/* Снимает с готового файла модели детали MSFS, заменённые построенными по документам
   (tools/da40/replaced.json), — без новой нарезки всего планера с текстурами.

     node tools/drop-replaced.js models/da40/da40-airframe.glb [--dry]

   Файл переписывается на месте. Меш отцепляем, узел оставляем: на него могут
   смотреть каналы анимации. */
const fs = require('fs');
const path = require('path');
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { prune } = require('@gltf-transform/functions');
const { MeshoptDecoder, MeshoptEncoder } = require('meshoptimizer');

const REPLACED = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(__dirname, 'da40', 'replaced.json'), 'utf8'))));

(async () => {
  await MeshoptDecoder.ready;
  await MeshoptEncoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder
  });
  const dry = process.argv.includes('--dry');
  for (const file of process.argv.slice(2).filter((a) => a !== '--dry')) {
    const doc = await io.read(file);
    const hit = [];
    for (const node of doc.getRoot().listNodes()) {
      if (node.getMesh() && REPLACED.has(node.getName())) {
        hit.push(node.getName());
        if (!dry) node.setMesh(null);
      }
    }
    if (!dry && hit.length) {
      await doc.transform(prune({ keepAttributes: true }));
      await io.write(file, doc);
    }
    console.log(path.basename(file), dry ? 'нашлось' : 'отцеплено', hit.length, hit.join(', '));
  }
})();
