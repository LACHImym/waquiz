/* ============================================================
 *  解析（Silhouette）
 * ------------------------------------------------------------
 *  カメラの1コマを受け取って、関節座標と人物マスクを取り出します。
 *  MediaPipe はブラウザの中で動くので、画像はどこにも送信されません。
 *  解析が終わったコマは、この関数を抜けた時点で破棄されます。
 * ============================================================ */
const PostureScan = (() => {
  const VISION_PKG = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  const VISION_ESM = VISION_PKG + '/vision_bundle.mjs';
  const WASM_PATH  = VISION_PKG + '/wasm';
  const POSE_MODEL =
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
  const SEG_MODEL  =
    'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite';

  const SLICE_ROWS = 40;   // 断面テーブルの段数

  let vision = null, pose = null, seg = null, loading = null;

  // モデルの読み込みは初回だけ。2回目以降は使い回す。
  function load(onProgress) {
    if (loading) return loading;
    loading = (async () => {
      onProgress && onProgress('解析エンジンを読み込んでいます…');
      const tv = await import(/* webpackIgnore: true */ VISION_ESM);
      vision = await tv.FilesetResolver.forVisionTasks(WASM_PATH);

      // GPU が使えない端末では CPU に切り替えて、もう一度だけ試す
      const withFallback = (make, opts) =>
        make({ ...opts, baseOptions: { ...opts.baseOptions, delegate: 'GPU' } })
          .catch(() => make({ ...opts, baseOptions: { ...opts.baseOptions, delegate: 'CPU' } }));

      onProgress && onProgress('姿勢モデルを読み込んでいます…');
      pose = await withFallback(o => tv.PoseLandmarker.createFromOptions(vision, o), {
        baseOptions: { modelAssetPath: POSE_MODEL },
        runningMode: 'IMAGE',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
      });

      onProgress && onProgress('シルエットモデルを読み込んでいます…');
      seg = await withFallback(o => tv.ImageSegmenter.createFromOptions(vision, o), {
        baseOptions: { modelAssetPath: SEG_MODEL },
        runningMode: 'IMAGE',
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      });
      onProgress && onProgress('');
    })().catch(e => { loading = null; throw e; });
    return loading;
  }

  function isReady() { return !!(pose && seg); }

  /* ---- 関節を取る ---- */
  function detectPose(source) {
    const res = pose.detect(source);
    if (!res || !res.landmarks || !res.landmarks.length) return null;
    return { lm: res.landmarks[0], world: (res.worldLandmarks || [])[0] || null };
  }

  /* ---- 人物マスクを取る（コピーしてすぐ解放） ---- */
  function detectMask(source) {
    let out = null;
    const take = r => {
      const m = r && r.categoryMask;
      if (!m) return;
      out = { data: m.getAsUint8Array().slice(), w: m.width, h: m.height };
      m.close();
    };
    const ret = seg.segment(source, take);   // 版によって戻り値／コールバックの両方がある
    if (!out && ret) take(ret);
    return out;
  }

  /* ---- 人物を表す値がどれかを、腰の位置のピクセルから決める ----
   *  モデルによって「人物＝1」だったり「人物＝0」だったりするので、
   *  必ず写っているはずの腰のところを見て判定する。 */
  function personLabelAt(mask, lm) {
    const hx = (lm[PostureMetrics.P.L_HIP].x + lm[PostureMetrics.P.R_HIP].x) / 2;
    const hy = (lm[PostureMetrics.P.L_HIP].y + lm[PostureMetrics.P.R_HIP].y) / 2;
    const x = Math.min(mask.w - 1, Math.max(0, Math.round(hx * mask.w)));
    const y = Math.min(mask.h - 1, Math.max(0, Math.round(hy * mask.h)));
    return mask.data[y * mask.w + x];
  }

  // マスクの中で人物がいちばん上に来る行（＝頭のてっぺん）
  function topOfPerson(mask, label) {
    for (let y = 0; y < mask.h; y++) {
      const row = y * mask.w;
      for (let x = 0; x < mask.w; x++) if (mask.data[row + x] === label) return y;
    }
    return 0;
  }

  /* ---- 撮れているかのチェック ---- */
  function checkFraming(lm) {
    const P = PostureMetrics.P;
    const vis = i => (lm[i].visibility === undefined ? 1 : lm[i].visibility);
    if (vis(P.L_ANK) < 0.4 && vis(P.R_ANK) < 0.4) return '足元まで写るように、カメラを離してください';
    if (vis(P.L_SHO) < 0.4 || vis(P.R_SHO) < 0.4) return '肩がはっきり写るようにしてください';
    const top = Math.min(lm[P.L_EAR].y, lm[P.R_EAR].y);
    const bot = Math.max(lm[P.L_ANK].y, lm[P.R_ANK].y);
    if (bot - top < 0.45) return 'もう少しカメラに近づいてください（体が小さすぎます）';
    if (top < 0.02) return '頭が画面の外に出ています';
    if (bot > 0.995) return '足が画面の外に出ています';
    return null;
  }

  /* ---- 正面の解析 ---- */
  function analyzeFront(source, w, h2) {
    const p = detectPose(source);
    if (!p) return { error: '人物を見つけられませんでした。明るい場所で、全身が入るようにしてください' };
    const warn = checkFraming(p.lm);
    if (warn) return { error: warn };

    const aspect = w / h2;
    const angles = PostureMetrics.analyzeFront(p.lm, p.world, aspect);
    const ref = PostureMetrics.refLength(p.world);

    const mask = detectMask(source);
    let slices = null, ratios = null, rows = null;
    if (mask) {
      const label = personLabelAt(mask, p.lm);
      const P = PostureMetrics.P;
      const topY = topOfPerson(mask, label);
      const botY = Math.round(Math.max(p.lm[P.L_ANK].y, p.lm[P.R_ANK].y) * mask.h);
      const span = Math.max(1, botY - topY);
      const rowOf = yn => Math.round((yn * mask.h - topY) / span * SLICE_ROWS - 0.5);

      const kx = (w * mask.h) / (mask.w * h2);
      slices = PostureMetrics.slices(mask.data, mask.w, mask.h, label, topY, botY, SLICE_ROWS, kx);
      rows = {
        shoulder: rowOf((p.lm[P.L_SHO].y + p.lm[P.R_SHO].y) / 2),
        hip:      rowOf((p.lm[P.L_HIP].y + p.lm[P.R_HIP].y) / 2),
      };
      ratios = PostureMetrics.ratios(slices, rows.shoulder, rows.hip);
    }

    return {
      angles: {
        shoulderLevel: angles.shoulderLevel,
        pelvisLevel:   angles.pelvisLevel,
        headShift:     angles.headShift,
        trunkRotation: angles.trunkRotation,
      },
      ratios, slices, rows, ref,
      world: p.world,
    };
  }

  /* ---- 側面の解析 ---- */
  function analyzeSide(source, w, h2) {
    const p = detectPose(source);
    if (!p) return { error: '人物を見つけられませんでした。明るい場所で、全身が入るようにしてください' };
    const warn = checkFraming(p.lm);
    if (warn) return { error: warn };

    const s = PostureMetrics.analyzeSide(p.lm, w / h2);

    const mask = detectMask(source);
    let slices = null;
    if (mask) {
      const label = personLabelAt(mask, p.lm);
      const P = PostureMetrics.P;
      const topY = topOfPerson(mask, label);
      const botY = Math.round(Math.max(p.lm[P.L_ANK].y, p.lm[P.R_ANK].y) * mask.h);
      const kx = (w * mask.h) / (mask.w * h2);
      slices = PostureMetrics.slices(mask.data, mask.w, mask.h, label, topY, botY, SLICE_ROWS, kx);
      // 右向き・左向きのどちらで撮っても、前を向いている側が + になるように揃える
      if (s.facing < 0) slices = slices.map(v => ({ c: -v.c, r: v.r }));
    }

    return {
      angles: {
        neckForward:   s.neckForward,
        shoulderShift: s.shoulderShift,
        pelvisShift:   s.pelvisShift,
        kneeShift:     s.kneeShift,
      },
      slices,
      facing: s.facing,
    };
  }

  return { load, isReady, analyzeFront, analyzeSide, SLICE_ROWS };
})();
