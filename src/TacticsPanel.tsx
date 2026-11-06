import { useState } from 'react';
import type { Project, Team } from './core';
import { DEFAULT_SHAPE, formationLines, FORMATIONS, type ShapeSettings, type Third } from './tactics';
interface Props {
  project: Project; disabled: boolean;
  onShape: (shape: ShapeSettings, scope?: 'team' | 'outfield') => void;
  onDefence: (team: Team, mode: 'zone' | 'man' | 'off') => void;
  onScenario: () => void;
}
const thirds: [Third, string][] = [['defensive', 'ディフェンシブ'], ['middle', 'ミドル'], ['attacking', 'アタッキング']];
/** Team-only authoring. Sequence replacement belongs to ScenarioDialog. */
export function TacticsPanel({ project, disabled, onShape, onDefence, onScenario }: Props) {
  const [team, setTeam] = useState<Team>('home');
  const [shapes, setShapes] = useState<Record<Team, ShapeSettings>>(() => ({ home: { ...DEFAULT_SHAPE, team: 'home' }, away: { ...DEFAULT_SHAPE, team: 'away' } }));
  const [customs, setCustoms] = useState<Record<Team, string>>({ home: '', away: '' });
  const shape = shapes[team], custom = customs[team];
  const change = (patch: Partial<ShapeSettings>) => {
    const next = { ...shape, ...patch };
    setShapes(s => ({ ...s, [team]: next }));
    onShape(next, 'tilt' in patch ? 'outfield' : 'team');
  };
  return <section className="team-setup" aria-label="チームの設定">
    <div className="inspector-section-heading"><span className="eyebrow">TEAM SETUP</span><h3>チームの配置</h3><p>現在時刻の配置に即時適用。操作は元に戻せます。</p></div>
    <fieldset disabled={disabled}>
      <label className="field-label">対象チーム<select aria-label="配置の対象チーム" value={team} onChange={e => setTeam(e.target.value as Team)}><option value="home">HOME →</option><option value="away">AWAY ←</option></select></label>
      <label className="field-label">フォーメーション<select aria-label="フォーメーション" value={FORMATIONS.includes(shape.formation as (typeof FORMATIONS)[number]) ? shape.formation : ''} onChange={e => change({ formation: e.target.value })}>
        {!FORMATIONS.includes(shape.formation as (typeof FORMATIONS)[number]) && <option value="">{shape.formation}</option>}
        {FORMATIONS.map(f => <option key={f}>{f}</option>)}
      </select></label>
      <button className="button secondary small" onClick={() => onShape(shape)}>配置を適用</button>
      <div className="segmented thirds" aria-label="配置するサード">{(team === 'away' ? [...thirds].reverse() : thirds).map(([value, label]) => <button key={value} aria-pressed={shape.third === value} className={shape.third === value ? 'selected' : ''} onClick={() => change({ third: value })}>{label}</button>)}</div>
      <div className="shape-sliders">{([
        ['compactness', 'コンパクトさ', 0, 100, '%'], ['width', '横の広さ', 20, 62, 'm'],
        ['tilt', 'フィールドチルト（陣地の高さ）', -20, 20, 'm'], ['bias', '左右の偏り', -100, 100, '%'],
      ] as const).map(([key, label, min, max, unit]) => <label key={key} className="slider-control"><span>{label}<strong>{shape[key]}<small>{unit}</small></strong></span><input type="range" aria-label={label} min={min} max={max} value={shape[key]} dir={key === 'tilt' && team === 'away' ? 'rtl' : 'ltr'} onChange={e => change({ [key]: Number(e.target.value) })}/></label>)}</div>
      <details className="team-details"><summary>カスタム配置・配置の条件</summary>
        <label className="field-label">カスタム配置<input aria-label="カスタム配置" placeholder="例: 3-3-1-3" value={custom} maxLength={20} onChange={e => setCustoms(s => ({ ...s, [team]: e.target.value }))}/></label>
        <button className="button secondary small" onClick={() => {
          try { formationLines(custom); setShapes(s => ({ ...s, [team]: { ...shape, formation: custom } })); } catch { /* onShape reports validation errors. */ }
          onShape({ ...shape, formation: custom });
        }}>カスタムを適用</button>
        <p>各列の合計10人＋GK。コンパクトさ100%で前後幅6 m。左右の偏りは攻撃方向基準で − が左、＋ が右。横幅を保って寄せます。陣地の高さの変更ではGKを移動しません。</p>
      </details>
      <div className="team-defence"><h3>守備方式</h3><label className="field-label">全時間に適用<select aria-label="守備プリセット" value={project.defence?.team === team ? project.defence.mode : 'off'} onChange={e => onDefence(team, e.target.value as 'zone' | 'man' | 'off')}>
        <option value="off">手動配置</option><option value="zone">ゾーン / ボール基準</option><option value="man">マンマーク / 相手を追従</option>
      </select></label><p>ゾーンはボール基準でスライド。マンマークは担当相手を追従します。自動守備は一方のチームのみ有効です。</p></div>
      <button className="button subtle small" onClick={onScenario}>動作シーケンスは「シナリオ」へ</button>
    </fieldset>
  </section>;
}
