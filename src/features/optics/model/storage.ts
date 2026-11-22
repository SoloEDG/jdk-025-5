import { Fraction } from "../lib/fraction";
import { cloneMovables, findLevel } from "../model/levels";
import type {
  ColorId,
  Evidence,
  Movable,
  OpticsDocument,
  OpticsLevelState,
  Verdict,
} from "../model/types";
import { initialOpticsDoc, makeLevelState } from "../model/opticsReducer";

const storageKey = "ruinfield-jdk025-optics-v1";

const obj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const int = (v: unknown) => typeof v === "number" && Number.isInteger(v);
const COLORS: ColorId[] = ["amber", "azure", "rose"];

function parseFraction(v: unknown): Fraction | null {
  if (typeof v !== "string") return null;
  return Fraction.parse(v);
}

function validMovable(v: unknown, cells: number): v is Movable {
  if (!obj(v)) return false;
  if (
    typeof v.uid !== "string" ||
    !["mirror", "splitter", "blocker"].includes(String(v.kind)) ||
    !(v.cell === null || (int(v.cell) && Number(v.cell) < cells))
  )
    return false;
  if (v.kind === "mirror") {
    if (!["/", "\\"].includes(String(v.orientation))) return false;
    const r = parseFraction(v.reflectivity);
    if (!r || r.cmp(Fraction.ZERO) <= 0 || r.cmp(Fraction.ONE) > 0) return false;
  }
  if (v.kind === "splitter") {
    if (![0, 1].includes(Number(v.handedness))) return false;
    const s = parseFraction(v.splitRatio);
    if (!s || s.cmp(Fraction.ZERO) < 0 || s.cmp(Fraction.ONE) > 0) return false;
  }
  return true;
}

function validEvidence(v: unknown): v is Evidence {
  if (!obj(v)) return false;
  const verdicts: Verdict[] = ["pending", "reached", "below"];
  return (
    typeof v.id === "string" &&
    typeof v.levelId === "string" &&
    int(v.scannedAt) &&
    typeof v.fingerprint === "string" &&
    Array.isArray(v.movables) &&
    typeof v.stable === "boolean" &&
    typeof v.doorOpen === "boolean" &&
    typeof v.trapArmed === "boolean" &&
    typeof v.floatMaxDelta === "number" &&
    Array.isArray(v.unstableLoopCells) &&
    v.unstableLoopCells.every((n: unknown) => int(n)) &&
    Array.isArray(v.receivers) &&
    v.receivers.every(
      (r: unknown) =>
        obj(r) &&
        int(r.cell) &&
        COLORS.includes(String(r.color) as ColorId) &&
        typeof r.threshold === "string" &&
        typeof r.total === "string" &&
        verdicts.includes(String(r.verdict) as Verdict),
    )
  );
}

function validLevelState(v: unknown, levelId: string): v is OpticsLevelState {
  if (!obj(v)) return false;
  const level = findLevel(levelId);
  const cells = level.width * level.height;
  return (
    v.levelId === levelId &&
    Array.isArray(v.movables) &&
    v.movables.every((m) => validMovable(m, cells)) &&
    typeof v.trapSprung === "boolean" &&
    (v.trapFingerprint === null || typeof v.trapFingerprint === "string") &&
    typeof v.claimed === "boolean"
  );
}

function validDocument(v: unknown): v is OpticsDocument {
  if (!obj(v) || v.version !== 1 || typeof v.levelId !== "string") return false;
  if (!obj(v.levels) || !Array.isArray(v.evidence)) return false;
  const levelIds = Object.keys(v.levels);
  if (!levelIds.includes(v.levelId as string)) return false;
  for (const id of levelIds) {
    if (!validLevelState((v.levels as Record<string, unknown>)[id], id))
      return false;
  }
  if (v.evidence.length > 30 || !v.evidence.every(validEvidence)) return false;
  // 各关 uid 唯一
  for (const id of levelIds) {
    const list = (v.levels as Record<string, OpticsLevelState>)[id].movables;
    const uids = list.map((m) => m.uid);
    if (new Set(uids).size !== uids.length) return false;
  }
  return true;
}

