/* ============================================================
 *  姿勢の計算（Silhouette）
 *  MediaPipe の関節座標と人物マスクから、角度・比率・断面を出します。
 *  ここは純粋な計算だけ。画像には一切さわりません。
 * ============================================================ */
const PostureMetrics = (() => {

  // MediaPipe Pose の関節番号（33点のうち、使うものだけ）
  const P = {
    NOSE: 0, L_EAR: 7, R_EAR: 8,
    L_SHO: 11, R_SHO: 12,
    L_HIP: 23, R_HIP: 24,
    L_KNEE: 25, R_KNEE: 26,
    L_ANK: 27, R_ANK: 28,
    L_HEEL: 29, R_HEEL: 30,
  };

  const DEG = 180 / Math.PI;

  // 画像座標は縦横それぞれ 0〜1 に正規化されている。
  // そのままだと横長の写真で角度が歪むので、x にアスペクト比を掛けて実寸比に戻す。
  const px = (p, aspect) => ({ x: p.x * aspect, y: p.y });
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z || 0) + (b.z || 0)) / 2 });
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // 「下→上」のベクトルが、真上からどれだけ傾いているか（度）。
  // 戻り値の符号：上の点が右にあれば +、左にあれば −。
  function tiltFromVertical(lower, upper) {
    const dx = upper.x - lower.x;
    const dy = lower.y - upper.y;          // 画像の y は下向きなので反転
    if (dy <= 0) return 0;
    return Math.atan2(dx, dy) * DEG;
  }

  // 2点を結ぶ線が、水平からどれだけ傾いているか（度）。
  // 戻り値の符号：右側が下がっていれば +。
  function tiltFromHorizontal(left, right) {
    return Math.atan2(right.y - left.y, right.x - left.x) * DEG;
  }

  /* ---------- 基準の長さ（大腿長） ----------
   * 身長ではなく骨の長さを基準にする。猫背でも縮まないため。
   * worldLandmarks はメートル単位なので、そのまま実寸が取れる。 */
  function refLength(world) {
    if (!world || !world.length) return 0;
    const l = Math.hypot(
      world[P.L_HIP].x - world[P.L_KNEE].x,
      world[P.L_HIP].y - world[P.L_KNEE].y,
      world[P.L_HIP].z - world[P.L_KNEE].z);
    const r = Math.hypot(
      world[P.R_HIP].x - world[P.R_KNEE].x,
      world[P.R_HIP].y - world[P.R_KNEE].y,
      world[P.R_HIP].z - world[P.R_KNEE].z);
    return (l + r) / 2;
  }

  /* ---------- 正面から取れるもの ---------- */
  function analyzeFront(lm, world, aspect) {
    const p = i => px(lm[i], aspect);
    const sL = p(P.L_SHO), sR = p(P.R_SHO);
    const hL = p(P.L_HIP), hR = p(P.R_HIP);
    const ear = mid(p(P.L_EAR), p(P.R_EAR));
    const sMid = mid(sL, sR), hMid = mid(hL, hR);

    // 画面の左に写っているほうが本人の右half。表示上の左右で素直に扱う。
    const shoulderLevel = tiltFromHorizontal(sL, sR);
    const pelvisLevel   = tiltFromHorizontal(hL, hR);

    // 頭の左右のズレ：骨盤の中心から見て、頭が何mm横にあるか
    const shoulderW = dist(sL, sR) || 1;
    const headShiftRatio = (ear.x - hMid.x) / shoulderW;

    // 体幹のねじれ：真上から見て、肩の線と骨盤の線が何度ズレているか。
    // 3D座標（worldLandmarks）の水平面 XZ に投影して求める。
    let trunkRotation = 0;
    if (world && world.length) {
      const sv = { x: world[P.L_SHO].x - world[P.R_SHO].x, z: world[P.L_SHO].z - world[P.R_SHO].z };
      const hv = { x: world[P.L_HIP].x - world[P.R_HIP].x, z: world[P.L_HIP].z - world[P.R_HIP].z };
      const as = Math.atan2(sv.z, sv.x), ah = Math.atan2(hv.z, hv.x);
      let d = (as - ah) * DEG;
      while (d > 90) d -= 180;
      while (d < -90) d += 180;
      trunkRotation = d;
    }

    return {
      shoulderLevel:  round1(shoulderLevel),
      pelvisLevel:    round1(pelvisLevel),
      headShift:      round1(headShiftRatio * 100),   // 肩幅に対する％
      trunkRotation:  round1(trunkRotation),
      _shoulderMid: sMid, _hipMid: hMid,
    };
  }

  /* ---------- 側面から取れるもの ----------
   * 真横を向いていれば左右の関節はほぼ重なるので、中点を使う。 */
  function analyzeSide(lm, aspect) {
    const p = i => px(lm[i], aspect);
    const ear   = mid(p(P.L_EAR),  p(P.R_EAR));
    const sho   = mid(p(P.L_SHO),  p(P.R_SHO));
    const hip   = mid(p(P.L_HIP),  p(P.R_HIP));
    const knee  = mid(p(P.L_KNEE), p(P.R_KNEE));
    const ankle = mid(p(P.L_ANK),  p(P.R_ANK));
    const nose  = p(P.NOSE);

    // どちら向きに立っているか（鼻が耳より右なら右向き＝+1）
    const facing = nose.x >= ear.x ? 1 : -1;

    // 前方に出ているほど + になるように、向きで符号をそろえる
    const fw = deg => round1(deg * facing);

    const legLen = Math.abs(ankle.y - hip.y) || 1;

    return {
      facing,
      // 首の前傾：肩→耳 の線が垂直から何度前に出ているか
      neckForward:    fw(tiltFromVertical(sho, ear)),
      // 肩の前方変位（巻き肩の目安）：腰→肩 の線の垂直からの角度
      shoulderShift:  fw(tiltFromVertical(hip, sho)),
      // 骨盤の前方シフト：くるぶしの垂線から腰が何度ぶん前に出ているか
      pelvisShift:    fw(tiltFromVertical(ankle, hip)),
      // 膝：くるぶしの垂線からのズレ（+ は前、− は後ろ＝反張膝ぎみ）
      kneeShift:      round1((knee.x - ankle.x) / legLen * 100 * facing),
    };
  }

  /* ---------- 人物マスクから断面テーブルを作る ----------
   *  頭のてっぺんから くるぶし までを N 段に分け、
   *  各段の「いちばん左の人物ピクセル」と「いちばん右」を拾う。
   *  長さの単位は「頭〜くるぶしの高さ ＝ 1.0」。
   *  こうしておくと、カメラとの距離が毎回違っても同じ土俵で比べられる。
   *  戻り値は各段 { c: 体の中心からの左右のズレ, r: 半幅 }。 */
  function slices(mask, w, h, personLabel, topY, botY, N, kx) {
    const fixX = kx || 1;
    const span = Math.max(1, botY - topY);
    const raw = [];
    for (let i = 0; i < N; i++) {
      const y = Math.round(topY + span * (i + 0.5) / N);
      let left = -1, right = -1;
      if (y >= 0 && y < h) {
        const row = y * w;
        for (let x = 0; x < w; x++)      if (mask[row + x] === personLabel) { left = x; break; }
        for (let x = w - 1; x >= 0; x--) if (mask[row + x] === personLabel) { right = x; break; }
      }
      raw.push(left < 0 ? null : { c: (left + right) / 2, r: (right - left) / 2 });
    }
    const seen = raw.filter(Boolean);
    if (!seen.length) return raw.map(() => ({ c: 0, r: 0 }));
    const center = seen.reduce((s2, v) => s2 + v.c, 0) / seen.length;
    return raw.map(v => v
      ? { c: (v.c - center) * fixX / span, r: v.r * fixX / span }
      : { c: 0, r: 0 });
  }

  /* ---------- 断面テーブルからシルエット比率を出す ----------
   *  肩＝肩の高さの幅、ウエスト＝肩と腰の間でいちばん細いところ、
   *  ヒップ＝腰の高さから太もも上部でいちばん太いところ。
   *  すべて比率なので、カメラとの距離には影響されない。 */
  function ratios(sl, iShoulder, iHip) {
    const N = sl.length;
    const clamp = i => Math.min(N - 1, Math.max(0, i));
    const iS = clamp(iShoulder), iH = clamp(iHip);
    const width = i => (sl[i] ? sl[i].r * 2 : 0);

    const shoulder = width(iS);
    let waist = Infinity;
    for (let i = iS + 1; i < iH; i++) if (width(i) > 0) waist = Math.min(waist, width(i));
    if (!isFinite(waist)) waist = width(clamp(Math.round((iS + iH) / 2)));

    let hipW = 0;
    for (let i = clamp(iH - Math.round(N * 0.03)); i <= clamp(iH + Math.round(N * 0.10)); i++) {
      hipW = Math.max(hipW, width(i));
    }

    // 太もも／ふくらはぎ（腰から下を見る）
    const legTop = iH, legBot = N - 1;
    const thigh = width(clamp(Math.round(legTop + (legBot - legTop) * 0.25)));
    const calf  = width(clamp(Math.round(legTop + (legBot - legTop) * 0.72)));

    return {
      waistHip:      hipW  ? round3(waist / hipW)     : 0,
      shoulderWaist: waist ? round3(shoulder / waist) : 0,
      thighCalf:     calf  ? round3(thigh / calf)     : 0,
    };
  }

  /* ---------- 姿勢スコア（0〜100） ----------
   *  それぞれの「理想からのズレ」を許容幅で割って、合計を100から引く。
   *  許容幅（tol）を超えると、その項目の減点が満点になる。 */
  const SCORE_ITEMS = [
    { key: 'neckForward',   tol: 18, w: 22, abs: false, ideal: 0 },
    { key: 'shoulderShift', tol: 14, w: 18, abs: false, ideal: 0 },
    { key: 'pelvisShift',   tol: 10, w: 16, abs: false, ideal: 0 },
    { key: 'kneeShift',     tol: 12, w: 10, abs: false, ideal: 0 },
    { key: 'shoulderLevel', tol: 6,  w: 14, abs: true,  ideal: 0 },
    { key: 'pelvisLevel',   tol: 5,  w: 12, abs: true,  ideal: 0 },
    { key: 'trunkRotation', tol: 10, w: 8,  abs: true,  ideal: 0 },
  ];

  function score(angles) {
    let lost = 0, used = 0;
    for (const it of SCORE_ITEMS) {
      const v = angles[it.key];
      if (v === undefined || v === null) continue;
      used += it.w;
      const d = Math.min(1, Math.abs(v - it.ideal) / it.tol);
      lost += d * it.w;
    }
    if (!used) return null;
    return Math.round(100 - lost / used * 100);
  }

  // 各項目の判定（good / watch / off）。UI の色分けに使う。
  function judge(key, v) {
    const it = SCORE_ITEMS.find(i => i.key === key);
    if (!it || v === undefined || v === null) return 'good';
    const d = Math.abs(v) / it.tol;
    return d < 0.4 ? 'good' : d < 0.8 ? 'watch' : 'off';
  }

  const round1 = n => Math.round(n * 10) / 10;
  const round3 = n => Math.round(n * 1000) / 1000;

  return { P, refLength, analyzeFront, analyzeSide, slices, ratios, score, judge, SCORE_ITEMS };
})();
