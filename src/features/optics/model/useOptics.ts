import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  opticsReducer,
  currentLevelState,
  type OpticsState,
} from "../model/opticsReducer";
import { loadOptics, saveOptics } from "../model/storage";
import { findLevel, OPTICS_LEVELS } from "../model/levels";
import { fingerprint } from "../model/fingerprint";
import { solveOptics, type PlacedFixture } from "../lib/solver";

export function useOptics() {
  const loaded = useRef<ReturnType<typeof loadOptics> | null>(null);
  if (!loaded.current) loaded.current = loadOptics();
  const [state, dispatch] = useReducer(
    opticsReducer,
    undefined,
    (): OpticsState => ({
      doc: loaded.current!.doc,
      selectedUid: null,
      notice: loaded.current!.notice,
    }),
  );
  const [saved, setSaved] = useState(!loaded.current.recovery);
  const recovery = useRef(loaded.current.recovery);

  const level = useMemo(
    () => findLevel(state.doc.levelId),
    [state.doc.levelId],
  );
  const levelState = currentLevelState(state.doc);

  // 实时预览：对当前工作镜阵求整体稳态（未提交也计算，明确标注为预览）
  const preview = useMemo(() => {
    const fixtures: PlacedFixture[] = levelState.movables
      .filter((m) => m.cell !== null)
      .map((movable) => ({ movable, cell: movable.cell as number }));
    return solveOptics({ level, fixtures });
  }, [level, levelState.movables]);

  const fp = useMemo(
    () => fingerprint(level, levelState.movables),
    [level, levelState.movables],
  );

  // 持久化：刷新恢复镜阵与历史证据
  useEffect(() => {
    if (recovery.current) {
      setSaved(false);
      return;
    }
    setSaved(saveOptics(state.doc));
  }, [state.doc]);

  const switchLevel = (levelId: string) =>
    dispatch({ type: "switch-level", levelId });

  const resetArray = () =>
    dispatch({
      type: "apply-movables",
      movables: findLevel(state.doc.levelId).movables,
      notice: "已恢复出厂镜阵；历史证据保留为观测版本，不被覆盖。",
    });

  // 仅提交当前镜阵的结果；改阵后旧证据数字冻结，需重新扫描才更新线索
  const scan = () =>
    dispatch({ type: "scan", level, report: preview, fingerprint: fp });

  const claimDoor = () =>
    dispatch({ type: "claim-door", levelId: state.doc.levelId });

  return {
    state,
    dispatch,
    level,
    levelState,
    levels: OPTICS_LEVELS,
    preview,
    fingerprint: fp,
    saved,
    switchLevel,
    resetArray,
    scan,
    claimDoor,
  };
}
