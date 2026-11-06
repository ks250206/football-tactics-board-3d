/** Small read-only evaluator for the pinned, numeric binary-logistic XGBoost models.
 * No eval, pickle, Python, WebGPU or external inference service at runtime.
 * All trees are used, matching upstream Booster.predict (not sklearn early stopping).
 */
export interface NumericTree {
  left: Int32Array; right: Int32Array; feature: Uint32Array;
  threshold: Float32Array; defaultLeft: Uint8Array;
}
export interface Booster { names: string[]; margin: number; trees: NumericTree[] }
function fail(): never { throw new Error('Unsupported or malformed xG model'); }
export function compileBooster(raw: unknown): Booster {
  const learner = (raw as any)?.learner;
  if (!learner || learner.objective?.name !== 'binary:logistic' || learner.gradient_booster?.name !== 'gbtree') fail();
  const params = learner.learner_model_param;
  const names = learner.feature_names;
  if (!Array.isArray(names) || !names.length || !names.every(n => typeof n === 'string') || new Set(names).size !== names.length || Number(params?.num_feature) !== names.length || Number(params?.num_class) !== 0 || Number(params?.num_target ?? 1) !== 1) fail();
  const rawBase = String(params.base_score);
  const base = rawBase.startsWith('[') ? JSON.parse(rawBase) : [Number(rawBase)];
  if (!Array.isArray(base) || base.length !== 1 || !Number.isFinite(base[0]) || base[0] <= 0 || base[0] >= 1) fail();
  const model = learner.gradient_booster.model;
  if (!Array.isArray(model?.trees) || !model.trees.length || model.trees.length > 10000 || !Array.isArray(model.tree_info) || model.tree_info.length !== model.trees.length || model.tree_info.some((n: number) => n !== 0)) fail();
  const trees: NumericTree[] = model.trees.map((t: any) => {
    const n = t.left_children?.length;
    if (!Number.isInteger(n) || n < 1 || n > 100000 || t.tree_param?.size_leaf_vector && Number(t.tree_param.size_leaf_vector) > 1) fail();
    const arrays = [t.left_children, t.right_children, t.split_indices, t.split_conditions, t.default_left];
    if (arrays.some(a => !Array.isArray(a) || a.length !== n)) fail();
    if (t.split_type?.some((v: number) => v !== 0) || t.categories?.length) fail();
    for (let i = 0; i < n; i++) {
      const l = t.left_children[i], r = t.right_children[i];
      if (!Number.isFinite(t.split_conditions[i]) || ![0, 1, false, true].includes(t.default_left[i])) fail();
      if (l === -1 && r === -1) continue;
      if (!Number.isInteger(l) || !Number.isInteger(r) || l <= i || r <= i || l >= n || r >= n || !Number.isInteger(t.split_indices[i]) || t.split_indices[i] < 0 || t.split_indices[i] >= names.length) fail();
    }
    return { left: Int32Array.from(t.left_children), right: Int32Array.from(t.right_children), feature: Uint32Array.from(t.split_indices), threshold: Float32Array.from(t.split_conditions), defaultLeft: Uint8Array.from(t.default_left) };
  });
  return { names: [...names], margin: Math.fround(Math.log(base[0] / (1 - base[0]))), trees };
}
export function predictBooster(model: Booster, features: readonly number[]): number {
  if (features.length !== model.names.length || features.some(x => !Number.isFinite(x) && !Number.isNaN(x))) throw new Error('Invalid xG feature vector');
  let sum = model.margin;
  for (const tree of model.trees) {
    let node = 0;
    while (tree.left[node] !== -1) {
      const x = Math.fround(features[tree.feature[node]]);
      node = (Number.isNaN(x) ? tree.defaultLeft[node] !== 0 : x < tree.threshold[node]) ? tree.left[node] : tree.right[node];
    }
    sum = Math.fround(sum + tree.threshold[node]);
  }
  return 1 / (1 + Math.exp(-sum));
}
