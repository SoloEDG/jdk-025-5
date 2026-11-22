import { Fraction } from "./fraction";
import { tarjanSCC } from "./scc";
import type {
  BeamKey,
  BeamResult,
  BeamSegment,
  BlockRecord,
  ColorId,
  EnergyAudit,
  FixedCell,
  Heading,
  Movable,
  OpticsLevel,
  ReceiverVerdict,
  SolverReport,
  UnstableLoop,
  Verdict,
} from "../model/types";
import { HEADINGS, DELTA } from "../model/types";

export interface PlacedFixture {
  movable: Movable;
  cell: number;
}

export interface SolverInput {
  level: OpticsLevel;
  fixtures: PlacedFixture[];
}

// 出边：入射能量乘 weight 后沿 outHeading 离开
interface OutEdge {
  outHeading: Heading;
  weight: Fraction;
  kind: "pass" | "mirror" | "split";
  fixtureUid?: string;
}

const COLORS: ColorId[] = ["amber", "azure", "rose"];

function mirrorOut(orientation: "/" | "\\", h: Heading): Heading {
  // '/'：东→北、北→东、南→西、西→南
  if (orientation === "/") return ([3, 2, 1, 0] as Heading[])[h];
  // '\\'：东→南、南→东、西→北、北→西
  return ([1, 0, 3, 2] as Heading[])[h];
}

export function mirrorOutName(orientation: "/" | "\\", h: Heading): Heading {
  return mirrorOut(orientation, h);
}

function splitterOuts(m: Movable, h: Heading): OutEdge[] {
  const ratio = m.splitRatio ?? Fraction.ZERO;
  const side = ((m.handedness ?? 0) === 1 ? 1 : 3) as 1 | 3;
  const sideHeading = ((h + side) % 4) as Heading;
  const edges: OutEdge[] = [];
  const straight = Fraction.ONE.sub(ratio);
  if (straight.isPositive())
    edges.push({ outHeading: h, weight: straight, kind: "split", fixtureUid: m.uid });
  if (ratio.isPositive())
    edges.push({ outHeading: sideHeading, weight: ratio, kind: "split", fixtureUid: m.uid });
  return edges;
}

// 入射某格（方向 heading）后的处理
function cellResponse(
  fixed: FixedCell | undefined,
  fixture: PlacedFixture | undefined,
  heading: Heading,
): { edges: OutEdge[]; absorb?: BlockRecord["reason"] } {
  if (fixed) {
    switch (fixed.kind) {
      case "wall":
        return { edges: [], absorb: "wall" };
      case "door":
        return { edges: [], absorb: "door" };
      case "receiver":
        return { edges: [], absorb: "receiver" };
      case "source":
        return { edges: [], absorb: "source" };
    }
  }
  if (fixture) {
    const m = fixture.movable;
    if (m.kind === "blocker") return { edges: [], absorb: "blocker" };
    if (m.kind === "mirror") {
      const r = m.reflectivity ?? Fraction.ONE;
      return {
        edges: [
          {
            outHeading: mirrorOut(m.orientation ?? "/", heading),
            weight: r,
            kind: "mirror",
            fixtureUid: m.uid,
          },
        ],
      };
    }
    if (m.kind === "splitter") return { edges: splitterOuts(m, heading) };
  }
  return { edges: [{ outHeading: heading, weight: Fraction.ONE, kind: "pass" }] };
}

// 变量 X[cell][h][color]：从 cell 沿 h 方向「离开」的光束能量
export function varIndex(cell: number, heading: Heading, color: ColorId): number {
  return (cell * 4 + heading) * 3 + COLORS.indexOf(color);
}

export function decodeVar(idx: number): BeamKey {
  const color = COLORS[idx % 3];
  const q = (idx - (idx % 3)) / 3;
  const heading = (q % 4) as Heading;
  const cell = (q - heading) / 4;
  return { cell, heading, color };
}

function gaussJordan(A: Fraction[][], b: Fraction[]): Fraction[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  let pivotRow = 0;
  for (let col = 0; col < n && pivotRow < n; col++) {
    let sel = -1;
    for (let r = pivotRow; r < n; r++) if (!M[r][col].isZero()) { sel = r; break; }
    if (sel === -1) continue;
    [M[pivotRow], M[sel]] = [M[sel], M[pivotRow]];
    const piv = M[pivotRow][col];
    for (let k = 0; k <= n; k++) M[pivotRow][k] = M[pivotRow][k].div(piv);
    for (let r = 0; r < n; r++) {
      if (r === pivotRow || M[r][col].isZero()) continue;
      const factor = M[r][col];
      for (let k = 0; k <= n; k++)
        M[r][k] = M[r][k].sub(factor.mul(M[pivotRow][k]));
    }
    pivotRow++;
  }
  for (let r = 0; r < n; r++) {
    let allZero = true;
    for (let c = 0; c < n; c++) if (!M[r][c].isZero()) { allZero = false; break; }
    if (allZero && !M[r][n].isZero()) return null;
  }
  if (pivotRow < n) return null;
  const x = new Array<Fraction>(n);
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (M[r][c].equals(Fraction.ONE)) { x[c] = M[r][n]; break; }
  return x;
}

