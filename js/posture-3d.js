/* ============================================================
 *  3Dビューア（Silhouette）
 * ------------------------------------------------------------
 *  保存してある数値だけから、立体を組み立てて表示します。
 *   ・シルエット … 正面の幅 w と 側面の奥行き d から、各段を楕円とみなして積む
 *   ・骨格       … 33点の3D座標を線でつなぐ
 *  長さの単位は「頭〜くるぶし ＝ 1.0」。
 * ============================================================ */
const PostureView = (() => {
  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
  let THREE = null;

  const COL = { navy: 0x171c61, cyan: 0x2ea7e0, magenta: 0xe4007f, yellow: 0xffd902, line: 0xc9caca };
  const SEG = 28;   // 楕円1周ぶんの分割数

  const load = async () => (THREE || (THREE = await import(/* webpackIgnore: true */ THREE_URL)));

  const BONES = [
    [11, 12], [11, 23], [12, 24], [23, 24],
    [11, 13], [13, 15], [12, 14], [14, 16],
    [23, 25], [25, 27], [24, 26], [26, 28],
    [27, 29], [29, 31], [28, 30], [30, 32],
  ];

  // 断面テーブル（正面＋側面）から、楕円を積み上げたメッシュを作る
  function shellGeometry(front, side) {
    const N = Math.min(front.length, side.length);
    const pos = [], idx = [];
    for (let i = 0; i < N; i++) {
      const y = 1 - (i + 0.5) / N;
      const rw = Math.max(front[i].r, 0.002), cx = front[i].c;
      const rd = Math.max(side[i].r,  0.002), cz = side[i].c;
      for (let j = 0; j < SEG; j++) {
        const t = j / SEG * Math.PI * 2;
        pos.push(cx + rw * Math.cos(t), y, cz + rd * Math.sin(t));
      }
    }
    for (let i = 0; i < N - 1; i++) {
      for (let j = 0; j < SEG; j++) {
        const a = i * SEG + j, b = i * SEG + (j + 1) % SEG;
        const c = a + SEG,     d = b + SEG;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // 各段の輪郭リング（線）
  function ringGeometry(front, side) {
    const N = Math.min(front.length, side.length);
    const pts = [];
    for (let i = 0; i < N; i++) {
      const y = 1 - (i + 0.5) / N;
      const rw = Math.max(front[i].r, 0.002), cx = front[i].c;
      const rd = Math.max(side[i].r,  0.002), cz = side[i].c;
      for (let j = 0; j < SEG; j++) {
        const t0 = j / SEG * Math.PI * 2, t1 = (j + 1) / SEG * Math.PI * 2;
        pts.push(cx + rw * Math.cos(t0), y, cz + rd * Math.sin(t0));
        pts.push(cx + rw * Math.cos(t1), y, cz + rd * Math.sin(t1));
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }

  /* 3D骨格を、シルエットと同じ単位・同じ位置に合わせる。
   * くるぶしを足元に、肩の高さを断面テーブルの肩の段にそろえる。 */
  function fitSkeleton(world, rows, N) {
    if (!world || world.length < 33) return null;
    const p = i => ({ x: world[i].x, y: -world[i].y, z: -world[i].z });   // y上・z前 に直す
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });

    const ank = mid(p(27), p(28)), sho = mid(p(11), p(12)), hip = mid(p(23), p(24));
    const dW = sho.y - ank.y;
    if (dW <= 0) return null;

    const yAnkle = 1 - (N - 0.5) / N;
    const yShoulder = rows && rows.shoulder != null
      ? 1 - (Math.min(N - 1, Math.max(0, rows.shoulder)) + 0.5) / N
      : 0.80;
    const k = (yShoulder - yAnkle) / dW;

    return world.map((_, i) => {
      const q = p(i);
      return {
        x: (q.x - hip.x) * k,
        y: (q.y - ank.y) * k + yAnkle,
        z: (q.z - hip.z) * k,
      };
    });
  }

  function boneGeometry(pts) {
    const v = [];
    const push = (a, b) => { v.push(a.x, a.y, a.z, b.x, b.y, b.z); };
    BONES.forEach(([a, b]) => push(pts[a], pts[b]));
    const midSho = { x: (pts[11].x + pts[12].x) / 2, y: (pts[11].y + pts[12].y) / 2, z: (pts[11].z + pts[12].z) / 2 };
    const midEar = { x: (pts[7].x + pts[8].x) / 2,   y: (pts[7].y + pts[8].y) / 2,   z: (pts[7].z + pts[8].z) / 2 };
    push(midSho, midEar);
    push(midEar, pts[0]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    return g;
  }

  /* ---------------- ビューア本体 ---------------- */
  async function create(container) {
    await load();

    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(32, 1, 0.05, 40);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';

    scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa0b0, 1.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(1.2, 2.0, 1.6);
    scene.add(key);

    // 床のグリッドと、くるぶしから立てた重心線
    const grid = new THREE.GridHelper(1.6, 8, COL.line, COL.line);
    grid.material.opacity = 0.55; grid.material.transparent = true;
    scene.add(grid);

    const plumbG = new THREE.BufferGeometry().setFromPoints(
      [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1.08, 0)]);
    const plumb = new THREE.LineSegments(plumbG,
      new THREE.LineBasicMaterial({ color: COL.magenta, transparent: true, opacity: 0.55 }));
    scene.add(plumb);

    const root = new THREE.Group();   // 今回のスキャン
    const past = new THREE.Group();   // 過去のスキャン（ゴースト）
    scene.add(root); scene.add(past);

    /* ---- 視点の操作（自前の簡易オービット） ---- */
    const state = { az: 0, el: 0.12, dist: 2.5, target: new THREE.Vector3(0, 0.52, 0) };
    let want = { az: 0, el: 0.12, dist: 2.5 };
    let dirty = true, running = false;

    function place() {
      const { az, el, dist } = state;
      cam.position.set(
        state.target.x + dist * Math.cos(el) * Math.sin(az),
        state.target.y + dist * Math.sin(el),
        state.target.z + dist * Math.cos(el) * Math.cos(az));
      cam.lookAt(state.target);
    }

    function tick() {
      running = true;
      const ease = 0.16;
      let moving = false;
      for (const k of ['az', 'el', 'dist']) {
        const d = want[k] - state[k];
        if (Math.abs(d) > 1e-4) { state[k] += d * ease; moving = true; }
        else state[k] = want[k];
      }
      if (moving || dirty) { place(); renderer.render(scene, cam); dirty = false; }
      if (moving) requestAnimationFrame(tick);
      else running = false;
    }
    const kick = () => { dirty = true; if (!running) requestAnimationFrame(tick); };

    // ドラッグで回す／ホイールとピンチで寄る
    let drag = null, pinch = null;
    const el0 = renderer.domElement;
    el0.addEventListener('pointerdown', e => {
      el0.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY };
    });
    el0.addEventListener('pointermove', e => {
      if (!drag || pinch) return;
      want.az -= (e.clientX - drag.x) * 0.008;
      want.el = Math.max(-1.45, Math.min(1.45, want.el + (e.clientY - drag.y) * 0.006));
      drag = { x: e.clientX, y: e.clientY };
      kick();
    });
    const end = e => { drag = null; try { el0.releasePointerCapture(e.pointerId); } catch {} };
    el0.addEventListener('pointerup', end);
    el0.addEventListener('pointercancel', end);
    el0.addEventListener('wheel', e => {
      e.preventDefault();
      want.dist = Math.max(1.2, Math.min(5, want.dist + e.deltaY * 0.0016));
      kick();
    }, { passive: false });
    el0.addEventListener('touchstart', e => {
      if (e.touches.length === 2) pinch = touchGap(e);
    }, { passive: true });
    el0.addEventListener('touchmove', e => {
      if (e.touches.length === 2 && pinch) {
        const g = touchGap(e);
        want.dist = Math.max(1.2, Math.min(5, want.dist * (pinch / g)));
        pinch = g; kick();
      }
    }, { passive: true });
    el0.addEventListener('touchend', () => { pinch = null; });
    const touchGap = e => Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY);

    function resize() {
      const w = container.clientWidth || 300;
      const h = container.clientHeight || 360;
      renderer.setSize(w, h, false);
      cam.aspect = w / h; cam.updateProjectionMatrix();
      kick();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();

    /* ---- 中身を差し替える ---- */
    function clear(group) {
      while (group.children.length) {
        const c = group.children.pop();
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
      }
    }

    function build(group, rec, ghost) {
      clear(group);
      if (!rec) { kick(); return; }
      const front = rec.front && PostureDB.unpackSlices(rec.front);
      const side  = rec.side  && PostureDB.unpackSlices(rec.side);

      if (front && side && front.length && side.length) {
        const color = ghost ? COL.magenta : COL.navy;
        const mesh = new THREE.Mesh(shellGeometry(front, side), new THREE.MeshPhongMaterial({
          color, transparent: true, opacity: ghost ? 0.07 : 0.20,
          side: THREE.DoubleSide, shininess: 6, depthWrite: false,
        }));
        group.add(mesh);
        group.add(new THREE.LineSegments(ringGeometry(front, side),
          new THREE.LineBasicMaterial({ color, transparent: true, opacity: ghost ? 0.22 : 0.42 })));
      }

      if (!ghost && rec.skeleton) {
        const world = PostureDB.unpackWorld(rec.skeleton);
        const pts = fitSkeleton(world, rec.rows, (front && front.length) || 40);
        if (pts) {
          group.add(new THREE.LineSegments(boneGeometry(pts),
            new THREE.LineBasicMaterial({ color: COL.cyan })));
          const dot = new THREE.SphereGeometry(0.011, 10, 8);
          const dm = new THREE.MeshBasicMaterial({ color: COL.cyan });
          const joints = new THREE.InstancedMesh(dot, dm, pts.length);
          const m = new THREE.Matrix4();
          pts.forEach((q, i) => { m.makeTranslation(q.x, q.y, q.z); joints.setMatrixAt(i, m); });
          group.add(joints);
        }
      }
      kick();
    }

    const VIEWS = {
      front: { az: 0,             el: 0.08 },
      side:  { az: Math.PI / 2,   el: 0.08 },
      top:   { az: 0,             el: 1.44 },
      iso:   { az: -0.62,         el: 0.34 },
    };

    return {
      setScan:  rec => build(root, rec, false),
      setGhost: rec => build(past, rec, true),
      setView(name) {
        const v = VIEWS[name] || VIEWS.iso;
        want = { ...want, az: v.az, el: v.el };
        kick();
      },
      showPlumb(on) { plumb.visible = on; grid.visible = on; kick(); },
      dispose() {
        ro.disconnect();
        clear(root); clear(past);
        renderer.dispose();
        if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      },
    };
  }

  return { create, load };
})();
