import { useMemo } from "react";
import {
  AlertTriangle,
  BrickWall,
  Gem,
  Lamp,
  OctagonX,
  DoorClosed,
} from "lucide-react";
import type {
  BeamSegment,
  BlockRecord,
  Movable,
  OpticsLevel,
  SolverReport,
} from "../model/types";
import { coordName } from "../lib/solver";
import { CELL, COLOR_META } from "./colors";

interface Props {
  level: OpticsLevel;
  movables: Movable[];
  report: SolverReport;
  selectedUid: string | null;
  unstableCells: Set<number>;
  onCellClick: (cell: number) => void;
  onFixtureClick: (m: Movable) => void;
}

export function OpticsBoard({
  level,
  movables,
  report,
  selectedUid,
  unstableCells,
  onCellClick,
  onFixtureClick,
}: Props) {
  const W = level.width;
  const H = level.height;
  const fixtureAt = useMemo(() => {
    const map = new Map<number, Movable>();
    for (const m of movables) if (m.cell !== null) map.set(m.cell, m);
    return map;
  }, [movables]);

  const center = (cell: number) => {
    const x = cell % W;
    const y = Math.floor(cell / W);
    return { cx: x * CELL + CELL / 2, cy: y * CELL + CELL / 2 };
  };

  return (
    <div className="optics-board-scroll">
      <div
        className="optics-board"
        style={{
          gridTemplateColumns: `repeat(${W}, ${CELL}px)`,
          gridTemplateRows: `repeat(${H}, ${CELL}px)`,
        }}
      >
        {/* 格子层 */}
        {Array.from({ length: W * H }, (_, cell) => {
          const fixed = level.fixed[cell];
          const fixture = fixtureAt.get(cell);
          const unstable = unstableCells.has(cell);
          const blockedHere = report.blocks.filter((b) => b.cell === cell);
          return (
            <button
              key={cell}
              className={[
                "opt-cell",
                fixed ? `opt-fixed opt-${fixed.kind}` : "",
                fixture ? "opt-has-fixture" : "",
                unstable ? "opt-unstable" : "",
                selectedUid && !fixture ? "opt-droppable" : "",
              ].join(" ")}
              style={{ width: CELL, height: CELL }}
              onClick={() => (fixture ? onFixtureClick(fixture) : onCellClick(cell))}
              title={`${coordName(cell, W)}`}
            >
              <span className="opt-coord">{coordName(cell, W)}</span>
              {fixed && <FixedGlyph kind={fixed.kind} />}
              {fixture && <FixtureGlyph movable={fixture} selected={selectedUid === fixture.uid} />}
              {blockedHere.length > 0 && (
                <span className="opt-block-badge" title={blockReason(blockedHere[0])}>
                  <OctagonX size={13} />
                </span>
              )}
              {unstable && (
                <span className="opt-loop-badge" title="无损环：无有限稳态">
                  <AlertTriangle size={13} />
                </span>
              )}
            </button>
          );
        })}

        {/* SVG 光束层 */}
        <svg
          className="opt-beam-layer"
          width={W * CELL}
          height={H * CELL}
          viewBox={`0 0 ${W * CELL} ${H * CELL}`}
          style={{ width: W * CELL, height: H * CELL }}
        >
          {report.segments.map((seg, i) => (
            <BeamLine key={i} seg={seg} center={center} />
          ))}
          {report.blocks.map((blk, i) => (
            <BlockMark key={`b${i}`} blk={blk} center={center} />
          ))}
        </svg>
      </div>
    </div>
  );
}

function BeamLine({
  seg,
  center,
}: {
  seg: BeamSegment;
  center: (cell: number) => { cx: number; cy: number };
}) {
  const a = center(seg.from);
  const b = center(seg.to);
  const meta = COLOR_META[seg.color];
  const intensity = Math.min(1, seg.energy.toNumber());
  return (
    <g>
      <line
        x1={a.cx}
        y1={a.cy}
        x2={b.cx}
        y2={b.cy}
        stroke={meta.hex}
        strokeWidth={7}
        strokeLinecap="round"
        opacity={0.16 + intensity * 0.18}
      />
      <line
        x1={a.cx}
        y1={a.cy}
        x2={b.cx}
        y2={b.cy}
        stroke={meta.glow}
        strokeWidth={2.2}
        strokeLinecap="round"
        opacity={0.45 + intensity * 0.5}
      />
    </g>
  );
}

function BlockMark({
  blk,
  center,
}: {
  blk: BlockRecord;
  center: (cell: number) => { cx: number; cy: number };
}) {
  const { cx, cy } = center(blk.cell);
  const meta = COLOR_META[blk.color];
  return (
    <g>
      <circle cx={cx} cy={cy} r={9} fill="none" stroke={meta.hex} strokeWidth={1.5} opacity={0.8} />
      <line x1={cx - 5} y1={cy - 5} x2={cx + 5} y2={cy + 5} stroke={meta.hex} strokeWidth={1.6} />
      <line x1={cx + 5} y1={cy - 5} x2={cx - 5} y2={cy + 5} stroke={meta.hex} strokeWidth={1.6} />
    </g>
  );
}

function FixedGlyph({ kind }: { kind: string }) {
  if (kind === "wall")
    return (
      <span className="opt-glyph opt-glyph-wall" title="石墙：光到此终止">
        <BrickWall size={20} />
      </span>
    );
  if (kind === "source")
    return (
      <span className="opt-glyph opt-glyph-source" title="持续光源">
        <Lamp size={20} />
      </span>
    );
  if (kind === "receiver")
    return (
      <span className="opt-glyph opt-glyph-receiver" title="接光符/符文">
        <Gem size={19} />
      </span>
    );
  if (kind === "door")
    return (
      <span className="opt-glyph opt-glyph-door" title="封门">
        <DoorClosed size={20} />
      </span>
    );
  return null;
}

function FixtureGlyph({ movable, selected }: { movable: Movable; selected: boolean }) {
  if (movable.kind === "blocker")
    return (
      <span className={`opt-glyph opt-glyph-blocker ${selected ? "is-selected" : ""}`} title="遮光石：阻断光束">
        <OctagonX size={20} />
      </span>
    );
  if (movable.kind === "mirror")
    return (
      <span
        className={`opt-glyph opt-glyph-mirror m-${(movable.orientation ?? "/").replace("/", "slash").replace("\\", "back")} ${selected ? "is-selected" : ""}`}
        title={`镜面 ${movable.orientation} · 反射率 ${movable.reflectivity?.format(2)}`}
      >
        <i />
      </span>
    );
  return (
    <span className={`opt-glyph opt-glyph-splitter ${selected ? "is-selected" : ""}`} title="分光晶体">
      <span className="split-diamond" />
    </span>
  );
}

function blockReason(b: BlockRecord): string {
  const map: Record<BlockRecord["reason"], string> = {
    wall: "石墙吸收",
    blocker: "遮光石阻断",
    edge: "溢出边界",
    receiver: "接光符吸收",
    door: "封门吸收",
    source: "光源格吸收",
  };
  return `${map[b.reason]} · 能量 ${b.energy.format(3)}`;
}
