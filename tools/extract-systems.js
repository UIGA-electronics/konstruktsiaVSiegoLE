/* Собирает из полной модели Diamond облегчённую: планер + системы управления.
   Всё остальное (скан двигателя, салон, авионика, надписи на покрышках)
   отцепляется от узлов, дальше prune выкидывает осиротевшие меши и текстуры. */
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { prune, dedup } = require('@gltf-transform/functions');

const SHELL_MAT = /^Fuselage|^Wings|DA40 Glass|wing rib|spar stub/i;
const CTRL = /^aileron|^elevator|^rudder|^flap|trim|\bstick\b|pedal|^HANDLING_|bellcrank|idler lever|torque tube|control bulkhead|control rib/i;
const EXTRA = /^prop|spinner|gear|wheel|tyre|tire|strut|brake/i;
const DROP = /tyre .* lettering|AE300 engine/i;

(async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(process.argv[2]);
  const root = doc.getRoot();

  const isShellMesh = (mesh) =>
    mesh.listPrimitives().some((p) => {
      const m = p.getMaterial();
      return m && SHELL_MAT.test(m.getName() || '');
    });

  let kept = 0, dropped = 0;
  const keptNames = [];

  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const name = node.getName() || '';
    let keep;
    if (DROP.test(name)) keep = false;
    else if (isShellMesh(mesh)) keep = true;
    else if (CTRL.test(name)) keep = true;
    else if (EXTRA.test(name)) keep = true;
    else keep = false;

    /* Скиннинг: если меш привязан к скелету, вместе с ним нужен и скелет.
       Узел не удаляем никогда — только отцепляем меш, иначе рвётся
       иерархия и каналы анимации. */
    if (keep) { kept++; keptNames.push(name); }
    else { node.setMesh(null); dropped++; }
  }

  await doc.transform(prune({ keepAttributes: false }), dedup());

  await io.write(process.argv[3], doc);
  console.log(`оставлено узлов с геометрией: ${kept}, отцеплено: ${dropped}`);
  console.log(`мешей после prune: ${root.listMeshes().length}`);
  console.log(`материалов: ${root.listMaterials().length}, текстур: ${root.listTextures().length}`);
  console.log(`анимаций: ${root.listAnimations().length} — ` +
    root.listAnimations().map((a) => a.getName()).join(' | '));
  require('fs').writeFileSync('kept-names.txt', keptNames.join('\n'), 'utf8');
})();
