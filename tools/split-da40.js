/* Режет полную модель DA 40 NG на отдельные файлы: по одному на систему
   плюс планер, кабина, двигатель и колёса.

     node tools/split-da40.js DA40NG_Tundra_anim.glb membership.json models/da40

   membership.json делает tools/da40-membership.py из .blend: в GLB коллекций
   нет, а деление на системы сделано именно коллекциями, по AMM.

   Все файлы остаются в одной системе координат: иерархия узлов над каждой
   деталью сохраняется (без мешей), поэтому любые файлы, загруженные в одну
   сцену, встают на свои места. Клип анимации в каждом файле свой кусок
   общего: у «Закрылки UP → LDG» тяги лежат в управлении, сами закрылки —
   в планере, рычаг — в кабине. Проигранные вместе, куски совпадают.

   По пути чинятся те же дефекты экспорта, что и раньше (fix-materials.js,
   drop-stray-rod.js), текстуры переводятся в WebP, геометрия квантуется.
   Геометрия сжата meshopt (EXT_meshopt_compression): сайту для этого нужен
   декодер meshopt_decoder.js, он подключается в figures.js рядом с GLTFLoader. */
const fs = require('fs');
const path = require('path');
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const {
  cloneDocument, dedup, meshopt, prune, resample, textureCompress, simplify, weld
} = require('@gltf-transform/functions');
const { MeshoptEncoder, MeshoptSimplifier } = require('meshoptimizer');
const draco3d = require('draco3dgltf');
const sharp = require('sharp');

/* Коллекции .blend → файлы. Совпадение по пути коллекции целиком или
   по префиксу «путь/», так что вложенные коллекции уходят вместе с родителем,
   если их не вынести явно через exclude. */
const PARTS = [
  { file: 'da40-controls.glb',    title: 'Управление',             cols: ['DA40 Systems/Flight controls'] },
  { file: 'da40-wing-structure.glb', title: 'Силовой набор крыла', cols: ['DA40 Systems/Wing structure'] },
  { file: 'da40-fuel.glb',        title: 'Топливная система',      cols: ['DA40 Systems/Fuel system'] },
  { file: 'da40-electrical.glb',  title: 'Электрика',              cols: ['DA40 Systems/Electrical system'] },
  { file: 'da40-avionics.glb',    title: 'Авионика и антенны',     cols: ['DA40 Systems/Avionics & antennas'] },
  { file: 'da40-brakes.glb',      title: 'Тормоза',                cols: ['DA40 Systems/Brakes (hydraulic)'] },
  { file: 'da40-air.glb',         title: 'Вентиляция и отопление', cols: ['DA40 Systems/Cabin ventilation & heating'] },
  { file: 'da40-pitot-static.glb', title: 'ПВД, статика, сваливание', cols: ['DA40 Systems/Pitot-static & stall warning'] },
  { file: 'da40-cooling.glb',     title: 'Охлаждение',             cols: ['DA40 Systems/Cooling system'] },
  { file: 'da40-induction.glb',   title: 'Наддув и выхлоп',        cols: ['DA40 Systems/Induction & exhaust'] },
  { file: 'da40-oil.glb',         title: 'Масляная система',       cols: ['DA40 Systems/Oil systems'] },
  { file: 'da40-airframe.glb',    title: 'Планер',                 cols: ['DA40 Exterior'],
    exclude: ['DA40 Exterior/DA40 Engine', 'DA40 Exterior/DA40 Tundra wheels'] },
  { file: 'da40-wheels.glb',      title: 'Колёса Tundra',          cols: ['DA40 Exterior/DA40 Tundra wheels'],
    simplify: 0.3 },
  { file: 'da40-engine.glb',      title: 'Двигатель AE300',        cols: ['DA40 Exterior/DA40 Engine'],
    simplify: 0.2 },
  { file: 'da40-cabin.glb',       title: 'Кабина',                 cols: ['DA40 Interior'] }
];

/* Колёса и двигатель — фотоскан и надписи на покрышках, сотни тысяч
   треугольников. Упрощаем с допуском 0,2 % радиуса меша — это около
   миллиметра на колесе, на экране не видно. */
const SIMPLIFY_ERROR = 0.002;

/* Текстуры по трём размерам. Ливрея (8K в исходнике) видна крупно, на ней
   регистрация и надписи — 4096. Карты нормалей и масок салона и остекление
   мелкие на экране — 1024. Всё остальное, включая приборную доску, — 2048. */
const LIVERY = '(FUSELAGE2?|WINGS)_ALBD';
const SMALL = '(?!.*(FUSELAGE|WINGS)).*(_NORM|_COMP|GLASS)';
const TEX = [
  [new RegExp(LIVERY, 'i'), 4096, 88],
  [new RegExp('^' + SMALL, 'i'), 1024, 85],
  [new RegExp('^(?!.*' + LIVERY + ')(?!' + SMALL + ').*', 'i'), 2048, 85]
];

/* Детали MSFS, заменённые построенными по документам (tools/da40): из планера
   вырезаются. Файлы, которые теперь собираются в Blender, нарезка не трогает. */
const REPLACED = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(__dirname, 'da40', 'replaced.json'), 'utf8'))));
const REBUILT = new Set(['da40-fuel.glb', 'da40-wing-structure.glb', 'da40-pitot-static.glb', 'da40-brakes.glb', 'da40-air.glb']);

