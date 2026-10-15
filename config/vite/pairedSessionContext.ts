/** Internal relay envelope. Never add this header to the browser allowlist. */
export const PAIRED_SESSION_HEADER = 'X-Reigh-Paired-Session';
export interface PairedSessionContext {
  readonly pair_id: string;
  readonly connector_id: string;
  readonly generation: number;
  readonly realm_id: string;
  /** PairingRegistry uses epoch milliseconds. */
  readonly expires_at: number;
}

export function validatedPairedSession(value: unknown, connection: {
  connectorId: string; realmId: string; generation: number;
  pairs: ReadonlyMap<string, number>;
}, now = Date.now()): Readonly<PairedSessionContext> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('paired_session_invalid');
  const c = value as PairedSessionContext;
  if (Object.keys(c).sort().join(',') !== 'connector_id,expires_at,generation,pair_id,realm_id'
    || typeof c.pair_id !== 'string' || !c.pair_id
    || c.connector_id !== connection.connectorId || c.realm_id !== connection.realmId
    || !Number.isSafeInteger(c.generation) || c.generation !== connection.generation
    || !Number.isSafeInteger(c.expires_at) || c.expires_at <= now
    || connection.pairs.get(c.pair_id) !== c.expires_at) throw new Error('paired_session_binding_mismatch');
  return Object.freeze({ pair_id: c.pair_id, connector_id: c.connector_id,
    generation: c.generation, realm_id: c.realm_id, expires_at: c.expires_at });
}
