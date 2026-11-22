import { History, Lock, Bug, DoorOpen, ScanLine } from "lucide-react";
import type { Evidence, OpticsDocument, OpticsLevel, OpticsLevelState } from "../model/types";
import { Fraction } from "../lib/fraction";
import { coordName } from "../lib/solver";
import { COLOR_META } from "./colors";

interface Props {
  level: OpticsLevel;
  doc: OpticsDocument;
  levelState: OpticsLevelState;
  currentFingerprint: string;
  onClaim: () => void;
}

export function EvidencePanel({ level, doc, levelState, currentFingerprint, onClaim }: Props) {
  const list = doc.evidence.filter((e) => e.levelId === level.id);
  const latest = list[0];
  const claimed = levelState.claimed;

  return (
    <section className="opt-panel">
      <div className="opt-panel-head">
        <h3>
          <History size={15} /> 扫描证据（版本化冻结）
        </h3>
        <small>只提交当前镜阵结果 · 改阵后旧数字保留，需重新扫描</small>
      </div>

      <div className="opt-evidence-status">
        {levelState.trapSprung && (
          <span className="opt-tag danger">
            <Bug size={13} /> 陷阱曾激活
            {levelState.trapFingerprint && levelState.trapFingerprint !== currentFingerprint && (
              <em>（当前镜阵已改变，陷阱状态为历史观测）</em>
            )}
          </span>
        )}
        {claimed && (
          <span className="opt-tag ok">
            <Lock size={13} /> 本关已结算，关门重开不重复领取
          </span>
        )}
      </div>

      {list.length === 0 && <p className="opt-empty">尚无扫描。调整镜阵后点击「提交扫描」冻结当前结果。</p>}

      <div className="opt-evidence-list">
        {list.map((ev, i) => (
          <EvidenceCard
            key={ev.id}
            ev={ev}
            level={level}
            isLatest={i === 0}
            matchesCurrent={ev.fingerprint === currentFingerprint}
          />
        ))}
      </div>

      <div className="opt-claim-row">
        <button
          className="primary"
          disabled={!latest || !latest.doorOpen || claimed}
          onClick={onClaim}
        >
          <DoorOpen size={14} />
          {claimed ? "已结算（不可重领）" : "开门并结算文物"}
        </button>
        {!latest && <small>需先扫描得到开门证据</small>}
        {latest && !latest.doorOpen && !claimed && (
          <small>最新扫描未满足开门条件（含待定/陷阱）</small>
        )}
      </div>
    </section>
  );
}

function EvidenceCard({
  ev,
  level,
  isLatest,
  matchesCurrent,
}: {
  ev: Evidence;
  level: OpticsLevel;
  isLatest: boolean;
  matchesCurrent: boolean;
}) {
  return (
    <article className={`opt-evidence ${isLatest ? "latest" : "old"}`}>
      <header>
        <ScanLine size={13} />
        <time>{new Date(ev.scannedAt).toLocaleTimeString("zh-CN")}</time>
        {isLatest && <span className="opt-tag">最新</span>}
        <span className={`opt-tag ${ev.stable ? "ok" : "danger"}`}>
          {ev.stable ? "稳定" : "不稳定"}
        </span>
        {ev.trapArmed && <span className="opt-tag danger">陷阱</span>}
        {ev.doorOpen && <span className="opt-tag ok">可开门</span>}
        {!matchesCurrent && <span className="opt-tag warn">旧镜阵（仅观测）</span>}
      </header>
      <ul className="opt-evidence-receivers">
        {ev.receivers.map((r) => {
          const f = Fraction.parse(r.total);
          const t = Fraction.parse(r.threshold);
          const label = level.fixed[r.cell]?.label ?? "接光符";
          return (
            <li key={r.cell} data-verdict={r.verdict}>
              <i
                className="opt-color-dot"
                style={{ background: COLOR_META[r.color].hex }}
              />
              <span>
                {label}
                <em>{coordName(r.cell, level.width)}</em>
              </span>
              <code>
                {f?.format(3)} / {t?.format(3)}
              </code>
              <b className={`v-${r.verdict}`}>
                {r.verdict === "reached" ? "达标" : r.verdict === "pending" ? "待定" : "不足"}
              </b>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
