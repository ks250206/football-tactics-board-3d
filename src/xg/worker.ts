import { compileBooster } from './booster';
import { analyseXg, FEATURES, MODEL_FILES, type ModelId, type ModelSet, type Request, type Response } from './analysis';
let models: Promise<ModelSet> | null = null;
async function load(base: string): Promise<ModelSet> {
  const entries = await Promise.all((Object.keys(MODEL_FILES) as ModelId[]).map(async id => {
    const response = await fetch(new URL(MODEL_FILES[id], base), { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`モデルを読み込めません (${response.status})。models:prepare とビルドを確認してください。`);
    const model = compileBooster(await response.json());
    if (JSON.stringify(model.names) !== JSON.stringify(FEATURES[id])) throw new Error(`モデルの特徴量が一致しません: ${id}`);
    return [id, model] as const;
  }));
  return Object.fromEntries(entries) as ModelSet;
}
self.onmessage = async (event: MessageEvent<Request & { base: string }>) => {
  const { snapshot, heatmap, key, base } = event.data;
  try {
    models ??= load(base);
    const result: Response = { ...analyseXg(await models, snapshot, heatmap), key, team: snapshot.team, time: snapshot.time };
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({ key, error: error instanceof Error ? error.message : 'xG計算に失敗しました。' });
  }
};
