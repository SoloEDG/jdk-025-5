import type { Movable, OpticsLevel } from "./types";

// 镜阵指纹：仅由「机关种类 + 所在格 + 朝向 + 参数」决定，与 uid 无关。
// 改变陷阱/符文阈值属于关卡配置变化，会通过 levelId 与配置版本另行区分。
export function fingerprint(level: OpticsLevel, movables: Movable[]): string {
  const parts = movables
    .filter((m) => m.cell !== null)
    .map((m) => {
      const cell = m.cell;
      const orient = m.orientation ?? "-";
      const refl = m.reflectivity ? m.reflectivity.toJSON() : "-";
      const hand = m.handedness ?? "-";
      const split = m.splitRatio ? m.splitRatio.toJSON() : "-";
      return `${m.kind}@${cell}/${orient}/r${refl}/h${hand}/s${split}`;
    })
    .sort();
  return `${level.id}::${parts.join("|")}`;
}
