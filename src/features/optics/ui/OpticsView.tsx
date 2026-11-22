import { useMemo, useState } from "react";
import { ScanLine, RotateCcw, Save, Eye, Sparkles } from "lucide-react";
import { useOptics } from "../model/useOptics";
import { OpticsBoard } from "./OpticsBoard";
import { FixturePanel } from "./FixturePanel";
import { VerdictPanel } from "./VerdictPanel";
import { AuditPanel } from "./AuditPanel";
import { EvidencePanel } from "./EvidencePanel";

export function OpticsView() {
  const {
    state,
    dispatch,
    level,
    levelState,
    levels,
    preview,
    fingerprint: fp,
    saved,
    switchLevel,
    resetArray,
    scan,
    claimDoor,
  } = useOptics();

  const [confirmTrap, setConfirmTrap] = useState(false);
  const unstableCells = useMemo(
    () => new Set(preview.unstableLoops.flatMap((l) => l.cells)),
    [preview],
  );

  const handleCellClick = (cell: number) => {
    if (!state.selectedUid) return;
    // 固定格（墙/光源/接收器/门）不可放置机关
    if (level.fixed[cell]) return;
    dispatch({ type: "place", cell });
  };

  const handleFixtureClick = (m: { uid: string }) => {
    // 点击已放置机关：选中它（之后点空格可移动），镜面则可在下方调校
    dispatch({ type: "pick", uid: m.uid });
  };

  const requestScan = () => {
    // 若预览将触发陷阱，先二次确认
    const willTrap = preview.receivers.some(
      (r) =>
        (level.fixed[r.cell]?.label ?? "").includes("警戒") &&
        r.verdict === "reached",
    );
    if (willTrap && !confirmTrap) {
      setConfirmTrap(true);
      return;
    }
    setConfirmTrap(false);
    scan();
  };

  return (
    <div className="optics-shell">
      <div className="optics-topbar">
        <div>
          <span className="eyebrow">
            <Sparkles size={12} /> LIGHT-LOCK MECHANISM / 光路封门
          </span>
          <h2>{level.name}</h2>
          <p>{level.brief}</p>
        </div>
        <div className="optics-top-actions">
          <select
            className="opt-level-select"
            value={level.id}
            onChange={(e) => switchLevel(e.target.value)}
            aria-label="选择关卡"
          >
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <button className="outline-button" onClick={resetArray}>
            <RotateCcw size={14} /> 恢复镜阵
          </button>
          <button className="primary" onClick={requestScan}>
            <ScanLine size={14} /> 提交扫描
          </button>
          <span className={"save-state " + (!saved ? "unsaved" : "")}>
            <Save size={11} />
            {saved ? "镜阵已保存" : "本地保存不可用"}
          </span>
        </div>
      </div>

      {confirmTrap && (
        <div className="opt-trap-warning" role="alert">
          <p>
            预览显示该镜阵将使<strong>警戒符文</strong>达到阈值并激活陷阱，确认仍要提交扫描？
            （扫描会冻结证据，陷阱状态将被记录。）
          </p>
          <div>
            <button className="outline-button" onClick={() => setConfirmTrap(false)}>
              再调整
            </button>
            <button
              className="primary danger-btn"
              onClick={() => {
                setConfirmTrap(false);
                scan();
              }}
            >
              确认扫描
            </button>
          </div>
        </div>
      )}

      <div className="optics-grid">
        <div className="optics-main">
          <div className="opt-preview-flag">
            <Eye size={13} />
            {state.selectedUid
              ? "放置模式：点击空格放下机关（固定格不可放置）"
              : "实时预览：以下为当前镜阵的整体稳态光路，尚未提交扫描"}
          </div>
          <OpticsBoard
            level={level}
            movables={levelState.movables}
            report={preview}
            selectedUid={state.selectedUid}
            unstableCells={unstableCells}
            onCellClick={handleCellClick}
            onFixtureClick={handleFixtureClick}
          />
          <FixturePanel
            level={level}
            movables={levelState.movables}
            selectedUid={state.selectedUid}
            onPick={(uid) => dispatch({ type: "pick", uid })}
            onReturn={(uid) => dispatch({ type: "return-tray", uid })}
            onRotate={(uid) => dispatch({ type: "rotate", uid })}
            onSetReflectivity={(uid, value) =>
              dispatch({ type: "set-reflectivity", uid, value })
            }
            onToggleHandedness={(uid) =>
              dispatch({ type: "toggle-handedness", uid })
            }
            onSetSplit={(uid, value) => dispatch({ type: "set-split", uid, value })}
          />
        </div>

        <aside className="optics-side">
          <VerdictPanel level={level} report={preview} />
          <AuditPanel report={preview} />
          <EvidencePanel
            level={level}
            doc={state.doc}
            levelState={levelState}
            currentFingerprint={fp}
            onClaim={claimDoor}
          />
        </aside>
      </div>

      {state.notice && (
        <div className="optics-notice" role="status">
          {state.notice}
        </div>
      )}
    </div>
  );
}
