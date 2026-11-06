import { probabilityColor } from './analysis';
import { LANE_COLORS } from './geometry';
import type { XgVisuals } from './visuals';
export function XgBoardOverlay({ visuals }: { visuals?: XgVisuals }) {
  if (!visuals) return null;
  const g = visuals.geometry;
  return <g pointerEvents="none" clipPath="url(#field-clip)">
    {visuals.heatmap.length > 0 && <g data-testid="xg-heatmap" opacity=".64">{visuals.heatmap.map((c, i) => <rect key={i} x={c.x - c.width / 2} y={c.z - c.depth / 2} width={c.width + .015} height={c.depth + .015} fill={probabilityColor(c.value)} />)}</g>}
    {g && <g data-testid="shot-lanes">{g.lanes.map((lane, i) => <path key={i} d={`M${g.shot.x},${g.shot.z}L${g.goalX},${lane.z0}L${g.goalX},${lane.z1}Z`} fill={LANE_COLORS[lane.kind]} fillOpacity={lane.kind === 'clear' ? .23 : .32} stroke={LANE_COLORS[lane.kind]} strokeWidth=".08" />)}
      <path d={`M${g.goalX},-3.66L${g.shot.x},${g.shot.z}L${g.goalX},3.66`} stroke="#f8fafc" strokeWidth=".24" fill="none" strokeDasharray=".8 .5" />
    </g>}
  </g>;
}
