import { useT } from "./i18n";
import { Icon } from "./Icon";
import type { Team } from "./core";
import type { LookAlignment, LookTarget } from "./tactics";
const teams = ["home", "away"] as const;
const actions = [
  ["ball", "gaze", "ボールを見る", "全員ボールを見る"],
  ["ball", "body", "体も顔もボールへ", "全員体も顔もボールを見る"],
  ["goal", "gaze", "相手ゴールを見る", "全員相手ゴールを見る"],
  ["goal", "body", "体も顔も相手ゴールを見る", "全員体も顔も相手ゴールを見る"],
] as const;
export function OrientationControls({
  onOrient,
  onReset,
  activeTeams,
  onToggleTeam,
}: {
  onOrient: (target: LookTarget, alignment: LookAlignment, scope: "selected" | readonly Team[]) => void;
  onReset: () => void;
  activeTeams: readonly Team[];
  onToggleTeam: (team: Team) => void;
}) {
  const t = useT();
  const both = activeTeams.length === teams.length;
  return (
    <div className="orientation-controls">
      <div className="orientation-heading">
        <span>{t("選択した選手の向き")}</span>
        <button className="icon-button" aria-label={t("首と上下視線を正面へ戻す")} onClick={onReset}>
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
            <span>{t(label)}</span>
          </button>
        ))}
      </div>
      <details className="bulk-gaze">
        <summary>{both ? t("全員の向き（22人）") : t("チームの向き（{0}人）", activeTeams.length * 11)}</summary>
        <div className="segmented orientation-teams" role="group" aria-label={t("向きを変更するチーム")}>
          {teams.map(team => (
            <button
              key={team}
              type="button"
              className={activeTeams.includes(team) ? "selected" : ""}
              aria-pressed={activeTeams.includes(team)}
              onClick={() => onToggleTeam(team)}
            >
              {team.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="orientation-grid" role="group" aria-label={t("チームの向きの操作")}>
          {actions.map(([target, alignment, label, allLabel]) => (
            <button
              key={`${target}-${alignment}`}
              className="button secondary small"
              disabled={activeTeams.length === 0}
              onClick={() => onOrient(target, alignment, activeTeams)}
            >
              <Icon name="target" size={15} />
              <span>{t(both ? allLabel : label)}</span>
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}
