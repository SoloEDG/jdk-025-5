import { Scale, FlaskConical } from "lucide-react";
import type { SolverReport } from "../model/types";

export function AuditPanel({ report }: { report: SolverReport }) {
  const a = report.audit;
  const rows: { label: string; value: string; cls?: string }[] = [
    { label: "光源总发射", value: a.emitted.format(4) },
    { label: "镜面损耗", value: a.mirrorLoss.format(4) },
    { label: "墙 / 遮光石吸收", value: a.blocked.format(4) },
    { label: "接光符吸收", value: a.absorbedReceivers.format(4) },
    { label: "封门吸收", value: a.absorbedDoor.format(4) },
    { label: "溢出边界", value: a.leakedEdge.format(4) },
    {
      label: "守恒残差（应=0）",
      value: a.residual.format(6),
      cls: a.residual.isZero() ? "ok" : "warn",
    },
  ];
  return (
    <section className="opt-panel">
      <div className="opt-panel-head">
        <h3>
          <Scale size={15} /> 能量审计与求解依据
        </h3>
        <small>分光各路之和 ≤ 输入 · 整体稳态</small>
      </div>
      <ul className="opt-audit">
        {rows.map((r) => (
          <li key={r.label}>
            <span>{r.label}</span>
            <code className={r.cls ?? ""}>{r.value}</code>
          </li>
        ))}
      </ul>
      <div className="opt-float-note">
        <FlaskConical size={13} />
        <span>
          浮点交叉验证：迭代 {report.floatIterations} 次，最大偏差{" "}
          {report.stable ? report.floatMaxDelta.toExponential(2) : "—（系统奇异）"}
          。阈值仅按精确分数判定，近似误差跨过阈值时继续以精确解求证，不据此开门。
        </span>
      </div>
      <ul className="opt-solver-notes">
        {report.notes.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    </section>
  );
}
