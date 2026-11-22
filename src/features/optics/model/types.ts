import type { Fraction } from "../lib/fraction";

export type ColorId = "amber" | "azure" | "rose";

// 四向（笛卡尔方向）
export type Heading = 0 | 1 | 2 | 3; // 0=东 1=南 2=西 3=北
export const HEADINGS: Heading[] = [0, 1, 2, 3];
export const DELTA: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];
export function opposite(h: Heading): Heading {
  return ((h + 2) % 4) as Heading;
}
export function headingName(h: Heading): string {
  return ["东", "南", "西", "北"][h];
}

// 固定格（关卡布局，玩家不可移动）
export type FixedKind =
  | "wall" // 石墙：光到此终止
  | "source" // 持续光源
  | "receiver" // 接收符（同色相加，阈值判定）
  | "door"; // 封门（由接收器联动，本身吸光）

export interface FixedCell {
  kind: FixedKind;
  color?: ColorId; // source / receiver 的颜色
  power?: Fraction; // source 的持续输出能量
  threshold?: Fraction; // receiver 阈值
  label?: string;
}

// 可移动机关（玩家可拾取、放置、旋转、调参）
export type MovableKind = "mirror" | "splitter" | "blocker";

export interface Movable {
  uid: string;
  kind: MovableKind;
  cell: number | null; // null = 在备料盘里
  // 镜面朝向：'/' 或 '\'
  orientation?: "/" | "\\";
  // 镜面反射率（损耗 = 1 - reflectivity）
  reflectivity?: Fraction;
  // 分光晶体：主路朝向（与入射同轴向的输出）与分流比
  // 直通保留 heading，侧路取垂直方向（由 handedness 决定左/右）
  handedness?: 0 | 1; // 0=逆时针侧路，1=顺时针侧路
  splitRatio?: Fraction; // 侧路所占比例，直通 = 1 - splitRatio
}

// 关卡静态定义（陷阱阈值等“封门设计”属于配置）
export interface OpticsLevel {
  id: string;
  name: string;
  brief: string;
  width: number;
  height: number;
  fixed: Record<number, FixedCell>;
  // 初始机关摆放（也是刷新恢复前的出厂布局）
  movables: Movable[];
  // 目标接收器：全部达标且无符文触发陷阱才可开门
  doorCell: number;
}

// 一条带颜色/方向的“光束变量”：进入某格的光
export interface BeamKey {
  cell: number;
  heading: Heading; // 传播方向
  color: ColorId;
}

export interface BeamResult {
  key: BeamKey;
  energy: Fraction; // 稳态能量（精确值）
  reaches: boolean; // 是否真正连通（>0）
}

// 一段用于绘制的光路（相邻两格之间）
export interface BeamSegment {
  from: number; // 格 id（或来自边界 -1）
  to: number;
  heading: Heading;
  color: ColorId;
  energy: Fraction;
}

// 阻断记录
export interface BlockRecord {
  cell: number;
  heading: Heading;
  color: ColorId;
  energy: Fraction;
  reason: "wall" | "blocker" | "edge" | "receiver" | "door" | "source";
}

// 接收器判定
export type Verdict = "pending" | "reached" | "below";
export interface ReceiverVerdict {
  cell: number;
  color: ColorId;
  threshold: Fraction;
  total: Fraction; // 同色稳态能量之和
  margin: Fraction; // total - threshold
  verdict: Verdict;
  // 判定依据：参与相加的各束（cell, heading, energy）
  contributions: { heading: Heading; energy: Fraction }[];
}

// 不稳定无损环
export interface UnstableLoop {
  fixtures: string[]; // 环上机关 uid（镜面/晶体）
  cells: number[];
  colors: ColorId[];
  gain: Fraction; // 环增益（无损=1）
  detail: string;
}

export interface SolverReport {
  stable: boolean;
  beams: BeamResult[];
  segments: BeamSegment[];
  blocks: BlockRecord[];
  receivers: ReceiverVerdict[];
  unstableLoops: UnstableLoop[];
  // 全局能量审计：输入总和、各机关损耗、溢出边界、接收器吸收
  audit: EnergyAudit;
  // 浮点交叉验证与精确值的最大偏差（用于说明“近似误差”处理）
  floatMaxDelta: number;
  floatIterations: number;
  // 求解过程说明（展示阈值判定依据）
  notes: string[];
}

export interface EnergyAudit {
  emitted: Fraction; // 光源总输出
  mirrorLoss: Fraction; // 镜面损耗合计
  splitterLoss: Fraction; // 分光损耗（若有）
  absorbedReceivers: Fraction;
  absorbedDoor: Fraction;
  blocked: Fraction; // 墙/遮光石吸收
  leakedEdge: Fraction; // 溢出边界
  // 守恒残差（应为 0）
  residual: Fraction;
}

// 一次“提交扫描”后冻结的证据（版本化，改阵不覆盖）
export interface Evidence {
  id: string;
  levelId: string;
  scannedAt: number;
  // 扫描时镜阵指纹
  fingerprint: string;
  movables: Movable[];
  // 判定快照（数字冻结）
  receivers: {
    cell: number;
    color: ColorId;
    threshold: string;
    total: string;
    verdict: Verdict;
  }[];
  stable: boolean;
  unstableLoopCells: number[];
  doorOpen: boolean;
  trapArmed: boolean;
  floatMaxDelta: number;
}

// 单个关卡的运行状态（镜阵、陷阱、结算各自独立）
export interface OpticsLevelState {
  levelId: string;
  // 工作镜阵（预览态，未提交也保存，刷新恢复）
  movables: Movable[];
  // 已激活陷阱（仅本关、历史观测），及其触发时镜阵指纹
  trapSprung: boolean;
  trapFingerprint: string | null;
  // 本关是否已开门结算（关门重开不可重领）
  claimed: boolean;
}

// 持久化文档
export interface OpticsDocument {
  version: 1;
  levelId: string; // 当前所在关卡
  // 各关卡独立状态，切换关卡不会丢失历史
  levels: Record<string, OpticsLevelState>;
  // 全部扫描证据（跨关卡保留，按时间倒序）
  evidence: Evidence[];
}
