import type { HeatCell } from './analysis';
import type { ShotGeometry } from './geometry';
export interface XgVisuals { heatmap: HeatCell[]; geometry: ShotGeometry | null }
export const EMPTY_VISUALS: XgVisuals = { heatmap: [], geometry: null };
