/** Exact Runtime-authored identity accepted by the timeline selected-media op. */
export interface SelectedProjectMediaIdentity {
  asset: string;
  generation_id: string;
  variant_id: string;
  object_id: string;
  catalog_digest: string;
}
