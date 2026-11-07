import { useT } from "../i18n";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Icon } from '../Icon';

export type InspectorTab = 'selection' | 'team' | 'analysis';
type Layout = 'split' | 'board' | 'view';
const TABS: [InspectorTab, string][] = [['selection', '選手 / ボール'], ['team', 'チーム'], ['analysis', '分析']];
const UI_STORAGE = 'touchline.workspace.v1';
function preferences() {
  try {
    const p = JSON.parse(localStorage.getItem(UI_STORAGE) ?? '{}');
    return { width: typeof p.width === 'number' && Number.isFinite(p.width) ? Math.max(24, Math.min(50, p.width)) : 34,
      layout: (['split', 'board', 'view'].includes(p.layout) ? p.layout : 'split') as Layout };
  } catch { return { width: 34, layout: 'split' as Layout }; }
}
interface Props {
  board: ReactNode; view: ReactNode; selection: ReactNode; team: ReactNode; analysis: ReactNode;
  timeline: ReactNode; context: ReactNode; tab: InspectorTab; onTab: (tab: InspectorTab) => void;
  inspectorOpen: boolean; onInspector: (open: boolean) => void; onScenario: () => void; disabled: boolean;
}
export function Workspace(p: Props) {
  const t = useT();
  const [prefs, setPrefs] = useState(preferences);
  const [mobileView, setMobileView] = useState<'board' | 'view'>('board');
  const root = useRef<HTMLDivElement>(null), drag = useRef(false);
  const inspectorTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { try { localStorage.setItem(UI_STORAGE, JSON.stringify(prefs)); } catch { /* Layout is optional. */ } }, [prefs]);
  const closeInspector = () => { p.onInspector(false); inspectorTrigger.current?.focus(); };
  const resize = (x: number) => {
    const b = root.current?.getBoundingClientRect();
    if (b) setPrefs(v => ({ ...v, width: Math.max(24, Math.min(50, (x - b.left) / b.width * 100)) }));
  };
  return <>
    <div className="workspace-toolbar">
      <button className="button secondary small" disabled={p.disabled} onClick={p.onScenario}><Icon name="pitch" size={15}/>{t("シナリオ")}</button>
      <div className="workspace-context">{p.context}</div>
      <div className="segmented workspace-layout" aria-label={t("ワークスペース表示")}>
        {([['split', '2D + 3D'], ['board', '2D'], ['view', '3D']] as const).map(([key, label]) =>
          <button key={key} aria-pressed={prefs.layout === key} className={prefs.layout === key ? 'selected' : ''}
            onClick={() => setPrefs(v => ({ ...v, layout: key }))}>{label}</button>)}
      </div>
      <div className="segmented mobile-layout" aria-label={t("モバイル表示")}>
        {(['board', 'view'] as const).map(key => <button key={key} aria-pressed={mobileView === key}
          className={mobileView === key ? 'selected' : ''} onClick={() => setMobileView(key)}>{key === 'board' ? '2D' : '3D'}</button>)}
      </div>
      <button ref={inspectorTrigger} className={`button small ${p.inspectorOpen ? 'primary' : 'secondary'}`}
        aria-label="Inspector" aria-expanded={p.inspectorOpen} aria-controls="studio-inspector"
        onClick={() => p.onInspector(!p.inspectorOpen)}><Icon name="settings" size={15}/><span>Inspector</span></button>
    </div>
    <div ref={root} className={`studio-workspace layout-${prefs.layout} mobile-${mobileView} ${p.inspectorOpen ? 'inspector-open' : ''}`}
      style={{ '--board-width': `${prefs.width}%` } as CSSProperties}>
      <section className="board-panel panel" aria-label={t("2D編集")}>{p.board}</section>
      <div className="panel-splitter" role="separator" aria-label={t("2Dと3Dの幅")} aria-orientation="vertical"
        aria-valuemin={24} aria-valuemax={50} aria-valuenow={Math.round(prefs.width)} tabIndex={0}
        onDoubleClick={() => setPrefs(v => ({ ...v, width: 34 }))}
        onKeyDown={e => {
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
            e.preventDefault(); setPrefs(v => ({ ...v, width: e.key === 'Home' ? 24 : e.key === 'End' ? 50 : Math.max(24, Math.min(50, v.width + (e.key === 'ArrowRight' ? 2 : -2))) }));
          }
        }}
        onPointerDown={e => { if (e.button !== 0) return; drag.current = true; e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={e => { if (drag.current) resize(e.clientX); }}
        onPointerUp={() => { drag.current = false; }} onPointerCancel={() => { drag.current = false; }} />
      <section className="view-panel panel" aria-label={t("3Dビュー")}>{p.view}</section>
      <aside id="studio-inspector" className="studio-inspector panel" aria-label="Inspector" hidden={!p.inspectorOpen}
        onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); closeInspector(); } }}>
        <div className="inspector-header"><span className="eyebrow">INSPECTOR</span><button className="icon-button" aria-label={t("Inspectorを閉じる")} onClick={closeInspector}><Icon name="close" size={16}/></button></div>
        <div role="tablist" aria-label={t("Inspectorの内容")} className="inspector-tabs">
          {TABS.map(([key, label], i) => <button key={key} role="tab" id={`tab-${key}`}
            aria-selected={p.tab === key} aria-controls={`inspector-${key}`} tabIndex={p.tab === key ? 0 : -1}
            onClick={() => p.onTab(key)} onKeyDown={e => {
              const n = e.key === 'ArrowRight' ? (i + 1) % 3 : e.key === 'ArrowLeft' ? (i + 2) % 3 : e.key === 'Home' ? 0 : e.key === 'End' ? 2 : -1;
              if (n >= 0) { e.preventDefault(); p.onTab(TABS[n][0]); document.getElementById(`tab-${TABS[n][0]}`)?.focus(); }
            }}>{t(label)}</button>)}
        </div>
        {TABS.map(([key]) => <div key={key} id={`inspector-${key}`} className="inspector-scroll" role="tabpanel"
          aria-labelledby={`tab-${key}`} hidden={p.tab !== key} tabIndex={0}>
          {key === 'selection' ? p.selection : key === 'team' ? p.team : p.analysis}
        </div>)}
      </aside>
    </div>
    {p.timeline}
  </>;
}
