import { useT } from "../i18n";
import { useEffect, useMemo, useRef, useState } from 'react';
import { sample, type Project, type Team } from '../core';
import { PHASES, phaseProject, resolveDefence } from '../tactics';
import { createScenario } from '../scenarios';
import { Icon } from '../Icon';
import { createTrossardReplay, trossardReplay } from '../webmcp/replays';
import type { ScenarioPreview } from '../webmcp/useScenarioTools';

const DEMOS = [{ id: 'build', name: '首振りとビルドアップ' }, { id: 'through', name: 'スルーパス' }, { id: 'overlap', name: 'オーバーラップ' }];
export function ScenarioDialog({ project, incoming, disabled, onApply, onClose }: {
  project: Project; incoming?: ScenarioPreview; disabled: boolean;
  onApply: (project: Project, focus?: string) => void; onClose: () => void;
}) {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const [choice, setChoice] = useState(`phase:${PHASES[0].id}`), [team, setTeam] = useState<Team>('home');
  const [confirmed, setConfirmed] = useState(false);
  const isDemo = choice.startsWith('demo:');
  const isReplay = choice === 'replay:trossard';
  const phase = PHASES.find(p => p.id === choice.slice(6)) ?? PHASES[0];
  const preview = useMemo(() => {
    if (incoming) return incoming.project;
    if (isReplay) return createTrossardReplay();
    if (isDemo) return createScenario(choice.slice(5));
    return phaseProject(project, phase, team);
  }, [incoming, isReplay, isDemo, project, choice, phase, team]);
  const note = incoming?.note ?? (isReplay ? trossardReplay.note : isDemo ? "保存済みのデモ配置と動きを読み込みます。" : phase.note);
  const source = incoming?.source ?? (isReplay ? trossardReplay.source : undefined);
  const focus = incoming?.focus ?? (isReplay ? 'away-11' : undefined);
  const frame = useMemo(() => resolveDefence(preview, sample(preview, 0)), [preview]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null, el = dialog.current!;
    el.showModal();
    return () => { el.close(); previous?.focus(); };
  }, []);
  return <dialog ref={dialog} className="scenario-dialog" aria-labelledby="scenario-title"
    onCancel={e => { e.preventDefault(); onClose(); }}
    onKeyDown={e => e.stopPropagation()} onClick={e => { if (e.target === e.currentTarget) {
      const r = e.currentTarget.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose();
    } }}>
    <div className="panel-header"><h2 id="scenario-title">{t("シナリオを読み込む")}</h2><button className="icon-button" aria-label={t("シナリオを閉じる")} onClick={onClose}><Icon name="close"/></button></div>
    <div className="scenario-body">
      <p>{t("配置だけの調整はInspectorの「チーム」へ。ここでは動作を含むシーケンス全体を置き換えます。")}</p>
      {incoming ? <h3>{t(incoming.project.name)}</h3> : <label className="field-label">{t("シナリオ")}<select aria-label={t("シナリオの種類")} value={choice} onChange={e => { setChoice(e.target.value); setConfirmed(false); }}>
        <optgroup label={t("試合の局面")}>{PHASES.map(p => <option key={p.id} value={`phase:${p.id}`}>{t(p.name)}</option>)}</optgroup>
        <optgroup label={t("デモシーケンス")}>{DEMOS.map(p => <option key={p.id} value={`demo:${p.id}`}>{t(p.name)}</option>)}</optgroup>
        <optgroup label={t("試合の再現")}><option value="replay:trossard">{t(trossardReplay.title)}</option></optgroup>
      </select></label>}
      {!incoming && !isDemo && !isReplay && <label className="field-label">{t("対象チーム")}<select aria-label={t("シナリオの対象チーム")} value={team} onChange={e => { setTeam(e.target.value as Team); setConfirmed(false); }}><option value="home">HOME →</option><option value="away">AWAY ←</option></select></label>}
      <div className="scenario-preview"><svg viewBox="-58 -40 116 80" role="img" aria-label={t("シナリオの開始配置プレビュー")}>
        <rect x="-52.5" y="-34" width="105" height="68" rx="1" fill="#274d3b" stroke="#bacdbc" strokeWidth=".4"/>
        <g fill="none" stroke="#bacdbc" strokeWidth=".3"><path d="M0-34V34M-52.5-20.16H-36V20.16H-52.5M52.5-20.16H36V20.16H52.5"/><circle r="9.15"/></g>
        {preview.roster.map(p => <g key={p.id} transform={`translate(${frame.players[p.id].x} ${frame.players[p.id].z})`}><circle r="2" fill={p.team === 'home' ? '#f8fafc' : '#dc785f'}/><text textAnchor="middle" dominantBaseline="central" fontSize="1.8" fill={p.team === 'home' ? '#243546' : '#fff'}>{p.number}</text></g>)}
        <circle cx={frame.ball.x} cy={frame.ball.z} r="1" fill="#fff" stroke="#182a22" strokeWidth=".3"/>
      </svg><span>{t("{0}秒 · {1}キーフレーム · 両チームとボール", preview.duration, preview.frames.length)}</span></div>
      <p>{t(note)} {source && <a href={source} target="_blank" rel="noreferrer">{t("公式レポート")}</a>}</p>
      <div className="scenario-warning">{t("現在の全キーフレーム・両チーム・ボールの動きが置き換わります。適用後は「元に戻す」で復元できます。選択するだけでは変更しません。")}</div>
      <label className="scenario-confirm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>{t("シーケンス全体の置き換えを確認しました")}</label>
    </div>
    <div className="scenario-actions"><button className="button secondary" onClick={onClose}>{t("キャンセル")}</button><button className="button primary" disabled={!confirmed || disabled} onClick={() => { onApply(preview, focus); onClose(); }}>{t("シーケンスを置き換える")}</button></div>
  </dialog>;
}
