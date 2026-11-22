import { ShieldCheck, ShieldQuestion, ShieldX, Info, Recycle } from "lucide-react";
import type { OpticsLevel, ReceiverVerdict, SolverReport } from "../model/types";
import { coordName } from "../lib/solver";
import { headingName } from "../model/types";
import { COLOR_META } from "./colors";
export function VerdictPanel({
  level,
  report,
}: {
  level: OpticsLevel;
  report: SolverReport;
}) {
  return (
    <section className="opt-panel">
      <div className="opt-panel-head">
        <h3>阈值判定依据</h3>
        <small>同色光在接收器相加 · 精确分数比较，不看动画帧</small>
      </div>
      <div className="opt-verdict-list">
        {report.receivers.map((r) => (
          <VerdictRow key={r.cell} level={level} r={r} />
        ))}
      </div>

      {report.unstableLoops.length > 0 && (
        <div className="opt-unstable-box">
          <p className="opt-group-label danger">
            <Recycle size={13} /> 无法稳定的无损环（{report.unstableLoops.length}）
          </p>
          {report.unstableLoops.map((loop, i) => (
            <div key={i} className="opt-loop-item">
              <p>{loop.detail}</p>
              <p className="opt-loop-fixtures">
                相关机关：
                {loop.fixtures.length
                  ? loop.fixtures.map((f) => <code key={f}>{f.slice(0, 8)}</code>).reduce<React.ReactNode[]>((acc, el, idx) => idx ? [...acc, "、", el] : [el], [])
                  : "（仅由空格直通构成）"}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function VerdictRow({
  level,
  r,
}: {
  level: OpticsLevel;
  r: ReceiverVerdict;
}) {
  const meta = COLOR_META[r.color];
  const label = level.fixed[r.cell]?.label ?? "接光符";
  const isWard = label.includes("警戒");
  const icon =
    r.verdict === "reached" ? (
      <ShieldCheck size={16} className="v-ok" />
    ) : r.verdict === "pending" ? (
      <ShieldQuestion size={16} className="v-pending" />
    ) : (
      <ShieldX size={16} className="v-bad" />
    );
  const verdictText =
    r.verdict === "reached"
      ? isWard
        ? "符文达标 → 触发陷阱"
        : "达标"
      : r.verdict === "pending"
        ? "待定（依赖无损环，保持关门）"
        : `不足，差 ${r.margin.neg().format(3)}`;

  return (
    <div className={`opt-verdict ${r.verdict} ${isWard ? "ward" : ""}`}>
      <div className="opt-verdict-top">
        <span className="opt-verdict-title">
          {icon}
          <i style={{ background: meta.hex }} className="opt-color-dot" />
          {label}
          <em>
            {coordName(r.cell, level.width)} · {meta.name}
          </em>
        </span>
        <span className={`opt-verdict-badge ${r.verdict}`}>{verdictText}</span>
      </div>
      <div className="opt-threshold-line">
        <div className="opt-bar">
          <div
            className="opt-bar-fill"
            style={{
              width: `${Math.min(100, Math.max(0, (r.total.toNumber() / r.threshold.toNumber()) * 100))}%`,
              background: meta.hex,
            }}
          />
        </div>
        <span className="opt-fraction">
          {r.total.format(3)} / 阈值 {r.threshold.format(3)}
        </span>
      </div>
      <details className="opt-contrib">
        <summary>
          <Info size={12} /> 相加明细（{r.contributions.length} 束同色光）
        </summary>
        {r.contributions.length === 0 ? (
          <p className="opt-empty">没有同色光到达。</p>
        ) : (
          <ul>
            {r.contributions.map((c, i) => (
              <li key={i}>
                来自 {headingName(c.heading)} 向入射：<code>{c.energy.format(4)}</code>
              </li>
            ))}
            <li className="opt-sum">
              合计 <code>{r.total.format(4)}</code>
              {r.verdict !== "pending" && (
                <>
                  ，阈值余量 <code>{r.margin.format(3)}</code>
                </>
              )}
            </li>
          </ul>
        )}
      </details>
    </div>
  );
}
