import { Fraction } from "../lib/fraction";
import { findLevel, cloneMovables } from "./levels";
import type {
  Evidence,
  Movable,
  OpticsDocument,
  OpticsLevel,
  OpticsLevelState,
  ReceiverVerdict,
  SolverReport,
  Verdict,
} from "./types";

export type OpticsCommand =
  | { type: "pick"; uid: string }
  | { type: "place"; cell: number }
  | { type: "return-tray"; uid: string }
  | { type: "rotate"; uid: string }
  | { type: "set-reflectivity"; uid: string; value: Fraction }
  | { type: "toggle-handedness"; uid: string }
  | { type: "set-split"; uid: string; value: Fraction }
  | { type: "scan"; level: OpticsLevel; report: SolverReport; fingerprint: string }
  | { type: "claim-door"; levelId: string }
  | { type: "apply-movables"; movables: Movable[]; notice?: string }
  | { type: "switch-level"; levelId: string }
  | { type: "load-document"; doc: OpticsDocument; notice?: string };

export interface OpticsState {
  doc: OpticsDocument;
  selectedUid: string | null;
  notice: string;
}

export function makeLevelState(
  levelId: string,
  movables: Movable[],
): OpticsLevelState {
  return {
    levelId,
    movables,
    trapSprung: false,
    trapFingerprint: null,
    claimed: false,
  };
}

export function initialOpticsDoc(
  levelId: string,
  movables: Movable[],
): OpticsDocument {
  return {
    version: 1,
    levelId,
    levels: { [levelId]: makeLevelState(levelId, movables) },
    evidence: [],
  };
}

export function kindName(kind: Movable["kind"]): string {
  return kind === "mirror"
    ? "镜面"
    : kind === "splitter"
      ? "分光晶体"
      : "遮光石";
}

export function cloneMovable(m: Movable): Movable {
  return {
    ...m,
    reflectivity: m.reflectivity
      ? new Fraction(m.reflectivity.num, m.reflectivity.den)
      : undefined,
    splitRatio: m.splitRatio
      ? new Fraction(m.splitRatio.num, m.splitRatio.den)
      : undefined,
  };
}

// label 含「警戒」的接收器为符文（达标即陷阱）；其余为门符（达标才开门）。
export function evaluateScan(
  level: OpticsLevel,
  report: SolverReport,
): { doorOpen: boolean; trapArmed: boolean; pending: boolean } {
  let doorOpen = true;
  let trapArmed = false;
  let pending = false;
  for (const r of report.receivers) {
    const label = level.fixed[r.cell]?.label ?? "";
    const isWard = label.includes("警戒");
    if (r.verdict === "pending") {
      pending = true;
      doorOpen = false;
      continue;
    }
    if (isWard) {
      if (r.verdict === "reached") trapArmed = true;
    } else if (r.verdict !== "reached") {
      doorOpen = false;
    }
  }
  if (!report.stable) {
    pending = true;
    doorOpen = false;
  }
  if (trapArmed) doorOpen = false;
  return { doorOpen, trapArmed, pending };
}

function snapshotReceiver(r: ReceiverVerdict): Evidence["receivers"][number] {
  return {
    cell: r.cell,
    color: r.color,
    threshold: r.threshold.toJSON(),
    total: r.total.toJSON(),
    verdict: r.verdict as Verdict,
  };
}

// 当前关卡状态
export function currentLevelState(doc: OpticsDocument): OpticsLevelState {
  return doc.levels[doc.levelId];
}

// 用新的关卡状态替换当前关，返回新文档
function withLevelState(
  doc: OpticsDocument,
  levelId: string,
  patch: Partial<OpticsLevelState>,
): OpticsDocument {
  const prev = doc.levels[levelId];
  return {
    ...doc,
    levels: {
      ...doc.levels,
      [levelId]: { ...prev, ...patch },
    },
  };
}