function reviveMovable(m: Movable): Movable {
  return {
    ...m,
    reflectivity: m.reflectivity
      ? (Fraction.parse(m.reflectivity as unknown as string) ?? undefined)
      : undefined,
    splitRatio: m.splitRatio
      ? (Fraction.parse(m.splitRatio as unknown as string) ?? undefined)
      : undefined,
  };
}

// 旧版（单关平铺结构）→ 新版多关结构迁移
function migrateLegacy(raw: Record<string, unknown>): OpticsDocument | null {
  const levelId = String(raw.levelId ?? "ruin-light-01");
  const level = findLevel(levelId);
  const movables = Array.isArray(raw.movables)
    ? (raw.movables as Movable[])
    : cloneMovables(level.movables);
  const claimedDoors: string[] = Array.isArray(raw.claimedDoors)
    ? (raw.claimedDoors as string[])
    : [];
  const evidence: Evidence[] = Array.isArray(raw.evidence)
    ? (raw.evidence as Evidence[])
    : [];
  const state: OpticsLevelState = {
    levelId,
    movables: movables.map(reviveMovable),
    trapSprung: raw.trapSprung === true,
    trapFingerprint:
      typeof raw.trapFingerprint === "string" ? raw.trapFingerprint : null,
    claimed: claimedDoors.includes(levelId),
  };
  return {
    version: 1,
    levelId,
    levels: { [levelId]: state },
    evidence,
  };
}

// 迁移产物的健全性检查：此时 Fraction 已还原为对象实例，不能套用字符串校验器
function soundMigratedDoc(doc: OpticsDocument): boolean {
  if (doc.version !== 1 || !doc.levels[doc.levelId]) return false;
  for (const id of Object.keys(doc.levels)) {
    const st = doc.levels[id];
    const level = findLevel(id);
    if (st.levelId !== id) return false;
    if (!Array.isArray(st.movables)) return false;
    for (const m of st.movables) {
      if (m.cell !== null && (m.cell < 0 || m.cell >= level.width * level.height))
        return false;
      if (m.kind === "mirror") {
        const r = m.reflectivity;
        if (!r || r.cmp(Fraction.ZERO) <= 0 || r.cmp(Fraction.ONE) > 0) return false;
      }
      if (m.kind === "splitter") {
        const s = m.splitRatio;
        if (!s || s.cmp(Fraction.ZERO) < 0 || s.cmp(Fraction.ONE) > 0) return false;
      }
    }
  }
  return doc.evidence.length <= 30;
}

function freshDoc(): OpticsDocument {
  const level = findLevel("ruin-light-01");
  return initialOpticsDoc(level.id, cloneMovables(level.movables));
}

export function loadOptics(): {
  doc: OpticsDocument;
  notice: string;
  recovery: boolean;
} {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { doc: freshDoc(), notice: "", recovery: false };
    const v: unknown = JSON.parse(raw);
    if (obj(v) && validDocument(v)) {
      const doc = v as OpticsDocument;
      for (const id of Object.keys(doc.levels))
        doc.levels[id].movables = doc.levels[id].movables.map(reviveMovable);
      return {
        doc,
        notice: "已恢复各关镜阵与历史证据；未结算的封门状态保持原样。",
        recovery: false,
      };
    }
    // 尝试旧版迁移
    if (obj(v) && Array.isArray((v as Record<string, unknown>).movables)) {
      const migrated = migrateLegacy(v as Record<string, unknown>);
      if (migrated && soundMigratedDoc(migrated))
        return {
          doc: migrated,
          notice: "已将旧版光路存档迁移为多关结构，镜阵与证据均保留。",
          recovery: false,
        };
    }
    return {
      doc: freshDoc(),
      notice: "光路存档校验未通过，已开启临时镜阵，旧存档未被覆盖。",
      recovery: true,
    };
  } catch {
    return {
      doc: freshDoc(),
      notice: "无法读取光路存档，本次仍可布阵。",
      recovery: true,
    };
  }
}

export function saveOptics(doc: OpticsDocument): boolean {
  try {
    localStorage.setItem(storageKey, JSON.stringify(doc));
    return true;
  } catch {
    return false;
  }
}

// 供测试/初始化使用
export { makeLevelState };