// 浮点雅可比迭代，仅交叉验证，绝不参与阈值判定
function floatSolve(
  T: Fraction[][],
  b: Fraction[],
  maxIter = 30000,
  tol = 1e-12,
): { x: number[]; iterations: number; converged: boolean } {
  const n = b.length;
  const Tf = T.map((row) => row.map((v) => v.toNumber()));
  const bf = b.map((v) => v.toNumber());
  const x = new Array<number>(n).fill(0);
  let iter = 0;
  let converged = false;
  for (; iter < maxIter; iter++) {
    const next = new Array<number>(n);
    let maxDiff = 0;
    for (let i = 0; i < n; i++) {
      let s = bf[i];
      for (let j = 0; j < n; j++) s += Tf[i][j] * x[j];
      if (!Number.isFinite(s)) return { x, iterations: iter, converged: false };
      next[i] = s;
      maxDiff = Math.max(maxDiff, Math.abs(next[i] - x[i]));
    }
    x.splice(0, n, ...next);
    if (maxDiff < tol) { converged = true; break; }
  }
  return { x, iterations: iter, converged };
}

interface PendingBlock {
  cell: number;
  heading: Heading; // 入射方向
  color: ColorId;
  reason: BlockRecord["reason"];
  inVar: number; // 入射光束变量（邻居出射）
}

export function coordName(cell: number, width: number): string {
  const x = cell % width;
  const y = Math.floor(cell / width);
  return `${String.fromCharCode(65 + x)}${y + 1}`;
}

