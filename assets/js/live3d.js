/* ═══════════════════════════════════════════════════════
   Живая схема «как на самолёте»: модель системы из Blender + обтекание
   ═══════════════════════════════════════════════════════
   Модель (models/fc6/*.glb) собрана в Blender: DA 40 NG — скриптом
   fc6_build.py из нашей модели и практикума, А320 — скриптом a320_build.py
   по открытым размерам. Ход системы — клип, запечённый в Blender; читатель
   тянет рычаг или руль прямо на модели (или ползунком), камера крутится.

   Режимы (opts.modes) — несколько клипов одной модели со своим описанием
   поверхности: у А320 крен, тангаж, рыскание, торможение, механизация и
   балансировка стабилизатором. Без modes — один клип, как у DA 40.

   Воздух считается здесь же, в браузере (airflow.js): по профилю несущей
   поверхности с рулями, повёрнутыми ровно на те углы, на которые их
   повернула модель.
     — давление — цветом по обшивке (синее — разрежение, красное — подпор);
     — струйки — частицы в нескольких сечениях по размаху;
     — срез — поле давления в плоскости главного сечения;
     — стрелки — прирост силы на сечении от руля;
     — за поднятым спойлером — застойная зона (срыв), вихрящиеся частицы.

   Описание поверхности (.flow.json, его пишет скрипт сборки по модели):
     axis — ось размаха в осях Blender: 'x' (крыло, стабилизатор) или 'z' (киль);
     le/te — передняя и задняя кромки по размаху: p (назад) и q (вверх у
       крыла, влево у киля) — прямыми {p, q} или ломаной {pts: [[s, p, q]]};
     controls — рули: ось (доля хорды), размах, узлы и меши модели, parent —
       руль, на котором стоит этот (триммер на руле высоты);
     drive — ход рулей по ползунку, снятый в Blender (у А320): угол и сдвиг
       звена в сечении; без drive углы меряются по позе модели (DA 40);
     cut — где режутся звенья многозвенного крыла (предкрылок, закрылок
       Фаулера, спойлер), skin.el — какое звено красит какой меш;
     alpha — 'lift' (угол атаки по скорости, чтобы держать массу mass на
       площади area) или 'level' (поток вдоль строительной горизонтали);
     hud — какую сводку писать.

   opts: src, modes | (flow, input, ends, half, marks, mid), views, labels,
         grab (что можно тянуть), hint.

   Упрощённый вид (opts.schematic) — та же модель и тот же ход, но без
   воздуха: обшивка полупрозрачная, детали системы покрашены по роли
   (opts.groups [{m, c}] — регулярка имени и цвет, opts.legend — подписи
   цветов), остальное — нейтрально-серое. Режим может подсветить свои
   поверхности (mode.hi). «Пошагово» (opts.steps [{v | mark, on: [номера
   выносок], t, view}]) ставит систему в положение шага и подсвечивает детали. */
