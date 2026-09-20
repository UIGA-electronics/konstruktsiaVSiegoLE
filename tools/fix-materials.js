/* Чинит два дефекта экспорта в самой модели.

   1. Шины. У материалов «DA40 Tundra tyre * rubber» не задан baseColorFactor,
      а по спецификации glTF это значит белый. Отсюда белые колёса.
   2. Остекление. У «DA40 Glass» не выставлен alphaMode, по умолчанию OPAQUE,
      поэтому фонарь непрозрачный. Соседний «DA40 sight glass» сделан правильно
      (BLEND, альфа 0.35) — значит, просто забыли.

   Чиним в модели, а не в коде страницы: тогда она правильная везде. */
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');

const RUBBER = /tyre .* rubber$/i;
const GLASS = /^DA40 Glass$/i;

(async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(process.argv[2]);

  let tyres = 0, glass = 0;
  for (const m of doc.getRoot().listMaterials()) {
    const name = m.getName() || '';
    if (RUBBER.test(name)) {
      /* Резина протектора: почти чёрная, но не в ноль — иначе на светлом
         фоне колесо читается силуэтом без формы. */
      m.setBaseColorFactor([0.045, 0.045, 0.048, 1]);
      m.setMetallicFactor(0);
      m.setRoughnessFactor(0.88);
      tyres++;
    } else if (GLASS.test(name)) {
      m.setAlphaMode('BLEND');
      m.setBaseColorFactor([0.82, 0.88, 0.92, 0.26]);
      m.setMetallicFactor(0);
      m.setRoughnessFactor(0.06);
      m.setDoubleSided(true);
      glass++;
    }
  }

  await io.write(process.argv[3], doc);
  console.log(`шинных материалов исправлено: ${tyres}, стекло: ${glass}`);
})();
