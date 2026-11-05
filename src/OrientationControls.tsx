import { Icon } from "./Icon";
import type { LookAlignment, LookTarget } from "./tactics";
const actions = [
  ["ball", "gaze", "ボールを見る", "全員ボールを見る"],
  ["ball", "body", "体も顔もボールへ", "全員体も顔もボールを見る"],
  ["goal", "gaze", "相手ゴールを見る", "全員相手ゴールを見る"],
  ["goal", "body", "体も顔も相手ゴールを見る", "全員体も顔も相手ゴールを見る"],
] as const;
export function OrientationControls({
  onOrient,
  onReset,
}: {
  onOrient: (target: LookTarget, alignment: LookAlignment, scope: "selected" | "all") => void;
  onReset: () => void;
}) {
  return (
    <div className="orientation-controls">
      <div className="orientation-heading">
        <span>選択した選手の向き</span>
        <button className="icon-button" aria-label="首と上下視線を正面へ戻す" onClick={onReset}>
          <Icon name="undo" size={17} />
        </button>
      </div>
      <div className="orientation-grid">
        {actions.map(([target, alignment, label]) => (
          <button
            key={`${target}-${alignment}`}
            className="button secondary small"
            onClick={() => onOrient(target, alignment, "selected")}
          >
            <Icon name="target" size={15} />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <details className="bulk-gaze">
        <summary>全員の向き（22人）</summary>
        <div className="orientation-grid">
          {actions.map(([target, alignment, , label]) => (
            <button
              key={`${target}-${alignment}`}
              className="button secondary small"
              onClick={() => onOrient(target, alignment, "all")}
            >
              <Icon name="target" size={15} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}
