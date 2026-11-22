import type { ColorId } from "../model/types";

export const COLOR_META: Record<
  ColorId,
  { name: string; hex: string; glow: string; soft: string }
> = {
  amber: { name: "琥珀", hex: "#e1b873", glow: "#f2cf8e", soft: "rgba(225,184,115,0.16)" },
  azure: { name: "青蓝", hex: "#7db8d8", glow: "#a5d4ec", soft: "rgba(125,184,216,0.16)" },
  rose: { name: "玫红", hex: "#d88aa6", glow: "#f0aec6", soft: "rgba(216,138,166,0.16)" },
};

export const CELL = 56; // 每格像素（SVG 坐标）
export const GAP = 2;
