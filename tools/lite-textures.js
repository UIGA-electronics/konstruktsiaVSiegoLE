/* Облегчённая копия файла модели для планшетов и телефонов: все текстуры
   вдвое меньше по стороне (2048 → 1024, 1024 → 512, не меньше 256), геометрия
   и анимация те же. Видеопамять под текстуры падает вчетверо: у планера
   ~390 → ~100 МБ, у салона ~720 → ~190 МБ. Без этого на iPad раздел с салоном
   просит больше гигабайта, текстуры приходят чёрными, а вкладка падает.

     node tools/lite-textures.js models/da40/da40-cabin.glb [...]
     → models/da40/da40-cabin-lite.glb

   Сайт берёт -lite.glb сам на устройствах без мыши (figures.js, liteSrc). */
const path = require('path');
const fs = require('fs');
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { meshopt } = require('@gltf-transform/functions');
const { MeshoptDecoder, MeshoptEncoder } = require('meshoptimizer');
const sharp = require('sharp');

(async () => {
  await MeshoptDecoder.ready;
  await MeshoptEncoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder
  });
  for (const src of process.argv.slice(2)) {
    const doc = await io.read(src);
    let before = 0, after = 0;
    for (const t of doc.getRoot().listTextures()) {
      const img = Buffer.from(t.getImage());
      const m = await sharp(img).metadata();
      const w = Math.max(256, Math.round(m.width / 2)), h = Math.max(256, Math.round(m.height / 2));
      before += m.width * m.height;
      if (w >= m.width) { after += m.width * m.height; continue; }
      const out = await sharp(img).resize(w, h).webp({ quality: 82 }).toBuffer();
      t.setImage(new Uint8Array(out)).setMimeType('image/webp');
      if (t.getURI()) t.setURI(t.getURI().replace(/\.\w+$/, '.webp'));
      after += w * h;
    }
    await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    const dst = src.replace(/\.glb$/, '-lite.glb');
    await io.write(dst, doc);
    console.log(path.basename(dst), (fs.statSync(dst).size / 1048576).toFixed(2), 'МБ;',
      'текстуры', (before * 4 * 1.33 / 1048576).toFixed(0), '→', (after * 4 * 1.33 / 1048576).toFixed(0), 'МБ видеопамяти');
  }
})();
