import { Fraction } from "../lib/fraction";
import type { FixedCell, Movable, OpticsLevel } from "./types";

// 工具：构造固定格
const fx = (cell: FixedCell): FixedCell => cell;

let uidCounter = 0;
export function makeMovable(partial: Omit<Movable, "uid">): Movable {
  uidCounter += 1;
  return { uid: `mv-${uidCounter}-${Math.random().toString(36).slice(2, 7)}`, ...partial };
}

// 镜面反射率预设
const R_PERFECT = Fraction.ONE; // 无损
const R_WORN = new Fraction(85n, 100n); // 0.85，损耗 0.15
const R_AGED = new Fraction(70n, 100n); // 0.70

export const OPTICS_LEVELS: OpticsLevel[] = [
  {
    id: "ruin-light-01",
    name: "回廊日晷",
    brief:
      "琥珀光源长明。移动镜面把光引到封门前的接光符；遮光石可截断杂光。注意磨损镜面会损失能量，分光晶体各路之和不超过输入。",
    width: 9,
    height: 7,
    doorCell: 1 * 9 + 8, // 与接光符同列的封门
    fixed: {
      // 光源 (5,0) 朝东；接光符 (1,8) 从西侧入射
      [5 * 9 + 0]: fx({ kind: "source", color: "amber", power: Fraction.ONE, label: "琥珀光源" }),
      [1 * 9 + 8]: fx({
        kind: "receiver",
        color: "amber",
        threshold: new Fraction(60n, 100n),
        label: "接光符 · 封门",
      }),
      [1 * 9 + 8 + 9]: fx({ kind: "door", label: "封门" }), // (2,8)
      // 干扰墙：放在不阻断标准两镜解的位置
      [0 * 9 + 3]: fx({ kind: "wall" }),
      [3 * 9 + 5]: fx({ kind: "wall" }),
      [6 * 9 + 4]: fx({ kind: "wall" }),
      [6 * 9 + 5]: fx({ kind: "wall" }),
    },
    movables: [
      // 第一面已就位：(5,4) '/' 把东向光折向北；玩家需把第二面放到 (1,4) '/' 再折向东直达接光符
      makeMovable({ kind: "mirror", cell: 5 * 9 + 4, orientation: "/", reflectivity: R_WORN }),
      makeMovable({ kind: "mirror", cell: null, orientation: "/", reflectivity: R_PERFECT }),
      // 第三面老化镜（0.70）：替代磨损镜后 0.70 ≥ 0.60 仍可开门但余量更小，制造损耗取舍
      makeMovable({ kind: "mirror", cell: null, orientation: "/", reflectivity: R_AGED }),
      makeMovable({ kind: "splitter", cell: null, handedness: 1, splitRatio: new Fraction(40n, 100n) }),
      makeMovable({ kind: "blocker", cell: null }),
    ],
  },
  {
    id: "ruin-light-02",
    name: "三色警戒室",
    brief:
      "三色光源各自独立、互不影响。封门需三色接光符同时达标；警戒符文一旦收到超过阈值的能量就会激活陷阱。室内存在可组成无损环的镜面，请观察「不稳定」提示。",
    width: 10,
    height: 8,
    doorCell: 4 * 10 + 9,
    fixed: {
      // 三色光源（左缘）
      [1 * 10 + 0]: fx({ kind: "source", color: "amber", power: Fraction.ONE, label: "琥珀光源" }),
      [3 * 10 + 0]: fx({ kind: "source", color: "azure", power: Fraction.ONE, label: "青蓝光源" }),
      [6 * 10 + 0]: fx({ kind: "source", color: "rose", power: Fraction.ONE, label: "玫红光源" }),
      // 三个接光符（右缘上中下）
      [1 * 10 + 9]: fx({ kind: "receiver", color: "amber", threshold: new Fraction(50n, 100n), label: "琥珀接光符" }),
      [3 * 10 + 9]: fx({ kind: "receiver", color: "azure", threshold: new Fraction(50n, 100n), label: "青蓝接光符" }),
      [6 * 10 + 9]: fx({ kind: "receiver", color: "rose", threshold: new Fraction(50n, 100n), label: "玫红接光符" }),
      // 警戒符文：任意色超过 0.8 即触发陷阱（用玫红做示例）
      [4 * 10 + 5]: fx({ kind: "receiver", color: "rose", threshold: new Fraction(80n, 100n), label: "警戒符文" }),
      [4 * 10 + 9]: fx({ kind: "door", label: "封门" }),
      // 石墙阵
      [2 * 10 + 4]: fx({ kind: "wall" }),
      [5 * 10 + 4]: fx({ kind: "wall" }),
      [0 * 10 + 7]: fx({ kind: "wall" }),
      [7 * 10 + 7]: fx({ kind: "wall" }),
    },
    movables: [
      makeMovable({ kind: "mirror", cell: 1 * 10 + 3, orientation: "/", reflectivity: R_PERFECT }),
      makeMovable({ kind: "mirror", cell: null, orientation: "\\", reflectivity: R_PERFECT }),
      makeMovable({ kind: "mirror", cell: 3 * 10 + 3, orientation: "/", reflectivity: R_WORN }),
      makeMovable({ kind: "mirror", cell: null, orientation: "/", reflectivity: R_WORN }),
      makeMovable({ kind: "mirror", cell: 6 * 10 + 3, orientation: "/", reflectivity: R_AGED }),
      makeMovable({ kind: "mirror", cell: null, orientation: "\\", reflectivity: R_PERFECT }),
      makeMovable({ kind: "splitter", cell: null, handedness: 0, splitRatio: new Fraction(50n, 100n) }),
      makeMovable({ kind: "splitter", cell: null, handedness: 1, splitRatio: new Fraction(30n, 100n) }),
      makeMovable({ kind: "blocker", cell: null }),
      makeMovable({ kind: "blocker", cell: null }),
    ],
  },
];

export function findLevel(id: string): OpticsLevel {
  return OPTICS_LEVELS.find((l) => l.id === id) ?? OPTICS_LEVELS[0];
}

// 深拷贝关卡机关（用于重置与新文档）
export function cloneMovables(list: Movable[]): Movable[] {
  return list.map((m) => ({
    ...m,
    reflectivity: m.reflectivity ? new Fraction(m.reflectivity.num, m.reflectivity.den) : undefined,
    splitRatio: m.splitRatio ? new Fraction(m.splitRatio.num, m.splitRatio.den) : undefined,
  }));
}