export function solveOptics(input: SolverInput): SolverReport {
  const { level, fixtures } = input;
  const W = level.width;
  const H = level.height;
  const N = W * H;
  const totalVars = N * 4 * 3;
  const fixtureAt = new Map<number, PlacedFixture>();
  for (const f of fixtures) if (f.cell !== null) fixtureAt.set(f.cell, f);

  const notes: string[] = [];
  notes.push(
    `以「从每格沿各方向离开的定向光束能量」为变量建立 ${totalVars} 维线性系统，求整体稳态；闭环被方程天然包含，不按动画帧累计。`,
  );

  const rows: { from: number; weight: Fraction }[][] = Array.from(
    { length: totalVars },
    () => [],
  );
  const constTerm = new Array<Fraction>(totalVars).fill(Fraction.ZERO);
  const unitEdges: number[][] = Array.from({ length: totalVars }, () => []);
  // 来源追踪（用于绘制）：target 变量由哪些入射变量经何权重产生
  const trace: { inVar: number; fromCell: number; weight: Fraction }[][] =
    Array.from({ length: totalVars }, () => []);
  const pendingBlocks: PendingBlock[] = [];
  // 每个格收到的入射光束变量（用于审计，环上多次回绕天然包含在稳态值里）
  const incidentVars: number[][] = Array.from({ length: N }, () => []);

  for (let cell = 0; cell < N; cell++) {
    const x = cell % W;
    const y = Math.floor(cell / W);
    const fixed = level.fixed[cell];
    const fixture = fixtureAt.get(cell);

    for (const color of COLORS) {
      // 光源自身发射：持续向其朝向（约定朝东，heading=0）注入同色能量。
      // 光源不转发外来光（cellResponse 对 source 返回 absorb），但入射仍需记账，故不在此 continue。
      if (fixed?.kind === "source" && fixed.color === color && fixed.power) {
        const emitVar = varIndex(cell, 0, color);
        constTerm[emitVar] = constTerm[emitVar].add(fixed.power);
      }

      for (const heading of HEADINGS) {
        // 入射：来自沿 heading 反方向退一格的邻居，其沿 heading 的出射
        const [dx, dy] = DELTA[(heading + 2) % 4];
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; // 界外无入射
        const neighbor = ny * W + nx;
        const inVar = varIndex(neighbor, heading, color);
        incidentVars[cell].push(inVar);

        const { edges, absorb } = cellResponse(
          fixed,
          fixture,
          heading,
        );
        if (absorb) {
          pendingBlocks.push({ cell, heading, color, reason: absorb, inVar });
          continue;
        }
        // 每条出边按其「离开本格的方向」进入对应变量（镜面转向、分光侧路都由此路由）
        for (const e of edges) {
          const target = varIndex(cell, e.outHeading, color);
          rows[target].push({ from: inVar, weight: e.weight });
          trace[target].push({ inVar, fromCell: neighbor, weight: e.weight });
          if (e.weight.equals(Fraction.ONE)) unitEdges[target].push(inVar);
        }
      }
    }
  }

  // 转移矩阵 T：x = T x + b。浮点固定点迭代直接用 T。
  const Tmat: Fraction[][] = Array.from({ length: totalVars }, () =>
    new Array<Fraction>(totalVars).fill(Fraction.ZERO),
  );
  for (let i = 0; i < totalVars; i++)
    for (const { from, weight } of rows[i])
      Tmat[i][from] = Tmat[i][from].add(weight);
  // 精确消元解 (I - T) x = b
  const Mlin: Fraction[][] = Tmat.map((row) => row.map((v) => v.neg()));
  for (let i = 0; i < totalVars; i++)
    Mlin[i][i] = Fraction.ONE.sub(Tmat[i][i]);
  const b = constTerm.slice();

  // ---- 无损环：权重恰为 1 的有向图上求 SCC ----
  const scc = tarjanSCC(totalVars, unitEdges);
  const unstableLoops: UnstableLoop[] = [];
  const unstableVarSet = new Set<number>();
  const seenLoopKeys = new Set<string>();
  for (const group of scc.groups) {
    const isCycle = group.length > 1 || unitEdges[group[0]].includes(group[0]);
    if (!isCycle) continue;
    const cells = new Set<number>();
    const uidSet = new Set<string>();
    const colorSet = new Set<ColorId>();
    for (const v of group) {
      const k = decodeVar(v);
      unstableVarSet.add(v);
      cells.add(k.cell);
      colorSet.add(k.color);
      const fp = fixtureAt.get(k.cell);
      if (fp) uidSet.add(fp.movable.uid);
    }
    const cellList = [...cells].sort((a, z) => a - z);
    const key = cellList.join("-") + "|" + [...colorSet].sort().join(",");
    if (seenLoopKeys.has(key)) continue;
    seenLoopKeys.add(key);
    unstableLoops.push({
      fixtures: [...uidSet],
      cells: cellList,
      colors: [...colorSet],
      gain: Fraction.ONE,
      detail: `格 ${cellList.map((c) => coordName(c, W)).join(" → ")} 形成无损闭环（增益=1），光每绕一圈无衰减，稳态能量发散，无有限解。`,
    });
  }

  const exact = gaussJordan(Mlin, b);
  const exactFailed = exact === null;
  if (exactFailed)
    notes.push(
      "精确分数消元判定系统奇异：存在无损环，相关光束无有限稳态；依赖它们的接收器一律保持「待定」，绝不据此开门。",
    );

  const fl = floatSolve(Tmat, b);
  let floatMaxDelta = 0;
  if (exact) {
    for (let i = 0; i < totalVars; i++)
      floatMaxDelta = Math.max(
        floatMaxDelta,
        Math.abs(fl.x[i] - exact[i].toNumber()),
      );
    notes.push(
      `浮点迭代 ${fl.iterations} 次${fl.converged ? "收敛" : "未完全收敛"}，与精确分数解最大偏差 ${floatMaxDelta.toExponential(2)}；阈值只按精确值比较，近似误差跨过阈值时仍以精确解继续求证。`,
    );
  }

  const valueAt = (idx: number): Fraction => (exact ? exact[idx] : Fraction.ZERO);

  // ---- 光束结果（出射变量）----
  const beams: BeamResult[] = [];
  for (let i = 0; i < totalVars; i++) {
    const energy = valueAt(i);
    if (energy.isPositive() || unstableVarSet.has(i))
      beams.push({ key: decodeVar(i), energy, reaches: energy.isPositive() });
  }

  // ---- 光路段：邻居出射 → 进入本格 ----
  const segments: BeamSegment[] = [];
  for (let i = 0; i < totalVars; i++) {
    const energy = valueAt(i);
    if (!energy.isPositive()) continue;
    const k = decodeVar(i); // 从 k.cell 沿 k.heading 离开
    const [dx, dy] = DELTA[k.heading];
    const tx = (k.cell % W) + dx;
    const ty = Math.floor(k.cell / W) + dy;
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
    const toCell = ty * W + tx;
    segments.push({ from: k.cell, to: toCell, heading: k.heading, color: k.color, energy });
  }

  // ---- 阻断回填 ----
  const blocks: BlockRecord[] = [];
  for (const pb of pendingBlocks) {
    const e = valueAt(pb.inVar);
    if (!e.isPositive()) continue;
    blocks.push({
      cell: pb.cell,
      heading: pb.heading,
      color: pb.color,
      energy: e,
      reason: pb.reason,
    });
  }

  // ---- 接收器：同色各方向入射相加 ----
  const receivers: ReceiverVerdict[] = [];
  for (const [cellStr, fxCell] of Object.entries(level.fixed)) {
    if (fxCell.kind !== "receiver" || !fxCell.color || !fxCell.threshold) continue;
    const cell = Number(cellStr);
    const contributions: ReceiverVerdict["contributions"] = [];
    let total = Fraction.ZERO;
    let dependsOnUnstable = false;
    for (const heading of HEADINGS) {
      // 入射 = 邻居沿 heading 的出射
      const [dx, dy] = DELTA[(heading + 2) % 4];
      const nx = (cell % W) + dx;
      const ny = Math.floor(cell / W) + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const neighbor = ny * W + nx;
      const idx = varIndex(neighbor, heading, fxCell.color);
      if (unstableVarSet.has(idx)) dependsOnUnstable = true;
      const e = valueAt(idx);
      if (e.isPositive()) {
        total = total.add(e);
        contributions.push({ heading, energy: e });
      }
    }
    let verdict: Verdict;
    if (exactFailed && dependsOnUnstable) verdict = "pending";
    else if (total.cmp(fxCell.threshold) >= 0) verdict = "reached";
    else verdict = "below";
    receivers.push({
      cell,
      color: fxCell.color,
      threshold: fxCell.threshold,
      total,
      margin: total.sub(fxCell.threshold),
      verdict,
      contributions,
    });
  }

  const audit = buildAudit(level, fixtureAt, valueAt, blocks, W, H, incidentVars);

  if (unstableLoops.length)
    notes.push(
      `检出 ${unstableLoops.length} 处无损环，涉及机关：${
        unstableLoops.flatMap((l) => l.fixtures).join("、") || "（直通空格环）"
      }。请给某面镜子加损耗或打破闭环后再扫描。`,
    );
  else
    notes.push(
      `能量守恒校验：发射 ${audit.emitted.format(3)}，损耗+吸收+溢出与发射相等，残差 ${audit.residual.format(6)}。`,
    );

  return {
    stable: unstableLoops.length === 0 && !exactFailed,
    beams,
    segments,
    blocks,
    receivers,
    unstableLoops,
    audit,
    floatMaxDelta,
    floatIterations: fl.iterations,
    notes,
  };
}