export function opticsReducer(
  state: OpticsState,
  c: OpticsCommand,
): OpticsState {
  const doc = state.doc;
  const ls = currentLevelState(doc);
  const movables = ls.movables;

  // 仅改当前关 movables 的便捷封装
  const withMovables = (next: Movable[], notice?: string): OpticsState => ({
    ...state,
    doc: withLevelState(doc, doc.levelId, { movables: next }),
    notice: notice ?? state.notice,
  });

  switch (c.type) {
    case "pick": {
      const target = movables.find((m) => m.uid === c.uid);
      if (!target) return state;
      return {
        ...state,
        selectedUid: c.uid,
        notice: `已拾取${kindName(target.kind)}，点击空格放置（预览不提交）。`,
      };
    }
    case "place": {
      if (!state.selectedUid) return state;
      if (movables.some((m) => m.cell === c.cell))
        return { ...state, notice: "该格已有机关，请先移走再放置。" };
      const next = movables.map((m) =>
        m.uid === state.selectedUid ? { ...m, cell: c.cell } : m,
      );
      return {
        ...withMovables(next, "机关已放置，光路为实时预览，尚未提交扫描。"),
        selectedUid: null,
      };
    }
    case "return-tray": {
      const next = movables.map((m) =>
        m.uid === c.uid ? { ...m, cell: null } : m,
      );
      return {
        ...withMovables(next, "机关已收回备料盘。"),
        selectedUid: state.selectedUid === c.uid ? null : state.selectedUid,
      };
    }
    case "rotate": {
      const next = movables.map((m): Movable => {
        if (m.uid !== c.uid || m.kind !== "mirror") return m;
        const orientation: Movable["orientation"] =
          m.orientation === "/" ? "\\" : "/";
        return { ...m, orientation };
      });
      return withMovables(next, "镜面已旋转，预览光路随之更新。");
    }
    case "set-reflectivity": {
      const v = c.value;
      if (v.cmp(Fraction.ZERO) <= 0 || v.cmp(Fraction.ONE) > 0)
        return { ...state, notice: "反射率必须落在 (0,1] 之间。" };
      const next = movables.map((m) =>
        m.uid === c.uid && m.kind === "mirror" ? { ...m, reflectivity: v } : m,
      );
      return withMovables(next);
    }
    case "toggle-handedness": {
      const next = movables.map((m) => {
        if (m.uid !== c.uid || m.kind !== "splitter") return m;
        return { ...m, handedness: (m.handedness === 1 ? 0 : 1) as 0 | 1 };
      });
      return withMovables(next);
    }
    case "set-split": {
      const v = c.value;
      if (v.cmp(Fraction.ZERO) < 0 || v.cmp(Fraction.ONE) > 0)
        return {
          ...state,
          notice: "分流比必须在 [0,1]；直通=1-分流，各路之和不超过输入。",
        };
      const next = movables.map((m) =>
        m.uid === c.uid && m.kind === "splitter" ? { ...m, splitRatio: v } : m,
      );
      return withMovables(next);
    }
    case "apply-movables":
      return {
        ...withMovables(c.movables.map(cloneMovable), c.notice ?? ""),
        selectedUid: null,
      };
    case "switch-level": {
      if (c.levelId === doc.levelId) return state;
      const lv = findLevel(c.levelId);
      // 目标关首次进入：载入出厂镜阵；已进入过则恢复其镜阵与历史
      const levels = { ...doc.levels };
      if (!levels[c.levelId])
        levels[c.levelId] = makeLevelState(
          c.levelId,
          cloneMovables(lv.movables),
        );
      return {
        doc: { ...doc, levelId: c.levelId, levels },
        selectedUid: null,
        notice: `已进入「${lv.name}」，恢复该关镜阵与历史证据。`,
      };
    }
    case "load-document":
      return { doc: c.doc, selectedUid: null, notice: c.notice ?? "" };
    case "scan": {
      const evaluation = evaluateScan(c.level, c.report);
      const evidence: Evidence = {
        id: crypto.randomUUID(),
        levelId: c.level.id,
        scannedAt: Date.now(),
        fingerprint: c.fingerprint,
        movables: movables.map(cloneMovable),
        receivers: c.report.receivers.map(snapshotReceiver),
        stable: c.report.stable,
        unstableLoopCells: c.report.unstableLoops.flatMap((l) => l.cells),
        doorOpen: evaluation.doorOpen,
        trapArmed: evaluation.trapArmed,
        floatMaxDelta: c.report.floatMaxDelta,
      };
      const updated: OpticsLevelState = {
        ...ls,
        trapSprung: ls.trapSprung || evaluation.trapArmed,
        trapFingerprint: evaluation.trapArmed
          ? c.fingerprint
          : ls.trapFingerprint,
      };
      return {
        doc: {
          ...withLevelState(doc, doc.levelId, updated),
          evidence: [evidence, ...doc.evidence].slice(0, 30),
        },
        selectedUid: null,
        notice: evaluation.trapArmed
          ? "警戒符文达到阈值，陷阱已激活！本镜阵结果已冻结为证据。"
          : evaluation.doorOpen
            ? "全部接光符稳定达标，封门可开启（需手动结算，且每关仅一次）。"
            : evaluation.pending
              ? "存在待定项（无损环/未稳定），封门保持关闭，数字已冻结不误开门。"
              : "扫描完成：仍有接光符未达标，封门保持关闭。",
      };
    }
    case "claim-door": {
      const latest = doc.evidence.find((ev) => ev.levelId === c.levelId);
      if (!latest || !latest.doorOpen)
        return { ...state, notice: "没有可结算的开门证据，无法领取文物。" };
      if (ls.claimed)
        return {
          ...state,
          notice: "该封门已结算；关门重开不可重复领取文物或重复结算。",
        };
      return {
        ...state,
        doc: withLevelState(doc, c.levelId, { claimed: true }),
        notice: "封门开启并结算文物；再次关闭重开不会重复发放。",
      };
    }
    default:
      return state;
  }
}

export function resolveLevel(levelId: string): OpticsLevel {
  return findLevel(levelId);
}
