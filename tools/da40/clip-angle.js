/* Угол поворота узла в клипе (градусы) по кадрам: node clipangle.js file.glb clip node */
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { MeshoptDecoder } = require('meshoptimizer');
(async () => {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const [file, clip, node] = process.argv.slice(2);
  const doc = await io.read(file);
  const a = doc.getRoot().listAnimations().find((x) => x.getName() === clip);
  const ch = a.listChannels().find((c) => c.getTargetNode().getName() === node && c.getTargetPath() === 'rotation');
  const t = ch.getSampler().getInput().getArray(), q = ch.getSampler().getOutput().getArray();
  const dot = (i) => Math.abs(q[0]*q[4*i] + q[1]*q[4*i+1] + q[2]*q[4*i+2] + q[3]*q[4*i+3]);
  const out = Array.from(t, (ti, i) => [+ti.toFixed(5), +(2 * Math.acos(Math.min(1, dot(i))) * 180 / Math.PI).toFixed(4)]);
  console.log(JSON.stringify({ clip, node, samples: out }));
})();