function buildAudit(
  level: OpticsLevel,
  fixtureAt: Map<number, PlacedFixture>,
  valueAt: (idx: number) => Fraction,
  blocks: BlockRecord[],
  W: number,
  H: number,
  incidentVars: number[][],
): EnergyAudit {
  let emitted = Fraction.ZERO;
  for (const fx of Object.values(level.fixed))
    if (fx.kind === "source" && fx.power) emitted = emitted.add(fx.power);

  // 镜面损耗：该格全部「真实入射」稳态能量（环上回绕已含在内）× (1-r)
  let mirrorLoss = Fraction.ZERO;
  for (const f of fixtureAt.values()) {
    if (f.movable.kind !== "mirror") continue;
    const lossRate = Fraction.ONE.sub(f.movable.reflectivity ?? Fraction.ONE);
    if (lossRate.isZero()) continue;
    const cell = f.cell!;
    for (const idx of incidentVars[cell]) {
      const e = valueAt(idx);
      if (e.isPositive()) mirrorLoss = mirrorLoss.add(e.mul(lossRate));
    }
  }

  let blocked = Fraction.ZERO;
  let absorbedReceivers = Fraction.ZERO;
  let absorbedDoor = Fraction.ZERO;
  // 含打回光源格被吸收的能量：发射按毛额计入 emitted，回流在光源处终止同样须记账，守恒才闭合
  for (const blk of blocks) {
    if (blk.reason === "receiver") absorbedReceivers = absorbedReceivers.add(blk.energy);
    else if (blk.reason === "door") absorbedDoor = absorbedDoor.add(blk.energy);
    else blocked = blocked.add(blk.energy); // wall / blocker / source 回流
  }

  // 溢出边界：边界格朝界外方向的出射能量
  let leakedEdge = Fraction.ZERO;
  for (let cell = 0; cell < W * H; cell++) {
    const x = cell % W;
    const y = Math.floor(cell / W);
    for (const color of COLORS) {
      for (const h of HEADINGS) {
        const [dx, dy] = DELTA[h];
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H) continue;
        const e = valueAt(varIndex(cell, h, color));
        if (e.isPositive()) leakedEdge = leakedEdge.add(e);
      }
    }
  }

  const accounted = mirrorLoss
    .add(blocked)
    .add(absorbedReceivers)
    .add(absorbedDoor)
    .add(leakedEdge);
  return {
    emitted,
    mirrorLoss,
    splitterLoss: Fraction.ZERO,
    absorbedReceivers,
    absorbedDoor,
    blocked,
    leakedEdge,
    residual: emitted.sub(accounted),
  };
}
