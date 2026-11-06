import type { Response, Snapshot } from './analysis';
import type { ShotGeometry } from './geometry';
import './xg.css';
interface Props {
  snapshot: Snapshot; result: Response | null; error: string; updating: boolean;
  heatmap: boolean; geometry: ShotGeometry | null; oneOnOne: boolean;
  onOneOnOne: (value: boolean) => void; onRetry: () => void;
}
const labels = { near: '近距離・通常', oneOnOne: '近距離・1対1', far: '遠距離・通常' };
export function XgPanel(p: Props) {
  const prediction = p.result?.prediction;
  return <section className="xg-panel" data-testid="xg-readout" data-attack-team={p.snapshot.team} aria-label="xGとシュートコース解析" aria-busy={p.updating}>
    <div className="xg-panel-heading"><div><span className="eyebrow">SHOT ANALYSIS · {p.snapshot.team.toUpperCase()}</span><h2>配置から見る、シュートの質</h2></div><span className="xg-source">adamsaidane · XGBoost</span></div>
    <div className="xg-metrics">
      <div className="xg-primary"><span>xG · XGBoost</span><strong data-testid="xg-value">{prediction?.value != null ? prediction.value.toFixed(3) : '—'}</strong><small>{p.error ? 'モデル読込エラー' : prediction?.value != null ? `このシュートの推定得点率 ${(prediction.value*100).toFixed(1)}%` : prediction?.reason ?? 'モデルを読み込み中…'}</small></div>
      {p.geometry && <div className="xg-geometric" data-testid="goal-open-fraction"><span>幾何学的に空いているゴール面</span><strong>{Math.round(p.geometry.openFraction*100)}<small>%</small></strong><small>静止した人体の遮蔽のみ。得点率・セーブ率ではありません。</small></div>}
      <div className="xg-context"><label><input type="checkbox" checked={p.oneOnOne} onChange={e=>p.onOneOnOne(e.target.checked)} />1対1を仮定</label><small>配置からの自動判定ではなく、局面の指定です。</small>
        {prediction?.model && <span>{labels[prediction.model]} / ゴール中心まで {prediction.distance.toFixed(1)} m / モデル開口角 {prediction.angle.toFixed(1)}°</span>}
        {prediction?.model && prediction.model !== 'far' && <span>射線内の相手 {prediction.opponentsInCone}人（GKを含む）</span>}
        {p.result && <span className="xg-freshness" data-testid="xg-freshness">解析時刻 {p.result.time.toFixed(2)} s{p.updating ? ' · 配置を再計算中（前の結果）' : ' · 更新済み'}</span>}
      </div>
    </div>
    {p.error && <div className="xg-error" role="alert">{p.error}<button className="button secondary small" onClick={p.onRetry}>モデルを再試行</button></div>}
    {p.heatmap && <div className="xg-scale"><span>xGヒートマップ</span><div className="xg-scale-bar"/><div className="xg-scale-ticks">{[0,.1,.3,.6,1].map(v=><span key={v} style={{left:`${v*100}%`}}>{v.toFixed(1)}</span>)}</div></div>}
    {p.geometry && <div className="xg-lane-legend"><span className="lane-clear">空き</span><span className="lane-defender">相手DF</span><span className="lane-keeper">GK</span><span className="lane-teammate">味方</span><small>2Dの扇形は地上コース、3Dのゴール面は高さ別の直線コース。</small></div>}
    <p className="xg-caveat">オープンプレーの足によるシュートを仮定。ヒートマップは相手配置を固定した仮想シュート（攻撃側ハーフ・約2 m刻み）です。球速・反応・飛び込み・利き足・体の向きは未考慮。遠距離モデルにはDF人数の入力がありません。モデル推定値であり、このボードでの校正は未検証です。</p>
    <details className="xg-details"><summary>モデル・表示の条件と出典</summary><p>学習済み重みは adamsaidane/xG_model（MIT、revision 3dfa855）。StatsBomb由来の座標と特徴量を再現し、両ゴールポスト・各エリア境界を整合させて座標変換します。近距離/遠距離の境界は学習コードのゴール線分距離20（モデル座標）で、ペナルティーエリア境界とは異なります。1対1の遠距離は対象外です。シュートコースは直立円柱（半径：フィールド選手0.35 m、GK0.55 m）と球半径0.11 mによる別の幾何計算で、xGを補正しません。</p><a href="https://github.com/adamsaidane/xG_model/tree/3dfa855294abe947e42c276a9b136e9ff05b9ca9" target="_blank" rel="noreferrer">モデルと学習コード</a> · <a href={`${import.meta.env.BASE_URL}models/adamsaidane/LICENSE`} target="_blank" rel="noreferrer">MITライセンス</a></details>
  </section>;
}
