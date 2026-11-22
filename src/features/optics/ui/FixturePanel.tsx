import { RotateCw, ArrowDownToLine, Hand } from "lucide-react";
import { Fraction } from "../lib/fraction";
import { decimalToFraction } from "../lib/fraction";
import type { Movable, OpticsLevel } from "../model/types";
import { coordName } from "../lib/solver";
import { kindName } from "../model/opticsReducer";
import { useState } from "react";

interface Props {
  level: OpticsLevel;
  movables: Movable[];
  selectedUid: string | null;
  onPick: (uid: string) => void;
  onReturn: (uid: string) => void;
  onRotate: (uid: string) => void;
  onSetReflectivity: (uid: string, v: Fraction) => void;
  onToggleHandedness: (uid: string) => void;
  onSetSplit: (uid: string, v: Fraction) => void;
}

export function FixturePanel(props: Props) {
  const { level, movables, selectedUid } = props;
  const tray = movables.filter((m) => m.cell === null);
  const placed = movables.filter((m) => m.cell !== null);
  const selected = movables.find((m) => m.uid === selectedUid) ?? null;

  return (
    <section className="opt-panel">
      <div className="opt-panel-head">
        <h3>机关阵</h3>
        <small>拾取后点格放置 · 点格上机关可旋转/调校</small>
      </div>

      <div className="opt-fixture-groups">
        <div>
          <p className="opt-group-label">
            <Hand size={12} /> 备料盘（未上阵）
          </p>
          <div className="opt-tray">
            {tray.length === 0 && <span className="opt-empty">备料盘已空</span>}
            {tray.map((m) => (
              <button
                key={m.uid}
                className={`opt-chip ${selectedUid === m.uid ? "active" : ""}`}
                onClick={() => props.onPick(m.uid)}
              >
                {kindName(m.kind)}
                {m.kind === "mirror" && (
                  <em>
                    {m.orientation} · {m.reflectivity?.format(2)}
                  </em>
                )}
                {m.kind === "splitter" && (
                  <em>分流 {m.splitRatio?.format(2)}</em>
                )}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="opt-group-label">已放置（{placed.length}）</p>
          <div className="opt-tray">
            {placed.length === 0 && <span className="opt-empty">尚未放置机关</span>}
            {placed.map((m) => (
              <button
                key={m.uid}
                className={`opt-chip placed ${selectedUid === m.uid ? "active" : ""}`}
                onClick={() => props.onPick(m.uid)}
                title="点击后可改放到其他空格"
              >
                {kindName(m.kind)}
                <em>{coordName(m.cell as number, level.width)}</em>
              </button>
            ))}
          </div>
        </div>
      </div>

      {selected && <Inspector mov={selected} width={level.width} {...props} />}
    </section>
  );
}

function Inspector({
  mov,
  width,
  onReturn,
  onRotate,
  onSetReflectivity,
  onToggleHandedness,
  onSetSplit,
}: Props & { mov: Movable; width: number }) {
  const [reflText, setReflText] = useState(
    mov.reflectivity ? mov.reflectivity.format(2) : "1",
  );
  const [splitText, setSplitText] = useState(
    mov.splitRatio ? mov.splitRatio.format(2) : "0",
  );

  return (
    <div className="opt-inspector">
      <div className="opt-inspector-head">
        <strong>
          调校 · {kindName(mov.kind)}
          {mov.cell !== null && (
            <span className="opt-inspector-coord">
              @{coordName(mov.cell, width)}
            </span>
          )}
        </strong>
        <button className="opt-mini-btn" onClick={() => onReturn(mov.uid)}>
          <ArrowDownToLine size={13} /> 收回
        </button>
      </div>

      {mov.kind === "mirror" && (
        <div className="opt-field">
          <button className="opt-mini-btn" onClick={() => onRotate(mov.uid)}>
            <RotateCw size={13} /> 旋转（{mov.orientation} →{" "}
            {mov.orientation === "/" ? "\\" : "/"}）
          </button>
          <label className="opt-input-line">
            反射率（损耗 = 1 − r）
            <input
              inputMode="decimal"
              value={reflText}
              onChange={(e) => setReflText(e.target.value)}
              onBlur={() => {
                const f = decimalToFraction(reflText);
                if (f && f.cmp(Fraction.ZERO) > 0 && f.cmp(Fraction.ONE) <= 0)
                  onSetReflectivity(mov.uid, f);
                else setReflText(mov.reflectivity?.format(2) ?? "1");
              }}
            />
          </label>
        </div>
      )}

      {mov.kind === "splitter" && (
        <div className="opt-field">
          <button className="opt-mini-btn" onClick={() => onToggleHandedness(mov.uid)}>
            侧路方向：{mov.handedness === 1 ? "顺时针偏转" : "逆时针偏转"}
          </button>
          <label className="opt-input-line">
            侧路分流比（直通 = 1 − 分流）
            <input
              inputMode="decimal"
              value={splitText}
              onChange={(e) => setSplitText(e.target.value)}
              onBlur={() => {
                const f = decimalToFraction(splitText);
                if (f && f.cmp(Fraction.ZERO) >= 0 && f.cmp(Fraction.ONE) <= 0)
                  onSetSplit(mov.uid, f);
                else setSplitText(mov.splitRatio?.format(2) ?? "0");
              }}
            />
          </label>
          <small className="opt-hint">
            两路系数之和恒为 1，各路能量总和不超过输入（无中生有被禁止）。
          </small>
        </div>
      )}

      {mov.kind === "blocker" && (
        <small className="opt-hint">遮光石吸收所有到达它的光束，用于截断杂光与防止回绕。</small>
      )}
    </div>
  );
}