(function () {
  'use strict';
  if (!window.Figures || !Figures.util) return;
  var U = Figures.util, clamp = U.clamp;
  var DEG = Math.PI / 180;

  /* Шкала давления: Cp от −2 (разрежение) до +1 (полное торможение).
     Ноль — цвет краски, так на обшивке видно только то, что отличается
     от невозмущённого потока. Та же шкала в шейдерах и в легенде. */
  var SUCK = [[0, [0.93, 0.95, 0.97]], [0.18, [0.55, 0.85, 1.0]], [0.5, [0.16, 0.48, 1.0]], [1, [0.36, 0.17, 0.85]]];
  var PRESS = [[0, [0.93, 0.95, 0.97]], [0.3, [1.0, 0.82, 0.4]], [0.65, [1.0, 0.52, 0.22]], [1, [0.86, 0.19, 0.2]]];
  function ramp(st, t) {
    for (var i = 1; i < st.length; i++) if (t <= st[i][0]) {
      var a = st[i - 1], b = st[i], k = (t - a[0]) / (b[0] - a[0]);
      return [a[1][0] + (b[1][0] - a[1][0]) * k, a[1][1] + (b[1][1] - a[1][1]) * k, a[1][2] + (b[1][2] - a[1][2]) * k];
    }
    return st[st.length - 1][1];
  }
  function cpColor(cp) { return cp < 0 ? ramp(SUCK, clamp(-cp / 2, 0, 1)) : ramp(PRESS, clamp(cp, 0, 1)); }
  var GLSL_CMAP =
    'vec3 rampS(float t){ t=clamp(t,0.,1.);' +
    ' if(t<.18) return mix(vec3(.93,.95,.97),vec3(.55,.85,1.),t/.18);' +
    ' if(t<.5) return mix(vec3(.55,.85,1.),vec3(.16,.48,1.),(t-.18)/.32);' +
    ' return mix(vec3(.16,.48,1.),vec3(.36,.17,.85),(t-.5)/.5); }\n' +
    'vec3 rampP(float t){ t=clamp(t,0.,1.);' +
    ' if(t<.3) return mix(vec3(.93,.95,.97),vec3(1.,.82,.4),t/.3);' +
    ' if(t<.65) return mix(vec3(1.,.82,.4),vec3(1.,.52,.22),(t-.3)/.35);' +
    ' return mix(vec3(1.,.52,.22),vec3(.86,.19,.2),(t-.65)/.35); }\n' +
    'vec3 cpmap(float cp){ return cp<0. ? rampS(-cp*.5) : rampP(cp); }\n';

  var jsonCache = {};
  function getJSON(u) {
    return jsonCache[u] || (jsonCache[u] = fetch(U.withV(u)).then(function (r) { return r.json(); }));
  }
  function signed(v, d) { return (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d == null ? 2 : d).replace('.', ','); }
  /* кусочно-линейная по таблице xs → ys (ys — числа или массивы) */
  function interp(xs, ys, x) {
    var n = xs.length, i = 1;
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    while (i < n - 1 && xs[i] < x) i++;
    var t = (x - xs[i - 1]) / ((xs[i] - xs[i - 1]) || 1e-9), a = ys[i - 1], b = ys[i];
    if (typeof a === 'number') return a + (b - a) * t;
    return a.map(function (v, k) { return v + (b[k] - v) * t; });
  }

  Figures.register('live3d', function (frame, opts) {
    opts = opts || {};
    var LITE = U.LITE, TOUCH = U.TOUCH;
    var MODES = opts.modes || [{ flow: opts.flow, input: opts.input, ends: opts.ends, half: opts.half, marks: opts.marks, mid: opts.mid, speed: opts.speed, slice: opts.slice }];
    frame.classList.add('is-live3d');
    var box = document.createElement('div');
    box.className = 'live3d';
    box.innerHTML = '<div class="model3d-note">Загрузка модели…</div>';
    frame.appendChild(box);
    var DEF_VIEWS = [{ t: 'Общий вид', dir: [0.7, 0.55, -0.9] }];
    var views = MODES[0].views || opts.views || DEF_VIEWS;
    var bar = U.controls(frame,
      (MODES.length > 1 ? '<div class="l3-modes" role="group" aria-label="Режим">' + MODES.map(function (m, i) {
        return '<button class="fig-btn' + (i ? '' : ' is-on') + '" type="button" data-mode="' + i + '">' + m.t + '</button>';
      }).join('') + '</div>' : '') +
      '<div class="fig-cams">' + views.map(function (v, i) {
        return '<button class="fig-cam' + (i ? '' : ' is-on') + '" type="button" data-v="' + i + '">' + v.t + '</button>';
      }).join('') + '</div>' +
      '<div class="l3-marks" hidden></div>' +
      (opts.steps ? '<div class="l3-steps"><button class="fig-btn" type="button" data-step="-1" aria-label="Предыдущий шаг">‹</button>' +
        '<button class="fig-btn l3-sgo" type="button">Пошагово</button>' +
        '<button class="fig-btn" type="button" data-step="1" aria-label="Следующий шаг">›</button></div>' : '') +
      '<span class="fig-label l3-in"></span>' +
      '<input class="fig-range" type="range" min="-100" max="100" value="0">' + U.AUTO +
      '<span class="fig-readout l3-out"></span>');
    var outEl = bar.querySelector('.l3-out'), inEl = bar.querySelector('.l3-in'), marksEl = bar.querySelector('.l3-marks');
    var info = document.createElement('div');
    info.className = 'l3-info';
    info.setAttribute('aria-live', 'polite');
    frame.appendChild(info);
    var list = document.createElement('ul');
    list.className = 'pl-list l3-list';
    frame.appendChild(list);

    U.ensureThree().then(function () {
      if (!frame.isConnected) return;
      var THREE = window.THREE, solver = window.Airflow;
      var dead = false;
      var W = box.clientWidth || 640;
      function ratioFor(w) { return w < 560 ? (opts.ratioPhone || 1.05) : (opts.ratio || 0.6); }
      var H = Math.round(W * ratioFor(W));

      /* телефон: экран и так плотный — сглаживание не нужно, а слабому
         процессору (iPhone 5s) оно стоит половины кадров */
      var DPR = devicePixelRatio || 1;
      var renderer = new THREE.WebGLRenderer({ antialias: !(LITE && DPR >= 2), alpha: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(DPR, LITE ? 1.5 : 2));
      renderer.setSize(W, H);
      renderer.setClearColor(0x000000, 0);
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.physicallyCorrectLights = true;
      var scene = new THREE.Scene();
      var pm = new THREE.PMREMGenerator(renderer);
      var envTex = pm.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
      scene.environment = envTex;
      pm.dispose();
      var key = new THREE.DirectionalLight(0xffffff, 2.2);
      key.position.set(-4, 9, -3);
      scene.add(key);
      scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x3a4560, 0.75));
      var cam = new THREE.PerspectiveCamera(32, W / H, 0.05, 400);

      var loader = new THREE.GLTFLoader();
      if (window.MeshoptDecoder) loader.setMeshoptDecoder(window.MeshoptDecoder);
      var gltfP = new Promise(function (res, rej) { loader.load(U.withV(LITE && opts.srcLite ? opts.srcLite : opts.src), res, null, rej); });
      function loadFlow(u) {
        if (!u || !solver) return Promise.resolve(null);
        return getJSON(u).then(function (f) {
          if (f.foilPts) return f;
          if (f.naca) { f.foilPts = solver.naca(f.naca); return f; }
          return getJSON(f.foil).then(function (fo) { f.foilPts = fo.pts; return f; });
        });
      }

      U.onUnmount(frame, function () {
        dead = true;
        scene.traverse(function (o) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) [].concat(o.material).forEach(function (m) {
            Object.keys(m).forEach(function (k) { if (m[k] && m[k].isTexture) m[k].dispose(); });
            if (m.uniforms) Object.keys(m.uniforms).forEach(function (k) { var v = m.uniforms[k].value; if (v && v.isTexture) v.dispose(); });
            m.dispose();
          });
        });
        envTex.dispose();
        renderer.dispose();
        if (renderer.forceContextLoss) renderer.forceContextLoss();
      });

      Promise.all([gltfP, loadFlow(MODES[0].flow)]).then(function (res) {
        if (dead) return;
        var gltf = res[0];
        box.innerHTML = '';
        box.appendChild(renderer.domElement);
        var spotsEl = document.createElement('div');
        spotsEl.className = 'l3-spots';
        box.appendChild(spotsEl);
        var hud = document.createElement('div');
        hud.className = 'l3-hud';
        box.appendChild(hud);

        var root = gltf.scene;
        scene.add(root);
        var mixer = new THREE.AnimationMixer(root), act = null, t0 = 0, t1 = 1, half = false;
        function useClip(name) {
          var clip = (name && gltf.animations.filter(function (a) { return a.name === name; })[0]) || gltf.animations[0];
          if (act) act.stop();
          act = mixer.clipAction(clip);
          act.play(); act.paused = true;
          t0 = Infinity; t1 = 0;
          clip.tracks.forEach(function (tr) { t0 = Math.min(t0, tr.times[0]); t1 = Math.max(t1, tr.times[tr.times.length - 1]); });
        }
        function pose(v) {
          act.time = t0 + (t1 - t0) * (half ? v : (v + 1) / 2);
          mixer.update(0);
          root.updateMatrixWorld(true);
        }

        /* детали по имени: ближайшее осмысленное имя вверх по дереву */
        function nameOf(o) {
          for (var p = o; p; p = p.parent) if (p.name && !/^(mesh|node|object)?_?\d*$/i.test(p.name)) return p.name.replace(/_/g, ' ');
          return '';
        }
        var meshes = [];
        root.traverse(function (o) { if (o.isMesh) { o.__nm = nameOf(o); meshes.push(o); } });

        /* ── материалы ───────────────────────────────────────── */
        var SCH = !!opts.schematic, GROUPS = (opts.groups || []).map(function (g) { return { r: new RegExp(g.m, 'i'), c: g.c }; });
        meshes.forEach(function (o) {
          var m = o.material;
          if (!m) return;
          if (SCH) {
            /* упрощённо: деталь системы — цветом своей роли, обшивка — стекло, прочее — серое */
            var g = GROUPS.filter(function (x) { return x.r.test(o.__nm); })[0];
            if (g) o.material = new THREE.MeshStandardMaterial({ color: g.c, roughness: 0.45, metalness: 0.12 });
            else if (/Ghost|Paint white/.test(m.name) && opts.ghostSkins !== false) {
              o.material = new THREE.MeshPhysicalMaterial({ color: 0xdfe7f2, roughness: 0.2, metalness: 0,
                transparent: true, opacity: /Ghost/.test(m.name) ? 0.06 : 0.09, depthWrite: false, side: THREE.DoubleSide });
              o.renderOrder = 2;
            } else if (/Paint white/.test(m.name)) o.material = new THREE.MeshStandardMaterial({ color: 0xdfe3e8, roughness: 0.45, side: THREE.DoubleSide });
            else if (/Glass|Window/.test(m.name)) m.envMapIntensity = 1.1;
            else o.material = new THREE.MeshStandardMaterial({ color: 0x8b95a8, roughness: 0.55, metalness: 0.2 });
            o.__base = o.material;
            return;
          }
          if (/Ghost/.test(m.name)) {
            /* фюзеляж — стекло: видна проводка внутри */
            o.material = new THREE.MeshPhysicalMaterial({ color: 0xe9eef5, roughness: 0.18, metalness: 0,
              transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide });
            o.renderOrder = 2;
          } else if (/Paint white/.test(m.name)) {
            /* двусторонний: в разрезе видна оболочка профиля. У «Paint white» без
               уточнения — светлая краска; у остальных (крыло, рули А320) — свой тон */
            o.material = new THREE.MeshStandardMaterial({ color: /^Paint white$/.test(m.name) ? 0xdfe3e8 : m.color, roughness: m.roughness != null ? m.roughness : 0.38,
              metalness: 0, side: THREE.DoubleSide });
            o.__skin = true;
          } else {
            m.envMapIntensity = 1.1;
          }
        });

        /* ── окраска обшивки давлением ─────────────────────────
           У каждого меша обшивки — доля хорды, сторона и строка таблицы Cp
           в атрибутах вершин; таблица — текстура, общая на режим. */
        var skinMats = [];
        meshes.forEach(function (o) {
          if (!o.__skin) return;
          var m = o.material, n = o.geometry.attributes.position.count;
          ['aS', 'aS0', 'aUp', 'aRow', 'aRowC'].forEach(function (a) { o.geometry.setAttribute(a, new THREE.BufferAttribute(new Float32Array(n), 1)); });
          var w = new Float32Array(n); w.fill(-1);
          o.geometry.setAttribute('aW', new THREE.BufferAttribute(w, 1));
          m.userData.uni = { uCp: { value: null }, uMix: { value: 1 }, uRows: { value: 2 } };
          m.onBeforeCompile = function (sh) {
            Object.keys(m.userData.uni).forEach(function (k) { sh.uniforms[k] = m.userData.uni[k]; });
            sh.vertexShader = 'attribute float aS; attribute float aS0; attribute float aUp; attribute float aRow; attribute float aRowC; attribute float aW;\n' +
              'varying float vS; varying float vS0; varying float vUp; varying float vRow; varying float vRowC; varying float vW;\n' +
              sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vS = aS; vS0 = aS0; vUp = aUp; vRow = aRow; vRowC = aRowC; vW = aW;');
            sh.fragmentShader = 'uniform sampler2D uCp; uniform float uMix; uniform float uRows;\n' +
              'varying float vS; varying float vS0; varying float vUp; varying float vRow; varying float vRowC; varying float vW;\n' + GLSL_CMAP +
              sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' +
                ' if (vW >= 0. && uMix > 0.) { float side = vUp > .5 ? 0. : 1.;' +
                '   float cpA = texture2D(uCp, vec2(vS, (floor(vRow + .5) + side + .5) / uRows)).r;' +
                '   float cpC = texture2D(uCp, vec2(vS0, (floor(vRowC + .5) + side + .5) / uRows)).r;' +
                '   float cp = mix(cpC, cpA, vW) * 3. - 2.;' +
                '   float k = uMix * smoothstep(.0, .25, abs(cp));' +
                /* шкала задана в sRGB, освещение считается в линейном */
                '   diffuseColor.rgb = mix(diffuseColor.rgb, pow(cpmap(cp), vec3(2.2)), k); }');
          };
          m.customProgramCacheKey = function () { return 'l3skin'; };
          m.needsUpdate = true;
          skinMats.push(m);
        });

        /* ── слои над моделью ── */
        var CPN = 128;
        var pressOn = true, flowOn = opts.flowOn !== false, sliceOn = !LITE, secOnly = false;
        var tools = document.createElement('div');
        tools.className = 'l3-tools';
        tools.innerHTML =
          '<button type="button" class="l3-t is-on" data-t="flow">Поток</button>' +
          '<button type="button" class="l3-t is-on" data-t="press">Давление</button>' +
          '<button type="button" class="l3-t' + (sliceOn ? ' is-on' : '') + '" data-t="slice">Срез</button>' +
          '<button type="button" class="l3-t" data-t="skin">Внутрь</button>' +
          '<label class="l3-spd" hidden><span>Скорость</span><input type="range" min="60" max="150" step="5" value="110" aria-label="Приборная скорость, узлы"><b></b></label>';
        box.appendChild(tools);
        var spdLabel = tools.querySelector('.l3-spd'), spd = spdLabel.querySelector('input');
        var legend = document.createElement('div');
        legend.className = 'l3-legend';
        legend.innerHTML = '<i></i><span>разрежение</span><span>давление</span>';
        box.appendChild(legend);
        var gLeg = null;
        if (opts.legend) {
          gLeg = document.createElement('div');
          gLeg.className = 'l3-glegend';
          gLeg.innerHTML = opts.legend.map(function (l) { return '<span><i style="background:' + l.c + '"></i>' + l.t + '</span>'; }).join('');
          box.appendChild(gLeg);
        }

        var L = null;      /* текущий режим: поверхность, рули, поток */
        var M = MODES[0], modeIdx = 0;
        var pv = new THREE.Vector3();

        /* ═══ слой обтекания одного режима ═══ */
        function makeLayer(F, M) {
          var Y = { F: F, objs: [] };
          if (!F) {
            Y.measure = function () {}; Y.refresh = function () {}; Y.tick = function () {}; Y.hud = function () { return ''; };
            Y.dispose = function () {}; Y.state = function () { return {}; }; Y.alpha = 0; Y.lift = false;
            return Y;
          }
          var AXZ = F.axis === 'z', MULTI = !!F.drive, NE = F.cut ? 4 : 1;
          /* кромки по размаху: прямые {p, q} или ломаная {pts} */
          function edge(e, s) {
            if (e.pts) {
              var ss = e.pts.map(function (r) { return r[0]; });
              var r = interp(ss, e.pts.map(function (q) { return [q[1], q[2]]; }), s);
              return r;
            }
            return [e.p[0] + e.p[1] * s, e.q[0] + e.q[1] * s];
          }
          function frameAt(s) {
            var a = edge(F.le, s), b = edge(F.te, s);
            var ep = b[0] - a[0], eq = b[1] - a[1], c = Math.sqrt(ep * ep + eq * eq);
            return { lp: a[0], lq: a[1], c: c, ep: ep / c, eq: eq / c, np: -eq / c, nq: ep / c };
          }
          /* точка сечения (X — доля хорды, Y — по нормали) → мировые координаты Three */
          function secToWorld(side, s, X, Yn, out) {
            var f = frameAt(s);
            var p = f.lp + f.c * (X * f.ep + Yn * f.np), q = f.lq + f.c * (X * f.eq + Yn * f.nq);
            if (AXZ) out.set(q, s, -p); else out.set(side * s, q, -p);
            return out;
          }
          /* мировая точка Three → сторона, размах, доли хорды */
          function worldToSec(v) {
            var bx = v.x, by = -v.z, bz = v.y, side, s, p, q;
            if (AXZ) { side = 1; s = bz; p = by; q = bx; } else { side = bx >= 0 ? 1 : -1; s = Math.abs(bx); p = by; q = bz; }
            var f = frameAt(s), dp = p - f.lp, dq = q - f.lq;
            return { side: side, s: s, X: (dp * f.ep + dq * f.eq) / f.c, Y: (dp * f.np + dq * f.nq) / f.c };
          }
          Y.secToWorld = secToWorld; Y.frameAt = frameAt;

          /* ── рули и зоны по размаху ──
             Зона — участок размаха с одним набором рулей (у триммера: руль
             высоты с вкладкой и руль без неё). Вне зон — чистый профиль. */
          var foil = solver.foil(F.foilPts, LITE ? 44 : 60, 1);
          var controls = F.controls.map(function (c, i) { return { def: c, i: i, key: c.key }; });
          var zones = [], cuts = [];
          controls.forEach(function (c) { cuts.push(c.def.span[0], c.def.span[1]); });
          cuts = cuts.sort(function (a, b) { return a - b; }).filter(function (v, i, a) { return !i || v - a[i - 1] > 0.01; });
          for (var zi = 0; zi + 1 < cuts.length; zi++) {
            var a = cuts[zi], b = cuts[zi + 1], mid = (a + b) / 2;
            var act2 = controls.filter(function (c) { return mid > c.def.span[0] && mid < c.def.span[1]; });
            if (act2.length) zones.push({ a: a, b: b, ctl: act2, scale: 1 + Math.max.apply(null, act2.map(function (c) { return c.def.aft || 0; })) });
          }
          var NZ = zones.length;
          var sides = F.sides.map(function (sg, si) {
            return { sign: sg, i: si, s: AXZ ? 'C' : (sg > 0 ? 'L' : 'R'), d: {}, rel: {}, nom: {}, ze: [], zG: [] };
          });
          var NS = sides.length;
          function zoneAt(s) {
            for (var i = 0; i < NZ; i++) if (s >= zones[i].a - 1e-3 && s <= zones[i].b + 1e-3) return i;
            return -1;
          }
          /* главное сечение — заданное в описании или середина зоны с наибольшим числом рулей */
          var MAINZ = 0;
          zones.forEach(function (z, i) { if (z.ctl.length > zones[MAINZ].ctl.length || (z.ctl.length === zones[MAINZ].ctl.length && z.b - z.a > zones[MAINZ].b - zones[MAINZ].a)) MAINZ = i; });
          var SLICE_S = F.slice != null ? F.slice : M.slice != null ? M.slice : NZ ? (zones[MAINZ].a + zones[MAINZ].b) / 2 : 0;
          if (F.slice != null && zoneAt(SLICE_S) >= 0) MAINZ = zoneAt(SLICE_S);
          Y.SLICE_S = SLICE_S; Y.sides = sides; Y.zones = zones; Y.controls = controls;


          /* ── обшивка: доли хорды и строки таблицы Cp у каждой вершины ── */
          var NROW = 2 * NE * (NS * NZ + 1), CLEANROW = 2 * NE * NS * NZ;
          function rowOf(si, zi, el) { return 2 * ((si * NZ + zi) * NE + el); }
          var tagNames = {}, elOf = (F.skin && F.skin.el) || {};
          Y.tagNames = tagNames;
          (F.skin.fixed || []).forEach(function (n) { tagNames[n] = 1; });
          controls.forEach(function (c) { Object.keys(c.def.surf).forEach(function (k) { [].concat(c.def.surf[k]).forEach(function (n) { tagNames[n] = 1; }); }); });
          var tmpV = new THREE.Vector3();
          var cpData = new Uint8Array(CPN * NROW * 4);
          var cpTex = new THREE.DataTexture(cpData, CPN, NROW, THREE.RGBAFormat);
          cpTex.magFilter = cpTex.minFilter = THREE.LinearFilter;
          cpTex.needsUpdate = true;
          meshes.forEach(function (o) {
            if (!o.__skin) return;
            var g = o.geometry, wA = g.attributes.aW;
            o.material.userData.uni.uCp.value = cpTex;
            o.material.userData.uni.uRows.value = NROW;
            if (!tagNames[o.__nm]) { wA.array.fill(-1); wA.needsUpdate = true; return; }
            var pos = g.attributes.position, n = pos.count, el = Math.min(NE - 1, elOf[o.__nm] || 0);
            var aS = g.attributes.aS.array, aS0 = g.attributes.aS0.array, aUp = g.attributes.aUp.array, aRow = g.attributes.aRow.array, aRowC = g.attributes.aRowC.array, aW = wA.array;
            for (var i = 0; i < n; i++) {
              tmpV.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
              var r = worldToSec(tmpV), si = Math.max(0, F.sides.indexOf(r.side));
              var zi = zoneAt(r.s), w = 1;
              if (zi < 0) {
                /* вне рулей: по ближайшей зоне, с плавным переходом к чистому профилю */
                var best = 1e9;
                zones.forEach(function (z, k) { var d = r.s < z.a ? z.a - r.s : r.s - z.b; if (d < best) { best = d; zi = k; } });
                w = zi < 0 ? 0 : 1 - Math.min(1, best / 0.3);
                w = w * w * (3 - 2 * w);
              }
              var sc = zi >= 0 ? zones[zi].scale : 1;
              aS[i] = clamp(r.X / sc, 0, 1);
              aS0[i] = clamp(r.X, 0, 1);
              aUp[i] = r.Y > foil.camber(clamp(r.X / sc, 0, 1)) * sc ? 1 : 0;
              aRow[i] = zi >= 0 ? rowOf(si, zi, el) : CLEANROW + 2 * el;
              aRowC[i] = CLEANROW + 2 * el;
              /* вершины далеко от профиля (законцовка, обтекатели) не красим */
              aW[i] = (r.X < -0.08 || r.X > sc + 0.08 || Math.abs(r.Y) > 0.35) ? -1 : w;
            }
            ['aS', 'aS0', 'aUp', 'aRow', 'aRowC', 'aW'].forEach(function (k) { g.attributes[k].needsUpdate = true; });
          });
          function writeRows(row, tbl) {
            [tbl.up, tbl.lo].forEach(function (arr, k) {
              for (var i = 0; i < CPN; i++) {
                var o = ((row + k) * CPN + i) * 4;
                cpData[o] = Math.round(clamp((arr[i] + 2) / 3, 0, 1) * 255);
                cpData[o + 3] = 255;
              }
            });
            cpTex.needsUpdate = true;
          }

          /* ── углы рулей ──
             У А320 — по таблице drive, снятой в Blender. У DA 40 — прямо из позы
             модели: плюс — задняя кромка уходит против нормали профиля (вниз у
             крыла и стабилизатора, вправо у киля); знак — по самой задней
             вершине руля на краю хода (низ габарита не годится — у руля вверх
             вниз уходит носок). */
          var probes = [];
          if (!MULTI) sides.forEach(function (sd) {
            controls.forEach(function (c) {
              var node = root.getObjectByName(c.def.nodes[String(sd.sign)]);
              var surf = meshes.filter(function (o) { return o.__nm === c.def.surf[String(sd.sign)]; })[0];
              if (!node || !surf) return;
              /* задняя кромка — посередине размаха руля: у корня закрылка кромки крыла
                 продлены по прямой, и «самой задней» там оказывался носок */
              var pos = surf.geometry.attributes.position, best = -Infinity, v = new THREE.Vector3(), te = null;
              var sm = (c.def.span[0] + c.def.span[1]) / 2, sw = Math.max(0.05, (c.def.span[1] - c.def.span[0]) * 0.15);
              /* у простой пластины (вкладка триммера) вершин посередине нет — тогда по всей стороне */
              for (var pass = 0; pass < 2 && !te; pass++) {
                for (var i = 0; i < pos.count; i++) {
                  v.fromBufferAttribute(pos, i).applyMatrix4(surf.matrixWorld);
                  var r = worldToSec(v);
                  if (r.side === sd.sign && (pass || Math.abs(r.s - sm) < sw) && r.X > best) { best = r.X; te = new THREE.Vector3().fromBufferAttribute(pos, i); }
                }
              }
              if (te) probes.push({ sd: sd, c: c, node: node, surf: surf, te: te });
            });
          });
          function teY(p) { return worldToSec(p.te.clone().applyMatrix4(p.surf.matrixWorld)).Y; }
          /* поворот относительно нейтрали; q и −q — один поворот, берём w ≥ 0, тогда угол в [0, π] */
          function relQ(p) {
            var q = p.node.getWorldQuaternion(new THREE.Quaternion()).multiply(p.q0.clone().invert());
            if (q.w < 0) { q.x = -q.x; q.y = -q.y; q.z = -q.z; q.w = -q.w; }
            return q;
          }
          if (probes.length) {
            probes.forEach(function (p) { p.q0 = p.node.getWorldQuaternion(new THREE.Quaternion()); p.y0 = teY(p); });
            pose(1);
            probes.forEach(function (p) {
              var q = relQ(p);
              p.still = 2 * Math.acos(clamp(q.w, -1, 1)) < 0.05 * DEG;
              p.ax = new THREE.Vector3(q.x, q.y, q.z).normalize();
              p.dsign = teY(p) < p.y0 ? 1 : -1;
            });
            pose(0);
          }
          /* знак по типу звена: в таблице плюс — по часовой (кромка вниз);
             у предкрылка плюс — носок вниз, у спойлера — вверх */
          var SG = { hinge: 1, flap: 1, rot: 1, slat: -1, spoiler: -1 };
          Y.measure = function (val) {
            if (MULTI) {
              sides.forEach(function (sd) {
                controls.forEach(function (c) {
                  var t = F.drive[c.key][String(sd.sign)], r = interp(F.drive.v, t, val);
                  sd.d[c.key] = r;
                  sd.rel[c.key] = r[0] * (SG[c.def.type] || 1);
                  var nt = F.nominal && F.nominal[c.key] && F.nominal[c.key][String(sd.sign)];
                  sd.nom[c.key] = nt ? interp(F.drive.v, nt, val) : sd.rel[c.key];
                });
              });
              return;
            }
            probes.forEach(function (p) {
              if (p.still) { p.sd.d[p.c.key] = 0; return; }
              var q = relQ(p);
              var ang = 2 * Math.acos(clamp(q.w, -1, 1));
              var s = Math.sign(q.x * p.ax.x + q.y * p.ax.y + q.z * p.ax.z) || 1;
              p.sd.d[p.c.key] = ang / DEG * s * p.dsign;
            });
            /* угол руля на руле — относительно несущего (вкладка триммера) */
            sides.forEach(function (sd) {
              controls.forEach(function (c) {
                sd.rel[c.key] = (sd.d[c.key] || 0) - (c.def.parent ? (sd.d[c.def.parent] || 0) : 0);
                sd.nom[c.key] = sd.rel[c.key];
              });
            });
          };

          /* ── обтекание: решение и сетка поля для каждого набора углов ──
             Сетка считается кусками по ~7 мс за кадр, готовые хранятся. */
          var GR = LITE ? { nx: 110, ny: 56 } : { nx: 168, ny: 84 };
          GR.x0 = -0.6; GR.x1 = 1.9; GR.y0 = -0.62; GR.y1 = 0.62;
          var cache = {}, cacheKeys = [], job = null;
          var lift = F.alpha === 'lift', mass = F.mass || 1310, area = F.area || 13.54;
          var spdR = F.speed || [60, 150, M.speed || 110];
          var kts = M.speed || spdR[2], alpha = 0, clLin = null;
          /* какой Cy нужен на скорости v, чтобы держать самолёт */
          function clNeeded(kt) { var v = kt * 0.5144; return 2 * mass * 9.81 / (1.225 * v * v * area); }
          function alphaFor(kt) {
            if (!clLin) {
              var a = solveAt({}, [], -6), b = solveAt({}, [], 2);
              clLin = { k: (b.cl - a.cl) / 8, c0: a.cl + 6 * (b.cl - a.cl) / 8 };
            }
            return clamp((clNeeded(kt) - clLin.c0) / clLin.k, -9, 7);
          }
          function solveAt(st, hinges, al, cut, scale) {
            if (MULTI) return solver.solveSection({ foil: foil, cut: cut || {}, st: st, alpha: al, N: LITE ? 0.8 : 1 });
            return solver.solve({ foil: foil, hinges: hinges, scale: scale || 1, alpha: al });
          }
          if (F.alpha === 'fixed') alpha = F.alphaDeg || 0;
          else if (lift) alpha = Math.round(alphaFor(kts) * 2) / 2;
          else { var f0 = frameAt(SLICE_S); alpha = Math.round(Math.atan2(-f0.eq, f0.ep) / DEG * 2) / 2; }
          function round(v, q) { return Math.round(v / q) * q; }
          /* положение сечения для решателя: из рулей зоны */
          function zoneState(sd, z) {
            if (!MULTI) return { hinges: z.ctl.map(function (c) { return { xh: c.def.xh, delta: Math.round(sd.rel[c.key] || 0) }; }), scale: z.scale };
            var st = { hinges: [] }, cut = {};
            z.ctl.forEach(function (c) {
              var r = sd.d[c.key] || [0, 0, 0], t = c.def.type, d = round(r[0], 0.5);
              if (t === 'hinge') {
                if (Math.abs(d) > 0.2) st.hinges.push({ xh: c.def.xh, delta: d });
                /* простой закрылок на больших углах: срыв за изломом */
                if (c.def.sep && d > solver.SEP.d0) st.sep = { x0: c.def.sep.x0, deg: d };
              }
              else if (t === 'split') { cut.split = F.cut.split; if (d > 0.4) st.split = d; }
              else if (t === 'slat') { cut.slat = F.cut.slat; if (Math.abs(d) > 0.2) st.slat = { deg: -d, piv: c.def.piv, dx: round(r[1], 0.001), dy: round(r[2], 0.001) }; }
              else if (t === 'flap') { cut.flap = F.cut.flap; if (Math.abs(d) > 0.2) st.flap = { deg: d, piv: c.def.piv, dx: round(r[1], 0.001), dy: round(r[2], 0.001) }; }
              else if (t === 'spoiler') { cut.spoiler = F.cut.spoiler; if (-d > 0.4) st.spoiler = -d; }
              else if (t === 'rot') { if (Math.abs(d) > 0.2) st.rot = { piv: c.def.piv, deg: d }; }
            });
            return { st: st, cut: cut };
          }
          function keyOf(zs) { return alpha.toFixed(1) + '|' + JSON.stringify(zs); }
          function entry(zs) {
            var k = keyOf(zs);
            if (cache[k]) return cache[k];
            var sol, tbls, e;
            if (MULTI) {
              sol = solveAt(zs.st, null, alpha, zs.cut);
              tbls = solver.cpTables(sol, CPN, NE);
              e = { sol: sol, tbls: tbls, isIn: sol.isIn, inCav: sol.inCavity, x1: sol.bounds()[1] + 0.05, scale: 1 };
            } else {
              sol = solveAt(null, zs.hinges, alpha, null, zs.scale);
              e = { sol: sol, tbls: [solver.cpTable(sol, CPN)], isIn: function (x, y) { return solver.inside(sol.pts, x, y); }, inCav: null, x1: sol.scale + 0.05, scale: zs.scale };
            }
            e.k = k; e.G = null;
            cache[k] = e;
            cacheKeys.push(k);
            if (cacheKeys.length > 64) { var old = cacheKeys.shift(); if (cache[old] !== e) delete cache[old]; }
            return e;
          }
          function startGrid(e) {
            if (e.G || (job && job.e === e)) return;
            var n = GR.nx * GR.ny;
            job = { e: e, j: 0, G: { u: new Float32Array(n), v: new Float32Array(n), m: new Uint8Array(n), nx: GR.nx, ny: GR.ny, x0: GR.x0, x1: GR.x1, y0: GR.y0, y1: GR.y1 } };
          }
          var fo = [0, 0];
          function workGrid(budget) {
            if (!job) return;
            var t = performance.now(), G = job.G, e = job.e, s = e.sol;
            while (job.j < G.ny && performance.now() - t < budget) {
              var j = job.j++, y = G.y0 + (G.y1 - G.y0) * j / (G.ny - 1);
              for (var i = 0; i < G.nx; i++) {
                var x = G.x0 + (G.x1 - G.x0) * i / (G.nx - 1), k = j * G.nx + i;
                if (x > -0.12 && x < e.x1 && y > -0.3 && y < 0.36) {
                  /* застойная зона за спойлером — отдельная метка: там свои частицы */
                  if (e.inCav && e.inCav(x, y)) { G.m[k] = 2; continue; }
                  if (e.isIn(x, y)) { G.m[k] = 1; continue; }
                }
                s.field(x, y, fo);
                var sp = Math.sqrt(fo[0] * fo[0] + fo[1] * fo[1]), lim = sp > 2.6 ? 2.6 / sp : 1;
                G.u[k] = fo[0] * lim; G.v[k] = fo[1] * lim;
              }
            }
            if (job.j >= G.ny) { job.e.G = G; job = null; onGrid(); }
          }
          var clean = null, cleanG = null;
          var needZ = {}, needClean = false;
          function wanted() {
            var out = [];
            sides.forEach(function (sd) { sd.ze.forEach(function (e, zi) { if (needZ[zi] && !e.G) out.push(e); }); });
            if (needClean && clean && !clean.G) out.push(clean);
            return out;
          }
          /* Пока руль тянут, решение нужно сразу только главному сечению (сводка,
             стрелки, срез); остальные зоны досчитываются в следующих кадрах по
             нескольку миллисекунд — на слабом телефоне ползунок не замирает. */
          var pend = [];
          function applyZone(sd, si, zi, e) {
            sd.ze[zi] = e;
            for (var el2 = 0; el2 < NE; el2++) writeRows(rowOf(si, zi, el2), e.tbls[Math.min(el2, e.tbls.length - 1)]);
          }
          function kick() {
            var w = wanted();
            if (w.length && (!job || w.indexOf(job.e) < 0)) { job = null; startGrid(w[0]); }
            syncGrids();
          }
          Y.refresh = function () {
            clean = entry(MULTI ? { st: {}, cut: {} } : { hinges: [], scale: 1 });
            for (var el = 0; el < NE; el++) writeRows(CLEANROW + 2 * el, clean.tbls[Math.min(el, clean.tbls.length - 1)]);
            pend = [];
            sides.forEach(function (sd, si) {
              for (var zi = 0; zi < NZ; zi++) {
                var zs = zoneState(sd, zones[zi]);
                if (zi === MAINZ || cache[keyOf(zs)]) applyZone(sd, si, zi, entry(zs));
                else pend.push([sd, si, zi, zs]);
              }
            });
            kick();
            updateArrows();
          };
          function syncGrids() {
            sides.forEach(function (sd) { sd.ze.forEach(function (e, zi) { if (e.G) sd.zG[zi] = e.G; }); });
            if (clean && clean.G) cleanG = clean.G;
          }
          function onGrid() {
            var w = wanted();
            if (w.length) startGrid(w[0]);
            syncGrids();
            updateSlices();
          }

          /* ── струйки: частицы с хвостом в сечениях по размаху ── */
          var TRAIL = LITE ? 12 : 18;
          var STATIONS = (F.stations || []).filter(function (s) { return Math.abs(s - SLICE_S) > 0.4; }).concat([SLICE_S]);
          var PER = LITE ? 46 : 92, CAVN = LITE ? 26 : 48;
          var parts = [];
          sides.forEach(function (sd) {
            STATIONS.forEach(function (s) {
              var zi = zoneAt(s), main = s === SLICE_S;
              if (zi >= 0) needZ[zi] = true; else needClean = true;
              for (var i = 0; i < PER * (main ? 2 : 1); i++) parts.push({ sd: sd, s: s, zi: zi, main: main, x: 0, y: 0, h: [], age: 0, life: 0 });
              /* частицы застойной зоны: живут, только пока поднят спойлер */
              if (MULTI && F.cut && F.cut.spoiler && zi >= 0) for (var c2 = 0; c2 < CAVN * (main ? 1 : 0.5); c2++) parts.push({ sd: sd, s: s, zi: zi, main: main, cav: true, x: 0, y: 0, h: [], age: 0, life: 0 });
            });
          });
          needZ[MAINZ] = NZ > 0;
          var NP = parts.length, NV = Math.max(2, NP * (TRAIL - 1) * 2);
          var lpos = new Float32Array(NV * 3), lcol = new Float32Array(NV * 3), lalp = new Float32Array(NV);
          var lgeo = new THREE.BufferGeometry();
          lgeo.setAttribute('position', new THREE.BufferAttribute(lpos, 3).setUsage(THREE.DynamicDrawUsage));
          lgeo.setAttribute('aCol', new THREE.BufferAttribute(lcol, 3).setUsage(THREE.DynamicDrawUsage));
          lgeo.setAttribute('aAlpha', new THREE.BufferAttribute(lalp, 1).setUsage(THREE.DynamicDrawUsage));
          var lmat = new THREE.ShaderMaterial({
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
            vertexShader: 'attribute vec3 aCol; attribute float aAlpha; varying vec3 vC; varying float vA;' +
              'void main(){ vC=aCol; vA=aAlpha; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
            fragmentShader: 'varying vec3 vC; varying float vA; void main(){ gl_FragColor=vec4(vC*vA, vA); }'
          });
          var lines = new THREE.LineSegments(lgeo, lmat);
          lines.frustumCulled = false;
          lines.renderOrder = 5;
          scene.add(lines);
          Y.objs.push(lines);
          function rnd() { return Math.random(); }
          function spawn(p) {
            var u = rnd() * 2 - 1;
            p.x = GR.x0 + 0.02 + rnd() * 0.05;
            p.y = 0.03 + Math.sign(u) * Math.pow(Math.abs(u), 1.35) * 0.42;
            p.h.length = 0;
            p.age = 0;
            p.life = 2.2 + rnd() * 1.6;
          }
          /* в застойной зоне: случайная точка внутри неё */
          function spawnCav(p, e) {
            p.h.length = 0; p.age = 0; p.life = 0.8 + rnd() * 1.2;
            var cv = e && e.sol.cavity;
            if (!cv) { p.x = -9; return; }
            var x0 = 9, x1 = -9, y0 = 9, y1 = -9;
            cv.forEach(function (q) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); });
            for (var t = 0; t < 12; t++) {
              var x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0);
              if (e.inCav(x, y)) { p.x = x; p.y = y; p.cx = (x0 + x1) / 2; p.cy = (y0 + y1) / 2; p.rx = (x1 - x0) / 2; p.ry = (y1 - y0) / 2; return; }
            }
            p.x = -9;
          }
          parts.forEach(function (p) { if (!p.cav) { spawn(p); p.x = GR.x0 + rnd() * (GR.x1 - GR.x0) * 0.95; p.age = rnd() * p.life; } else p.x = -9; });
          var sv = [0, 0], sv2 = [0, 0];
          var SPEED = 0.62;   /* хорды в секунду при скорости набегающего потока */
          var CAVC = [1.0, 0.62, 0.38];
          Y.tick = function (dt) {
            if (pend.length) {
              var t0p = performance.now();
              while (pend.length && performance.now() - t0p < (LITE ? 4 : 8)) { var pz = pend.shift(); applyZone(pz[0], pz[1], pz[2], entry(pz[3])); }
              if (!pend.length) kick();
            } else workGrid(LITE ? 5 : 7);
            if (!flowOn) return;
            var vi = 0;
            for (var n = 0; n < NP; n++) {
              var p = parts[n], G = p.zi >= 0 ? p.sd.zG[p.zi] : cleanG;
              if (!G || (secOnly && !(p.main && p.sd.i === 0))) continue;
              var c, al;
              p.age += dt;
              if (p.cav) {
                /* вихрь в застойной зоне: по кругу против потока у стенки и по потоку у границы */
                var e = p.sd.ze[p.zi];
                if (!e || !e.sol.cavity) { p.x = -9; continue; }
                if (p.x < -5 || p.age > p.life) { spawnCav(p, e); if (p.x < -5) continue; }
                var dx = (p.x - p.cx) / (p.rx || 1), dy = (p.y - p.cy) / (p.ry || 1);
                var nx = p.x + (dy * 0.55 * p.rx + (rnd() - 0.5) * 0.12) * dt * 1.6, ny = p.y + (-dx * 0.55 * p.ry + (rnd() - 0.5) * 0.12) * dt * 1.6;
                if (!e.inCav(nx, ny)) { spawnCav(p, e); continue; }
                p.x = nx; p.y = ny; p.sp = 0.5;
              } else {
                var a = solver.sample(G, p.x, p.y, sv);
                if (a) {
                  var mx = p.x + sv[0] * SPEED * dt * 0.5, my = p.y + sv[1] * SPEED * dt * 0.5;
                  var b = solver.sample(G, mx, my, sv2) || sv;
                  p.x += b[0] * SPEED * dt; p.y += b[1] * SPEED * dt;
                  p.sp = Math.sqrt(b[0] * b[0] + b[1] * b[1]);
                }
                if (!a || p.age > p.life || p.x > GR.x1 - 0.02) { spawn(p); continue; }
              }
              p.h.unshift(p.x, p.y, p.sp || 1);
              if (p.h.length > TRAIL * 3) p.h.length = TRAIL * 3;
              var fade = Math.min(1, p.age / 0.35) * Math.min(1, (p.life - p.age) / 0.5);
              var Ln = Math.min(p.h.length / 3, p.cav ? 8 : TRAIL);
              for (var k = 0; k < Ln - 1; k++) {
                var x1 = p.h[k * 3], y1 = p.h[k * 3 + 1], s1 = p.h[k * 3 + 2], x2 = p.h[k * 3 + 3], y2 = p.h[k * 3 + 4];
                secToWorld(p.sd.sign, p.s, x1, y1, pv);
                lpos[vi * 3] = pv.x; lpos[vi * 3 + 1] = pv.y; lpos[vi * 3 + 2] = pv.z;
                c = p.cav ? CAVC : cpColor(1 - s1 * s1);
                al = (1 - k / (TRAIL - 1)) * fade * (p.cav ? 0.75 : p.zi >= 0 ? 0.95 : 0.55);
                lcol[vi * 3] = c[0]; lcol[vi * 3 + 1] = c[1]; lcol[vi * 3 + 2] = c[2]; lalp[vi] = al;
                vi++;
                secToWorld(p.sd.sign, p.s, x2, y2, pv);
                lpos[vi * 3] = pv.x; lpos[vi * 3 + 1] = pv.y; lpos[vi * 3 + 2] = pv.z;
                lcol[vi * 3] = c[0]; lcol[vi * 3 + 1] = c[1]; lcol[vi * 3 + 2] = c[2]; lalp[vi] = al * 0.85;
                vi++;
              }
            }
            lgeo.setDrawRange(0, vi);
            lgeo.attributes.position.needsUpdate = true;
            lgeo.attributes.aCol.needsUpdate = true;
            lgeo.attributes.aAlpha.needsUpdate = true;
          };

          /* ── срез: поле давления в плоскости главного сечения ── */
          var slices = sides.map(function (sd) {
            var data = new Uint8Array(GR.nx * GR.ny * 4);
            var tex = new THREE.DataTexture(data, GR.nx, GR.ny, THREE.RGBAFormat);
            tex.magFilter = tex.minFilter = THREE.LinearFilter;
            var g = new THREE.BufferGeometry(), P = [], UV = [];
            [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]].forEach(function (c) {
              secToWorld(sd.sign, SLICE_S, GR.x0 + (GR.x1 - GR.x0) * c[0], GR.y0 + (GR.y1 - GR.y0) * c[1], pv);
              P.push(pv.x, pv.y, pv.z); UV.push(c[0], c[1]);
            });
            g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
            g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
            var m = new THREE.ShaderMaterial({
              transparent: true, depthWrite: false, side: THREE.DoubleSide,
              uniforms: { uT: { value: tex }, uO: { value: 0.82 } },
              vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
              fragmentShader: 'uniform sampler2D uT; uniform float uO; varying vec2 vUv;\n' + GLSL_CMAP +
                'void main(){ vec4 t=texture2D(uT,vUv); float cp=t.r*3.-2.;' +
                ' float iso=abs(fract(cp*5.+.5)-.5); float line=(1.-smoothstep(.0,.06,iso))*step(.5,t.g);' +
                ' vec2 e=min(vUv,1.-vUv); float edge=smoothstep(0.,.12,e.x)*smoothstep(0.,.18,e.y);' +
                ' float k=smoothstep(.0,.35,abs(cp));' +
                /* застойная зона (t.g = 0) — ровная заливка давлением зоны со штриховкой */
                ' float hatch=step(.5,fract((vUv.x*2.5+vUv.y)*60.))*(1.-step(.5,t.g));' +
                ' vec3 c=cpmap(cp); float a=(.12+.62*k)*edge*t.a*uO; a=max(a,line*.38*edge*t.a*uO); a=mix(a, .55*edge*uO*t.a, 1.-step(.5,t.g));' +
                ' gl_FragColor=vec4(mix(mix(c,vec3(1.),line*.35),vec3(.75,.55,.42),hatch*.5),a); }'
            });
            var mesh = new THREE.Mesh(g, m);
            mesh.renderOrder = 4;
            mesh.frustumCulled = false;
            scene.add(mesh);
            Y.objs.push(mesh);
            return { sd: sd, data: data, tex: tex, mesh: mesh };
          });
          function updateSlices() {
            slices.forEach(function (sl) {
              var G = sl.sd.zG[MAINZ], e = sl.sd.ze[MAINZ];
              if (!G || G === sl.G) return;
              sl.G = G;
              var base = e && e.sol.base != null ? e.sol.base : 0;
              for (var k = 0; k < G.nx * G.ny; k++) {
                var o = k * 4;
                if (G.m[k] === 1) { sl.data[o + 3] = 0; continue; }
                var cp = G.m[k] === 2 ? base : 1 - (G.u[k] * G.u[k] + G.v[k] * G.v[k]);
                sl.data[o] = Math.round(clamp((cp + 2) / 3, 0, 1) * 255);
                sl.data[o + 1] = G.m[k] === 2 ? 0 : 255;
                sl.data[o + 3] = 255;
              }
              sl.tex.needsUpdate = true;
            });
          }

          /* ── стрелки прироста силы на главном сечении ── */
          var arrows = sides.map(function () {
            var a = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 0.5, 0xffffff, 0.12, 0.08);
            a.line.material.transparent = true; a.line.material.opacity = 0.9; a.line.material.depthTest = false;
            a.cone.material.depthTest = false;
            a.renderOrder = 9;
            scene.add(a);
            Y.objs.push(a);
            return a;
          });
          function dCl(sd) { var e = sd.ze[MAINZ]; return e && clean ? e.sol.cl - clean.sol.cl : 0; }
          Y.dCl = dCl;
          var pa = new THREE.Vector3(), pb = new THREE.Vector3();
          function updateArrows() {
            sides.forEach(function (sd, i) {
              var a = arrows[i], d = dCl(sd), c = frameAt(SLICE_S).c, L2 = clamp(Math.abs(d) * 0.5, 0.001, 1.1) * c;
              secToWorld(sd.sign, SLICE_S, 0.42, d > 0 ? 0.16 : -0.08, pa);
              secToWorld(sd.sign, SLICE_S, 0.42, d > 0 ? 1.16 : -1.08, pb);
              a.position.copy(pa);
              a.setDirection(pb.sub(pa).normalize());
              a.setLength(L2, Math.min(0.14 * c, L2 * 0.4), Math.min(0.09 * c, L2 * 0.3));
              a.setColor(new THREE.Color().fromArray(cpColor(d > 0 ? 0.8 : -1.6)));
              a.visible = flowOn && Math.abs(d) > 0.02 && (!secOnly || sd.i === 0);
            });
          }
          Y.layers = function () {
            lines.visible = flowOn;
            slices.forEach(function (s) { s.mesh.visible = flowOn && sliceOn && (!secOnly || s.sd.i === 0); });
            updateArrows();
          };

          /* ── сводка над схемой ── */
          var WORDS = AXZ ? ['вправо', 'влево'] : ['вниз', 'вверх'];
          function ang(d) { var r = Math.round(d); return Math.abs(r) < 1 ? 'нейтраль' : (r > 0 ? WORDS[0] : WORDS[1]) + ' ' + Math.abs(r) + '°'; }
          function deg(d) { return Math.round(Math.abs(d)) + '°'; }
          function bySide(c) { return sides.filter(function (x) { return x.s === c; })[0]; }
          Y.hud = function () {
            var html = '', mode = F.hud, s0 = sides[0];
            if (mode === 'roll') {
              var Lw = bySide('L'), Rw = bySide('R'), m = dCl(Lw) - dCl(Rw);
              html = '<span><b>Лев. элерон</b> ' + ang(Lw.nom.ail) + ' · ΔCy ' + signed(dCl(Lw)) + '</span>' +
                '<span><b>Прав. элерон</b> ' + ang(Rw.nom.ail) + ' · ΔCy ' + signed(dCl(Rw)) + '</span>' +
                '<span class="l3-roll">' + (Math.abs(m) < 0.03 ? 'крена нет' : m > 0 ? 'крен вправо' : 'крен влево') + '</span>';
            } else if (mode === 'roll320') {
              var L3 = bySide('L'), R3 = bySide('R'), m3 = dCl(L3) - dCl(R3);
              function wing(sd, t) {
                var sp = sd.nom.spl || 0;
                return '<span><b>' + t + '</b> элерон ' + ang(sd.nom.ail) + (sp > 0.5 ? ' · спойлеры ↑' + deg(sp) : '') + ' · ΔCy ' + signed(dCl(sd)) + '</span>';
              }
              html = wing(L3, 'Лев.') + wing(R3, 'Прав.') +
                '<span class="l3-roll">' + (Math.abs(m3) < 0.03 ? 'крена нет' : m3 > 0 ? 'крен вправо' : 'крен влево') + '</span>';
            } else if (mode === 'pitch') {
              var d = dCl(s0);
              html = '<span><b>Руль высоты</b> ' + ang(s0.nom.elev) + ' · ΔCy стабилизатора ' + signed(d) + '</span>' +
                '<span class="l3-roll">' + (Math.abs(d) < 0.03 ? 'балансировка' : d > 0 ? 'хвост вверх — нос вниз' : 'хвост вниз — нос вверх') + '</span>';
            } else if (mode === 'ths') {
              var dt = dCl(s0), th = s0.nom.ths || 0;
              html = '<span><b>Стабилизатор</b> ' + (Math.abs(th) < 0.3 ? 'нейтраль' : deg(th) + (th < 0 ? ' носком вниз' : ' носком вверх')) + ' · ΔCy ' + signed(dt) + '</span>' +
                '<span class="l3-roll">' + (Math.abs(dt) < 0.03 ? 'балансировка не меняется' : dt > 0 ? 'хвост вверх — нос вниз (на пикирование)' : 'хвост вниз — нос вверх (на кабрирование)') + '</span>';
            } else if (mode === 'yaw') {
              var dz = dCl(s0);
              html = '<span><b>Руль направления</b> ' + ang(s0.nom.rud) + ' · ΔCz киля ' + signed(dz) + '</span>' +
                '<span class="l3-roll">' + (Math.abs(dz) < 0.03 ? 'рыскания нет' : dz > 0 ? 'хвост влево — нос вправо' : 'хвост вправо — нос влево') + '</span>';
            } else if (mode === 'trim') {
              var e = s0.ze[MAINZ], ch = e ? solver.hingeMoment(e.sol, controls[0].def.xh, e.scale) : 0;
              html = '<span><b>Триммер</b> ' + ang(s0.rel.tab) + '</span>' +
                '<span>шарнирный момент руля высоты Cш ' + signed(ch, 3) + '</span>' +
                '<span class="l3-roll">' + (Math.abs(ch) < 0.004 ? 'руль не нагружен' : ch > 0 ? 'тянет руль вниз — нос вниз' : 'тянет руль вверх — нос вверх') + '</span>';
            } else if (mode === 'flaps') {
              /* скорость «с той же подъёмной силой» не пишем: сечение без вязкости
                 сильно завышает прирост, а у крыла он ещё и меньше, чем у сечения */
              var df = dCl(s0);
              html = '<span><b>Закрылки</b> ' + Math.round(Math.abs(s0.rel.flap || 0)) + '° · ΔCy сечения ' + signed(df) + '</span>' +
                '<span class="l3-roll">' + (df < 0.03 ? 'механизация убрана' : 'подъёмная сила растёт — можно лететь медленнее') + '</span>';
            } else if (mode === 'conf') {
              var dc = dCl(s0), sl = s0.nom.slat || 0, fl = s0.nom.flapo || 0;
              html = '<span><b>Предкрылки</b> ' + deg(sl) + ' · <b>закрылки</b> ' + deg(fl) + (s0.nom.ail > 0.5 ? ' · элероны ↓' + deg(s0.nom.ail) : '') + '</span>' +
                '<span>ΔCy сечения ' + signed(dc) + '</span>' +
                '<span class="l3-roll">' + (sl < 0.5 && fl < 0.5 ? 'механизация убрана' : fl < 0.5 ? 'предкрылки: выше критический угол атаки' : 'поток из-под крыла через щели обдувает верх предкрылка и закрылка — подъёмная сила растёт') + '</span>';
            } else if (mode === 'flaptypes') {
              var dft = dCl(s0), dg = s0.nom.flap || 0, ef = s0.ze[MAINZ];
              var sepd = ef && ef.sol.cavity;
              html = '<span><b>' + (F.typeName || 'Закрылок') + '</b> ' + deg(dg) + ' · ΔCy сечения ' + signed(dft) + '</span>' +
                '<span class="l3-roll">' + (dg < 0.5 ? 'убран' : sepd && F.cut && F.cut.split ? 'за щитком — застойная зона: сопротивление большое' :
                  sepd ? 'поток сорвался за изломом — прирост подъёмной силы падает' :
                  F.cut && F.cut.flap ? 'поток через щель обдувает верх закрылка и держит его без срыва' : 'растёт кривизна профиля — растёт подъёмная сила') + '</span>';
            } else if (mode === 'brake') {
              var db = dCl(s0), s24 = s0.nom.spl24 || 0, s15 = Math.max(s0.nom.spl1 || 0, s0.nom.spl5 || 0);
              html = '<span><b>Спойлеры 2–4</b> ' + (s24 < 0.5 ? 'убраны' : '↑' + deg(s24)) + (s15 > 0.5 ? ' · <b>1 и 5</b> ↑' + deg(s15) : '') + ' · ΔCy сечения ' + signed(db) + '</span>' +
                '<span class="l3-roll">' + (s24 < 0.5 ? 'спойлеры убраны' : s15 > 0.5 ? 'на пробеге все спойлеры гасят подъёмную силу и прижимают колёса' : 'воздушный тормоз: срыв за спойлером — подъёмная сила падает, сопротивление растёт') + '</span>';
            }
            return html;
          };
          Y.alpha = alpha; Y.lift = lift; Y.kts = kts; Y.spdR = spdR;
          Y.setSpeed = function (k) { kts = k; alpha = Math.round(alphaFor(kts) * 2) / 2; Y.alpha = alpha; Y.refresh(); };
          Y.state = function () { return { alpha: alpha, zones: zones.map(function (z) { return [z.a, z.b, z.scale]; }), sides: sides.map(function (s) { return { rel: s.rel, nom: s.nom }; }), hud: hud.textContent, main: MAINZ, slice: SLICE_S }; };
          Y.dispose = function () {
            Y.objs.forEach(function (o) {
              scene.remove(o);
              o.traverse(function (q) { if (q.geometry) q.geometry.dispose(); if (q.material) { if (q.material.uniforms && q.material.uniforms.uT) q.material.uniforms.uT.value.dispose(); q.material.dispose(); } });
            });
            cpTex.dispose();
            job = null;
          };
          return Y;
        }

        /* ── кнопки слоёв и скорость ── */
        var skinOpen = false;
        function setSkin(open) {
          skinOpen = open;
          meshes.forEach(function (o) {
            if (!o.__skin) return;
            o.material.transparent = open;
            o.material.opacity = open ? 0.28 : 1;
            o.material.depthWrite = !open;
            o.material.needsUpdate = true;
          });
          tools.querySelector('[data-t="skin"]').classList.toggle('is-on', open);
        }
        function applyLayers() {
          if (L && L.layers) L.layers();
          skinMats.forEach(function (m) { m.userData.uni.uMix.value = pressOn && L && L.F ? 1 : 0; });
          legend.hidden = !(L && L.F) || !(pressOn || flowOn);
          [].forEach.call(tools.querySelectorAll('.l3-t'), function (b) {
            var t = b.dataset.t;
            if (t !== 'skin') b.classList.toggle('is-on', t === 'flow' ? flowOn : t === 'press' ? pressOn : sliceOn);
          });
        }
        tools.addEventListener('click', function (e) {
          var b = e.target.closest('.l3-t');
          if (!b) return;
          var t = b.dataset.t;
          if (t === 'flow') flowOn = !flowOn;
          else if (t === 'press') pressOn = !pressOn;
          else if (t === 'slice') sliceOn = !sliceOn;
          else if (t === 'skin') setSkin(!skinOpen);
          applyLayers();
          draw();
        });
        spd.addEventListener('input', function () {
          if (!L || !L.lift) return;
          tools.querySelector('.l3-spd b').textContent = spd.value + ' уз';
          L.setSpeed(+spd.value);
          paintHud(); draw();
        });

        /* ── выноски: номер на детали, перечень под схемой ── */
        var labels = (opts.labels || []).map(function (l, i) {
          var r = new RegExp(l.m, 'i');
          return { n: i + 1, t: l.t, d: l.d || '', objs: meshes.filter(function (o) { return r.test(o.__nm); }) };
        }).filter(function (l) { return l.objs.length; });
        labels.forEach(function (l, i) { l.n = i + 1; });
        spotsEl.innerHTML = labels.map(function (l) {
          return '<button class="pl-spot" type="button" data-n="' + l.n + '" aria-label="' + l.n + '. ' + l.t + '">' + l.n + '</button>';
        }).join('');
        list.innerHTML = labels.map(function (l) {
          return '<li><button type="button" data-n="' + l.n + '"><b>' + l.n + '</b>' + l.t + '</button></li>';
        }).join('');
        var sel = null, hiMats = [], step = -1, STEPS = opts.steps || [];
        /* номер выноски в описании → номер на рисунке (ненайденные выпали) */
        var renum = {};
        (opts.labels || []).forEach(function (l, i) {
          var r = new RegExp(l.m, 'i'), k = labels.filter(function (x) { return x.t === l.t && x.objs.some(function (o) { return r.test(o.__nm); }); })[0];
          if (k) renum[i + 1] = k.n;
        });
        function paintInfo() {
          var l = labels.filter(function (x) { return x.n === sel; })[0], S = step >= 0 ? STEPS[step] : null;
          var on = S ? (S.on || []).map(function (n) { return renum[n]; }).filter(Boolean) : sel ? [sel] : [];
          info.innerHTML = S ? '<b>Шаг ' + (step + 1) + ' из ' + STEPS.length + '.</b> ' + S.t
            : l ? '<b>' + l.n + '. ' + l.t + '</b>' + (l.d ? ' — ' + l.d : '')
            : '<span class="pl-hint">' + (M.hint || opts.hint || (TOUCH ? 'Тяните рычаг или руль пальцем, двумя пальцами — поворот и приближение. Номер на детали — что это.'
              : 'Тяните рычаг или руль мышью, остальное поле — поворот камеры, колесо — приближение. Номер на детали — что это.')) + '</span>';
          [].forEach.call(frame.querySelectorAll('[data-n]'), function (el) { el.classList.toggle('is-on', on.indexOf(+el.dataset.n) >= 0); });
          hiMats.forEach(function (h) { h.o.material = h.m; });
          hiMats = [];
          labels.forEach(function (x) {
            if (on.indexOf(x.n) < 0) return;
            x.objs.forEach(function (o) {
              var m = o.material.clone();
              if (m.emissive) { m.emissive.set(0x3d7bff); m.emissiveIntensity = SCH ? 0.75 : 0.9; }
              if (SCH && m.transparent) { m.opacity = 0.55; }
              hiMats.push({ o: o, m: o.material });
              o.material = m;
            });
          });
          var sb = bar.querySelector('.l3-sgo');
          if (sb) { sb.classList.toggle('is-on', step >= 0); sb.textContent = step >= 0 ? 'Шаг ' + (step + 1) + '/' + STEPS.length : 'Пошагово'; }
          draw();
        }
        frame.addEventListener('click', function (e) {
          var t = e.target.closest('[data-n]');
          if (!t || !frame.contains(t)) return;
          step = -1;
          sel = sel === +t.dataset.n ? null : +t.dataset.n;
          paintInfo();
        });
        /* «Пошагово»: система сама едет в положение шага, детали шага светятся */
        var goTo = null;
        function setStep(k) {
          step = k;
          sel = null;
          if (k >= 0) {
            var S = STEPS[k], v = S.v;
            if (S.mark != null) (M.marks || []).forEach(function (m) { if (m.t === S.mark) v = m.v; });
            if (drv) drv.stop();
            if (v != null) goTo = clamp(v, lo, 1);
            if (S.view != null) setView(S.view);
          }
          paintInfo();
        }
        [].forEach.call(bar.querySelectorAll('[data-step]'), function (b) {
          b.addEventListener('click', function () {
            var k = step < 0 ? 0 : step + +b.dataset.step;
            setStep(k < 0 ? STEPS.length - 1 : k >= STEPS.length ? 0 : k);
          });
        });
        var sgo = bar.querySelector('.l3-sgo');
        if (sgo) sgo.addEventListener('click', function () { setStep(step >= 0 ? -1 : 0); });
        var bb3 = new THREE.Box3();
        /* Номер ставится в центр детали. Номера, которые легли бы друг на друга,
           не показываем — кроме выбранного: он важнее, ставится первым.
           Остальные доступны в перечне и подсвечиваются оттуда. */
        function placeSpots() {
          if (spotsEl.hidden) return;
          var cw = renderer.domElement.clientWidth, ch = renderer.domElement.clientHeight, gap = TOUCH ? 26 : 28, taken = [];
          var order = labels.map(function (l, i) { return i; }).sort(function (a, b) { return (labels[b].n === sel) - (labels[a].n === sel); });
          order.forEach(function (i) {
            var l = labels[i];
            bb3.makeEmpty();
            l.objs.forEach(function (o) { if (o.visible) bb3.expandByObject(o); });
            var el = spotsEl.children[i], vis = !bb3.isEmpty();
            if (vis) {
              bb3.getCenter(pv).project(cam);
              vis = pv.z < 1 && Math.abs(pv.x) < 0.94 && Math.abs(pv.y) < 0.92;
            }
            var x = (pv.x + 1) / 2 * cw, y = (1 - pv.y) / 2 * ch;
            if (vis) vis = !taken.some(function (t) { return Math.abs(t[0] - x) < gap && Math.abs(t[1] - y) < gap; });
            el.style.display = vis ? '' : 'none';
            if (vis) { taken.push([x, y]); el.style.left = x + 'px'; el.style.top = y + 'px'; }
          });
        }

        /* ── камера ── */
        var ctrl = new THREE.OrbitControls(cam, renderer.domElement);
        ctrl.enableDamping = true;
        ctrl.dampingFactor = 0.12;
        ctrl.screenSpacePanning = true;
        ctrl.rotateSpeed = 0.8;
        var all = new THREE.Box3().setFromObject(root), allR = all.getSize(new THREE.Vector3()).length() / 2;
        ctrl.minDistance = allR * 0.03; ctrl.maxDistance = allR * 5;
        var flyFrom = null, flyTo = null, flyT = 1, curView = 0;
        /* Расстояние, с которого рамка bb целиком видна по высоте и по ширине
           кадра (с полями 8 %): длинное крыло на узком экране телефона
           встаёт по ширине, а не теряется в углу. Без рамки — шар радиуса r. */
        function fitDist(bb, c, dir, r) {
          var tv = Math.tan(cam.fov * DEG / 2) * 0.92, th = tv * cam.aspect;
          if (!bb) return r / Math.min(tv, th);
          var up = Math.abs(dir.y) > 0.97 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
          var right = new THREE.Vector3().crossVectors(up, dir).normalize(), u2 = new THREE.Vector3().crossVectors(dir, right);
          var d = 0, q = new THREE.Vector3();
          for (var k = 0; k < 8; k++) {
            q.set(k & 1 ? bb.max.x : bb.min.x, k & 2 ? bb.max.y : bb.min.y, k & 4 ? bb.max.z : bb.min.z).sub(c);
            var z = q.dot(dir);
            d = Math.max(d, z + Math.abs(q.dot(right)) / th, z + Math.abs(q.dot(u2)) / tv);
          }
          return Math.max(d, r * 0.2);
        }
        /* кнопки видов: у режима свои */
        function buildCams() {
          var cams = bar.querySelector('.fig-cams');
          cams.innerHTML = views.map(function (v, i) {
            return '<button class="fig-cam" type="button" data-v="' + i + '">' + v.t + '</button>';
          }).join('');
          [].forEach.call(cams.querySelectorAll('.fig-cam'), function (b) {
            b.addEventListener('click', function () { setView(+b.dataset.v); });
          });
        }
        function setView(i, instant) {
          var v = views[i];
          curView = i;
          var fr = v.focus ? new RegExp(v.focus, 'i') : null, bb = new THREE.Box3();
          meshes.forEach(function (o) { if (!fr || fr.test(o.__nm)) bb.expandByObject(o); });
          if (bb.isEmpty()) bb.copy(all);
          var c = bb.getCenter(new THREE.Vector3()), r = bb.getSize(new THREE.Vector3()).length() / 2;
          /* «Сечение»: смотрим вдоль размаха узким углом, почти как на чертеже,
             и показываем только поток в главном сечении первой стороны */
          var F = L && L.F;
          secOnly = !!(v.sec && F && L.zones.length);
          if (secOnly) { L.secToWorld(L.sides[0].sign, L.SLICE_S, 0.62, 0, c); r = L.frameAt(L.SLICE_S).c * 1.05; }
          /* поверхность режется плоскостью среза: внешняя часть не заслоняет профиль */
          if (secOnly) {
            var nrm = F.axis === 'z' ? new THREE.Vector3(0, -1, 0) : new THREE.Vector3(-L.sides[0].sign, 0, 0);
            renderer.clippingPlanes = [new THREE.Plane(nrm, L.SLICE_S + 0.002)];
            /* у большого самолёта за сечением — фюзеляж и двигатель во весь кадр:
               оставляем только ломоть поверхности за плоскостью среза */
            if (F.drive) renderer.clippingPlanes.push(new THREE.Plane(nrm.clone().negate(), -(L.SLICE_S - 0.35)));
          } else renderer.clippingPlanes = [];
          /* там же прячем всё, кроме обшивки поверхности: обтекатели и гондолы
             в ломте только заслоняют профиль */
          var onlyR = opts.only ? new RegExp(opts.only, 'i') : null, showR = M.show ? new RegExp(M.show, 'i') : null;
          meshes.forEach(function (o) {
            var vis = !(onlyR && onlyR.test(o.__nm)) || !!(showR && showR.test(o.__nm));
            o.visible = vis && !(secOnly && F.drive && !L.tagNames[o.__nm]);
          });
          spotsEl.hidden = secOnly;
          cam.fov = v.fov || 32;
          cam.updateProjectionMatrix();
          applyLayers();
          /* направление «Сечения» у разных поверхностей своё: вдоль размаха */
          var dv = v.sec && F ? (F.axis === 'z' ? [0.06, 1, 0.0] : [L.sides[0].sign, 0.06, 0]) : v.dir;
          if (v.sec && v.dir && !(opts.modes)) dv = v.dir;
          var dir = new THREE.Vector3(dv[0], dv[1], dv[2]).normalize();
          var dist = fitDist(secOnly ? null : bb, c, dir, r) * (v.zoom || 1);
          var to = { p: c.clone().add(dir.multiplyScalar(dist)), t: c };
          if (v.skin != null) setSkin(!!v.skin);
          [].forEach.call(bar.querySelectorAll('.fig-cam'), function (b, j) { b.classList.toggle('is-on', j === i); });
          if (instant) { cam.position.copy(to.p); ctrl.target.copy(to.t); ctrl.update(); flyT = 1; return; }
          flyFrom = { p: cam.position.clone(), t: ctrl.target.clone() }; flyTo = to; flyT = 0;
        }
        buildCams();

        /* ── ход системы: ползунок, «Авто», кнопки положений, перетаскивание ── */
        var lo = 0, val = 0, rng = null, drv = null;
        function paintHud() { hud.innerHTML = L ? L.hud() : ''; }
        function setVal(x) {
          val = clamp(x, lo, 1);
          pose(val);
          L.measure(val);
          L.refresh();
          paintHud();
          var e = M.ends || ['', ''], mk = (M.marks || []).filter(function (m) { return Math.abs(m.v - val) < 0.02; })[0];
          outEl.textContent = mk ? mk.t : Math.abs(val) < 0.02 ? (M.mid || 'нейтраль')
            : half ? Math.round(val * 100) + ' %' : (val < 0 ? e[0] : e[1]) + ' · ' + Math.round(Math.abs(val) * 100) + ' %';
          [].forEach.call(marksEl.querySelectorAll('[data-m]'), function (b) { b.classList.toggle('is-on', Math.abs(+b.dataset.m - val) < 0.02); });
        }

        /* ── режим: клип, поверхность, кнопки положений, ползунок ── */
        var modeTok = 0;
        function setMode(i, first) {
          var tok = ++modeTok;
          var Mi = MODES[i];
          return loadFlow(Mi.flow).then(function (F) {
            if (dead || tok !== modeTok) return;
            if (L) { pose(0); L.dispose(); }
            M = Mi; modeIdx = i; half = !!M.half; lo = half ? 0 : -1;
            useClip(M.clip);
            pose(0);
            if (opts.only) {
              var onlyRe = new RegExp(opts.only, 'i'), showRe = M.show ? new RegExp(M.show, 'i') : null;
              meshes.forEach(function (o) { if (onlyRe.test(o.__nm)) o.visible = !!(showRe && showRe.test(o.__nm)); });
            }
            L = makeLayer(F, M);
            if (SCH) {
              var hr = M.hi ? new RegExp(M.hi, 'i') : null;
              meshes.forEach(function (o) {
                if (!o.__base) return;
                o.material = hr && hr.test(o.__nm) ? new THREE.MeshStandardMaterial({ color: M.hiColor || 0x3d7bff, roughness: 0.4, metalness: 0.1, side: THREE.DoubleSide }) : o.__base;
              });
              hiMats = [];
            }
            [].forEach.call(bar.querySelectorAll('[data-mode]'), function (b) { b.classList.toggle('is-on', +b.dataset.mode === i); });
            /* ползунок и «Авто» заменяются свежими: у старых — слушатели прежнего режима */
            var old = bar.querySelector('.fig-range'), oldA = bar.querySelector('.fig-auto');
            rng = old.cloneNode(false); old.parentNode.replaceChild(rng, old);
            var autoB = oldA.cloneNode(true); oldA.parentNode.replaceChild(autoB, oldA);
            rng.min = half ? 0 : -100; rng.value = 0;
            rng.setAttribute('aria-label', M.input || 'Ход');
            inEl.textContent = M.input || 'Ход';
            marksEl.hidden = !M.marks;
            marksEl.innerHTML = (M.marks || []).map(function (m) {
              return '<button class="fig-btn" type="button" data-m="' + (m.v != null ? m.v : 0) + '"' + (m.deg != null ? ' data-deg="' + m.deg + '"' : '') + '>' + m.t + '</button>';
            }).join('');
            /* Положения, заданные углом руля (закрылки DA 40: UP 0°, T/O 20°, LDG 42° по РЛЭ):
               клип нелинейный, поэтому долю хода под угол ищем по самой модели, делением пополам. */
            [].forEach.call(marksEl.querySelectorAll('[data-deg]'), function (b) {
              if (!L.sides || !L.sides.length || !L.controls.length) return;
              var want = +b.dataset.deg, k = L.controls[0].key, a = lo, z = 1;
              for (var it = 0; it < 22; it++) {
                var m = (a + z) / 2;
                pose(m); L.measure(m);
                if (Math.abs(L.sides[0].rel[k] || 0) < want) a = m; else z = m;
              }
              b.dataset.m = ((a + z) / 2).toFixed(4);
              (M.marks || []).forEach(function (mk) { if (mk.deg === want) mk.v = +b.dataset.m; });
            });
            [].forEach.call(marksEl.querySelectorAll('[data-m]'), function (b) {
              b.addEventListener('click', function () { drv.stop(); rng.value = Math.round(+b.dataset.m * 100); setVal(+b.dataset.m); });
            });
            pose(0); L.measure(0);
            spdLabel.hidden = !L.lift;
            legend.classList.toggle('is-low', !L.lift);
            if (L.lift) {
              spd.min = L.spdR[0]; spd.max = L.spdR[1]; spd.value = L.kts;
              tools.querySelector('.l3-spd b').textContent = L.kts + ' уз';
            }
            tools.hidden = !F;
            drv = U.driver(rng, function (x) { setVal(x / 100); }, M.period || 420, autoB);
            rng.addEventListener('input', function () { goTo = null; });
            if (!first) drv.stop();
            /* у режима свои виды: первый из них — вся система режима */
            var nv = M.views || opts.views || DEF_VIEWS;
            if (nv !== views) { views = nv; buildCams(); curView = 0; }
            if (M.views) setView(M.view || 0, first);
            else if (M.view != null && !first) setView(M.view);
            else if (secOnly || first) setView(first && M.view != null ? M.view : curView, first);
            applyLayers();
            paintInfo();
            draw();
          });
        }
        [].forEach.call(bar.querySelectorAll('[data-mode]'), function (b) {
          b.addEventListener('click', function () { if (+b.dataset.mode !== modeIdx || !L) setMode(+b.dataset.mode); });
        });

        var grabRe = new RegExp(opts.grab || '^$', 'i');
        var grabbable = meshes.filter(function (o) { return grabRe.test(o.__nm); });
        var ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), grab = null;
        function ndcOf(e) {
          var r = renderer.domElement.getBoundingClientRect();
          ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
          return r;
        }
        function screenOf(p, r) { var q = p.clone().project(cam); return [(q.x + 1) / 2 * r.width, (1 - q.y) / 2 * r.height]; }
        renderer.domElement.addEventListener('pointerdown', function (e) {
          if (e.button > 0 || !grabbable.length || !L) return;
          var r = ndcOf(e);
          ray.setFromCamera(ndc, cam);
          var hit = ray.intersectObjects(grabbable, true)[0];
          if (!hit) return;
          /* куда на экране уходит точка детали при ходе «плюс»: по ней
             и меряем движение пальца */
          var obj = hit.object, local = obj.worldToLocal(hit.point.clone());
          var v1 = clamp(val + 0.08, lo, 1), v0 = clamp(val - 0.08, lo, 1);
          pose(v1); var b1 = screenOf(obj.localToWorld(local.clone()), r);
          pose(v0); var b0 = screenOf(obj.localToWorld(local.clone()), r);
          pose(val);
          var d = [b1[0] - b0[0], b1[1] - b0[1]], len2 = d[0] * d[0] + d[1] * d[1];
          /* деталь в этом режиме не двигается — тянуть её нечем */
          if (len2 < 4) return;
          grab = { x: e.clientX, y: e.clientY, v: val, d: d, k: (v1 - v0) / len2, id: e.pointerId };
          ctrl.enabled = false;
          drv.stop();
          try { renderer.domElement.setPointerCapture(e.pointerId); } catch (err) { /* уже отпущен */ }
          renderer.domElement.classList.add('is-grab');
          e.preventDefault();
        });
        renderer.domElement.addEventListener('pointermove', function (e) {
          if (!grab || e.pointerId !== grab.id) {
            /* подсказка курсором: над рычагом и рулём — «взять» */
            if (!TOUCH && !grab && grabbable.length) {
              ndcOf(e); ray.setFromCamera(ndc, cam);
              renderer.domElement.classList.toggle('is-hand', !!ray.intersectObjects(grabbable, true)[0]);
            }
            return;
          }
          var dx = e.clientX - grab.x, dy = e.clientY - grab.y;
          var x = clamp(grab.v + (dx * grab.d[0] + dy * grab.d[1]) * grab.k, lo, 1);
          rng.value = Math.round(x * 100);
          setVal(x);
        });
        function endGrab() {
          if (!grab) return;
          grab = null; ctrl.enabled = true;
          renderer.domElement.classList.remove('is-grab');
        }
        renderer.domElement.addEventListener('pointerup', endGrab);
        renderer.domElement.addEventListener('pointercancel', endGrab);

        function draw() {
          renderer.render(scene, cam);
          placeSpots();
        }
        if (window.ResizeObserver) {
          var ro = new ResizeObserver(function () {
            var w = box.clientWidth;
            if (!w || Math.abs(w - W) < 2) return;
            W = w; H = Math.round(W * ratioFor(W));
            renderer.setSize(W, H);
            cam.aspect = W / H; cam.updateProjectionMatrix();
            draw();
          });
          ro.observe(box);
          U.onUnmount(frame, function () { ro.disconnect(); });
        }
        cam.aspect = W / H; cam.updateProjectionMatrix();
        setMode(0, true).then(function () {
          if (dead) return;
          var last = performance.now();
          U.loop(frame, function () {
            var now = performance.now();
            if (LITE && now - last < 30) return;
            var dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            tick(dt);
          });
        });
        /* для проверки без rAF (скрытая вкладка): box.__l3.tick(0.03) */
        box.__l3 = { tick: tick, setVal: function (x) { rng.value = Math.round(x * 100); drv.stop(); setVal(x); }, setView: setView,
          setMode: setMode, state: function () { return L ? L.state() : {}; } };
        function tick(dt) {
          if (drv) drv.tick();
          if (goTo != null && rng) {
            var dv = goTo - val, sp = dt * 1.4;
            var nv = Math.abs(dv) <= sp ? goTo : val + Math.sign(dv) * sp;
            if (nv === goTo) goTo = null;
            rng.value = Math.round(nv * 100);
            setVal(nv);
          }
          if (flyT < 1) {
            flyT = Math.min(1, flyT + dt / 0.7);
            var e = flyT < 0.5 ? 2 * flyT * flyT : 1 - Math.pow(-2 * flyT + 2, 2) / 2;
            cam.position.lerpVectors(flyFrom.p, flyTo.p, e);
            ctrl.target.lerpVectors(flyFrom.t, flyTo.t, e);
          }
          ctrl.update();
          if (L) L.tick(dt);
          draw();
        }
      }).catch(function (e) {
        box.innerHTML = '<div class="model3d-note">Модель не загрузилась</div>';
        console.warn('live3d:', e);
      });
    });
  });
})();
