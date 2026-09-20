/* Убирает «Flap torsion tube (steel)».

   Это тонкий стержень 0,03 × 0,87 × 0,93 м, подвешенный к кривошипу
   торсионной трубы закрылков. Он уходит вперёд и вниз, к носовой стойке,
   и качается вместе с закрылками — со стороны выглядит как палка, вылезающая
   из самолёта. Настоящая торсионная труба поперечная, и она в модели есть
   отдельно: «Flap torsion tube (aluminium)», размах по x от −0,60 до +0,60.

   Меш отцепляем, узел оставляем: на него могут смотреть каналы анимации. */
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { prune } = require('@gltf-transform/functions');

const BAD = /^Flap torsion tube \(steel\)$/i;

(async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(process.argv[2]);

  let hit = 0;
  for (const node of doc.getRoot().listNodes()) {
    if (node.getMesh() && BAD.test(node.getName() || '')) {
      node.setMesh(null);
      hit++;
    }
  }
  await doc.transform(prune({ keepAttributes: false }));
  await io.write(process.argv[3], doc);
  console.log('отцеплено мешей:', hit);
})();