/* Два дефекта экспорта — см. fix-materials.js. */
function fixMaterials(doc) {
  for (const m of doc.getRoot().listMaterials()) {
    const name = m.getName() || '';
    if (/tyre .* rubber$/i.test(name)) {
      m.setBaseColorFactor([0.045, 0.045, 0.048, 1]);
      m.setMetallicFactor(0);
      m.setRoughnessFactor(0.88);
    } else if (/^DA40 Glass$/i.test(name)) {
      m.setAlphaMode('BLEND');
      m.setBaseColorFactor([0.82, 0.88, 0.92, 0.26]);
      m.setMetallicFactor(0);
      m.setRoughnessFactor(0.06);
      m.setDoubleSided(true);
    }
  }
  /* Стержень-«палка» у кривошипа закрылков — см. drop-stray-rod.js. */
  for (const n of doc.getRoot().listNodes()) {
    if (n.getMesh() && /^Flap torsion tube \(steel\)$/i.test(n.getName() || '')) n.setMesh(null);
  }
}

function inPart(cols, part) {
  if (!cols) return false;
  const hit = (p) => cols.some((c) => c === p || c.startsWith(p + '/'));
  return part.cols.some(hit) && !(part.exclude || []).some(hit);
}

function parentOf(doc) {
  const map = new Map();
  for (const n of doc.getRoot().listNodes()) for (const c of n.listChildren()) map.set(c, n);
  return map;
}

/* Оставляем детали части, их скелеты и всех предков — предки нужны без мешей,
   ради трансформаций: тяги висят на анимированных кривошипах. */
function cut(doc, part, members) {
  const parent = parentOf(doc);
  const own = new Set(), keep = new Set();
  const up = (n) => { while (n && !keep.has(n)) { keep.add(n); n = parent.get(n); } };

  for (const n of doc.getRoot().listNodes()) {
    const m = members[n.getName()];
    if (m && inPart(m.cols, part) && !REPLACED.has(n.getName())) { own.add(n); up(n); }
  }
  for (const n of own) {
    const skin = n.getSkin();
    if (!skin) continue;
    skin.listJoints().forEach(up);
    if (skin.getSkeleton()) up(skin.getSkeleton());
  }

  for (const n of doc.getRoot().listNodes()) {
    if (!keep.has(n)) n.dispose();
    else if (!own.has(n)) { n.setMesh(null); n.setSkin(null); }
  }

  /* Каналы, чьи узлы ушли, выбрасываем; пустые клипы — тоже. */
  for (const a of doc.getRoot().listAnimations()) {
    for (const ch of a.listChannels()) {
      if (!ch.getTargetNode()) { ch.getSampler() && ch.getSampler().dispose(); ch.dispose(); }
    }
    if (!a.listChannels().length) a.dispose();
  }
  return own.size;
}

(async () => {
  const [src, memPath, outDir] = process.argv.slice(2);
  if (!src || !memPath || !outDir) {
    console.error('node tools/split-da40.js <src.glb> <membership.json> <outDir>');
    process.exit(1);
  }
  const members = JSON.parse(fs.readFileSync(memPath, 'utf8')).objects;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'meshopt.encoder': MeshoptEncoder
  });
  const base = await io.read(src);
  fixMaterials(base);
  /* Draco на выходе не нужен: сайт его не декодирует без лишней библиотеки. */
  for (const e of base.getRoot().listExtensionsUsed()) {
    if (e.extensionName === 'KHR_draco_mesh_compression') e.dispose();
  }

  /* Сколько узлов с мешами не попало ни в одну часть — чтобы ничего
     не потерять молча. */
  const orphan = base.getRoot().listNodes().filter((n) => n.getMesh() &&
    !PARTS.some((p) => inPart((members[n.getName()] || {}).cols, p)));
  console.log('мешей вне частей:', orphan.length,
    orphan.slice(0, 12).map((n) => n.getName() + ' [' + ((members[n.getName()] || {}).cols || '?') + ']').join('; '));

  fs.mkdirSync(outDir, { recursive: true });
  await MeshoptSimplifier.ready;
  await MeshoptEncoder.ready;
  const report = [];
  const old = fs.existsSync(path.join(outDir, 'parts.json'))
    ? JSON.parse(fs.readFileSync(path.join(outDir, 'parts.json'), 'utf8')) : [];
  for (const part of PARTS) {
    if (REBUILT.has(part.file)) {
      const keep = old.find((r) => r.file === part.file);
      if (keep) report.push(keep);
      console.log(part.file.padEnd(26), 'собирается в Blender (tools/da40) — пропуск');
      continue;
    }
    const doc = cloneDocument(base);
    const own = cut(doc, part, members);
    const steps = [prune({ keepAttributes: false }), dedup(), resample()];
    if (part.simplify) {
      steps.push(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: part.simplify, error: SIMPLIFY_ERROR }));
    }
    steps.push(
      ...TEX.map(([pattern, px, quality]) =>
        textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [px, px], pattern, quality })),
      prune({ keepAttributes: false }),
      meshopt({ encoder: MeshoptEncoder, level: 'medium' })
    );
    await doc.transform(...steps);
    const out = path.join(outDir, part.file);
    await io.write(out, doc);
    const r = doc.getRoot();
    const row = {
      file: part.file, title: part.title, parts: own,
      meshes: r.listMeshes().length,
      clips: r.listAnimations().map((a) => a.getName()),
      mb: +(fs.statSync(out).size / 1048576).toFixed(2)
    };
    report.push(row);
    console.log(row.file.padEnd(26), String(row.mb).padStart(6), 'МБ', 'деталей', own, 'клипы:', row.clips.join(', ') || '—');
  }
  fs.writeFileSync(path.join(outDir, 'parts.json'), JSON.stringify(report, null, 2) + '\n');
})();
