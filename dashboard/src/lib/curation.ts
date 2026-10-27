/**
 * The ground-truth label a curated span gets in the benchmark dataset, from the trace's risk score.
 *
 * Null when the trace has no score yet: labelling an unmeasured span SUPPORTED would put a case
 * nobody measured into the dataset as a known-good one, and skew every later run against it.
 */
export function curationLabel(
  risk: number | null | undefined,
): { expected_classification: 'REFUTED' | 'SUPPORTED'; is_failure: boolean } | null {
  if (risk == null) return null;
  const failed = risk > 0.5;
  return { expected_classification: failed ? 'REFUTED' : 'SUPPORTED', is_failure: failed };
}
