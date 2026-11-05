import { useState } from "react";
import type { Project, Team } from "./core";
import {
  DEFAULT_SHAPE,
  formationLines,
  FORMATIONS,
  PHASES,
  type ShapeSettings,
  type Third,
} from "./tactics";
interface Props {
  project: Project;
  disabled: boolean;
  onShape: (shape: ShapeSettings) => void;
  onDefence: (team: Team, mode: "zone" | "man" | "off") => void;
  onPhase: (id: string, team: Team) => void;
}
const thirds: [Third, string][] = [
  ["defensive", "ディフェンシブ"],
  ["middle", "ミドル"],
  ["attacking", "アタッキング"],
];
export function TacticsPanel({ project, disabled, onShape, onDefence, onPhase }: Props) {
  const [shape, setShape] = useState<ShapeSettings>(DEFAULT_SHAPE),
    [custom, setCustom] = useState(""),
    [phase, setPhase] = useState(PHASES[0].id);
  const change = (patch: Partial<ShapeSettings>) => {
    const next = { ...shape, ...patch };
    setShape(next);
    onShape(next);
  };
  return (
    <section className="tactics-panel panel" aria-label="配置と局面のプリセット">
      <details open>
        <summary>
          TACTICAL PRESETS <span>配置・守備・試合の局面</span>
        </summary>
        <fieldset disabled={disabled}>
          <div className="tactics-columns">
            <div className="tactics-group">
              <h3>チームの配置</h3>
              <div className="tactics-row">
                <label>
                  対象チーム
                  <select
                    aria-label="配置の対象チーム"
                    value={shape.team}
                    onChange={(e) => setShape((s) => ({ ...s, team: e.target.value as Team }))}
                  >
                    <option value="home">HOME →</option>
                    <option value="away">AWAY ←</option>
                  </select>
                </label>
                <label>
                  フォーメーション
                  <select
                    aria-label="フォーメーション"
                    value={
                      FORMATIONS.includes(shape.formation as (typeof FORMATIONS)[number])
                        ? shape.formation
                        : ""
                    }
                    onChange={(e) => change({ formation: e.target.value })}
                  >
                    {!FORMATIONS.includes(shape.formation as (typeof FORMATIONS)[number]) && (
                      <option value="">{shape.formation}</option>
                    )}
                    {FORMATIONS.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                </label>
                <button className="button secondary small" onClick={() => onShape(shape)}>
                  配置を適用
                </button>
              </div>
              <div className="segmented thirds" aria-label="配置するサード">
                {thirds.map(([value, label]) => (
                  <button
                    key={value}
                    aria-pressed={shape.third === value}
                    className={shape.third === value ? "selected" : ""}
                    onClick={() => change({ third: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="shape-sliders">
                {(
                  [
                    ["compactness", "コンパクトさ", 0, 100, "%"],
                    ["width", "横の広さ", 20, 62, "m"],
                    ["tilt", "フィールドチルト（陣地の高さ）", -20, 20, "m"],
                    ["bias", "左右の偏り", -100, 100, "%"],
                  ] as const
                ).map(([key, label, min, max, unit]) => (
                  <label key={key} className="slider-control">
                    <span>
                      {label}
                      <strong>
                        {shape[key]}
                        <small>{unit}</small>
                      </strong>
                    </span>
                    <input
                      type="range"
                      aria-label={label}
                      min={min}
                      max={max}
                      value={shape[key]}
                      onChange={(e) => change({ [key]: Number(e.target.value) })}
                    />
                  </label>
                ))}
              </div>
              <div className="tactics-row custom-formation">
                <input
                  aria-label="カスタム配置"
                  placeholder="その他の配置 例: 3-3-1-3"
                  value={custom}
                  maxLength={20}
                  onChange={(e) => setCustom(e.target.value)}
                />
                <button
                  className="button subtle small"
                  onClick={() => {
                    try {
                      formationLines(custom);
                      setShape((s) => ({ ...s, formation: custom }));
                    } catch {}
                    onShape({ ...shape, formation: custom });
                  }}
                >
                  カスタムを適用
                </button>
              </div>
              <p>
                各列の合計10人＋GK。配置とバーは現在時刻に適用。左右の偏りは攻撃方向基準で −
                が左、＋ が右。横幅を保って寄せます。
              </p>
            </div>
            <div className="tactics-group">
              <h3>守備と試合の局面</h3>
              <label className="field-label">
                守備プリセット
                <select
                  aria-label="守備プリセット"
                  value={project.defence?.team === shape.team ? project.defence.mode : "off"}
                  onChange={(e) => onDefence(shape.team, e.target.value as "zone" | "man" | "off")}
                >
                  <option value="off">手動配置</option>
                  <option value="zone">ゾーン / ボール基準でスライド</option>
                  <option value="man">マンマーク / 担当相手を追従</option>
                </select>
              </label>
              <p>
                対象チームの全時間に適用。ゾーンは保持者の足元（自由球なら球位置）を基準に移動。マンマークは相手と1対1で固定割り当てします。
              </p>
              <label className="field-label">
                局面プリセット
                <select
                  aria-label="局面プリセット"
                  value={phase}
                  onChange={(e) => setPhase(e.target.value)}
                >
                  {PHASES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                {PHASES.find((p) => p.id === phase)?.note}
                。対象チームの立場で、相手の配置も含む12秒の動きを生成します。
              </p>
              <button className="button secondary" onClick={() => onPhase(phase, shape.team)}>
                局面シーケンスを読み込む
              </button>
              <p>
                シーケンス全体を置き換えます。元に戻す操作で復元できます。守備と動きは教材用の幾何学的な近似です。
              </p>
            </div>
          </div>
        </fieldset>
      </details>
    </section>
  );
}
