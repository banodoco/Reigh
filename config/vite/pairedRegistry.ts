import { createHash, randomBytes } from 'node:crypto';

export const PAIRED_INVITATION_TTL_MS = 5 * 60 * 1000;
export const PAIRED_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const PAIRED_CONNECTOR_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_PENDING_INVITATIONS = 128;

export type PairingFailure = 'invalid_invitation' | 'expired_invitation' | 'already_redeemed' | 'invalid_connector' | 'revoked' | 'expired_session' | 'unknown_session';

export class PairingError extends Error {
  constructor(readonly code: PairingFailure) {
    super(code);
    this.name = 'PairingError';
  }
}

export interface ConnectorRecord {
  readonly connectorId: string;
  readonly realmId: string;
  readonly verifier: string;
  readonly createdAt: number;
  expiresAt: number;
  generation: number;
  activeConnection?: unknown;
  pairId?: string;
}

export interface PairRecord {
  readonly pairId: string;
  readonly connectorId: string;
  readonly realmId: string;
  readonly sessionVerifier: string;
  readonly connectorVerifier: string;
  readonly createdAt: number;
  expiresAt: number;
  revoked: boolean;
  generation: number;
}

interface InvitationRecord {
  readonly digest: string;
  readonly connectorId: string;
  readonly realmId: string;
  readonly expiresAt: number;
  redeemed: boolean;
}

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function secret(): string {
  return randomBytes(32).toString('base64url');
}

/** Volatile transport authentication state. Workspace authority remains Runtime. */
export class PairingRegistry {
  private readonly connectors = new Map<string, ConnectorRecord>();
  private readonly invitations = new Map<string, InvitationRecord>();
  private readonly pairs = new Map<string, PairRecord>();
  private readonly revokedConnectors = new Set<string>();
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  connectConnector(input: { connectorId: string; realmId: string; connectorSecret: string; connection?: unknown }): { connector: ConnectorRecord; invitation?: { code: string; realmId: string; expiresAt: number } } {
    this.prune();
    const verifier = digest(input.connectorSecret);
    const credentialKey = `${input.connectorId}:${verifier}`;
    if (this.revokedConnectors.has(credentialKey)) throw new PairingError('revoked');
    const existing = this.connectors.get(input.connectorId);
    if (existing && existing.verifier !== verifier) throw new PairingError('invalid_connector');
    const connector = existing ?? {
      connectorId: input.connectorId,
      realmId: input.realmId,
      verifier,
      createdAt: this.now(),
      expiresAt: this.now() + PAIRED_CONNECTOR_TTL_MS,
      generation: 0,
    };
    if (connector.realmId !== input.realmId) throw new PairingError('invalid_connector');
    connector.expiresAt = this.now() + PAIRED_CONNECTOR_TTL_MS;
    connector.generation += 1;
    connector.activeConnection = input.connection;
    this.connectors.set(connector.connectorId, connector);
    const currentPair = connector.pairId ? this.pairs.get(connector.pairId) : undefined;
    // A reconnect requires a fresh invitation redemption. Old bindings stay frozen.
    if (currentPair) connector.pairId = undefined;
    const invitation = this.createInvitation(connector.connectorId);
    return { connector, invitation };
  }

  createInvitation(connectorId: string): { code: string; realmId: string; expiresAt: number } {
    const connector = this.connectors.get(connectorId);
    if (!connector) throw new PairingError('invalid_connector');
    const code = secret();
    this.invitations.set(digest(code), {
      digest: digest(code), connectorId, realmId: connector.realmId,
      expiresAt: this.now() + PAIRED_INVITATION_TTL_MS, redeemed: false,
    });
    while (this.invitations.size > MAX_PENDING_INVITATIONS) {
      const oldest = this.invitations.keys().next().value;
      if (oldest === undefined) break;
      this.invitations.delete(oldest);
    }
    return { code, realmId: connector.realmId, expiresAt: this.now() + PAIRED_INVITATION_TTL_MS };
  }

  redeemInvitation(code: string): { pair: PairRecord; sessionToken: string } {
    this.prune();
    const invitation = this.invitations.get(digest(code));
    if (!invitation) throw new PairingError('invalid_invitation');
    if (invitation.redeemed) throw new PairingError('already_redeemed');
    if (invitation.expiresAt <= this.now()) throw new PairingError('expired_invitation');
    const connector = this.connectors.get(invitation.connectorId);
    if (!connector || connector.expiresAt <= this.now()) throw new PairingError('invalid_connector');
    invitation.redeemed = true;
    const sessionToken = secret();
    const pairId = randomBytes(16).toString('hex');
    const pair: PairRecord = {
      pairId, connectorId: connector.connectorId, realmId: connector.realmId,
      sessionVerifier: digest(sessionToken), connectorVerifier: connector.verifier,
      createdAt: this.now(), expiresAt: this.now() + PAIRED_SESSION_TTL_MS,
      revoked: false, generation: connector.generation,
    };
    this.pairs.set(pairId, pair);
    connector.pairId = pairId;
    return { pair, sessionToken };
  }

  authorizeSession(sessionToken: string): PairRecord {
    const verifier = digest(sessionToken);
    for (const pair of this.pairs.values()) {
      if (pair.sessionVerifier === verifier) {
        if (pair.revoked) throw new PairingError('revoked');
        if (pair.expiresAt <= this.now()) {
          this.pairs.delete(pair.pairId);
          throw new PairingError('expired_session');
        }
        const connector = this.connectors.get(pair.connectorId);
        if (!connector || connector.expiresAt <= this.now() || connector.generation !== pair.generation) throw new PairingError('invalid_connector');
        return pair;
      }
    }
    this.prune();
    throw new PairingError('unknown_session');
  }

  authorizeConnector(pairId: string, connectorSecret: string, generation: number): PairRecord {
    const pair = this.pairs.get(pairId);
    const connector = pair && this.connectors.get(pair.connectorId);
    if (!pair || !connector || pair.revoked || connector.verifier !== digest(connectorSecret) || pair.generation !== generation) throw new PairingError('invalid_connector');
    return pair;
  }

  revoke(pairId: string): ConnectorRecord | undefined {
    const pair = this.pairs.get(pairId);
    if (!pair) return undefined;
    pair.revoked = true;
    const connector = this.connectors.get(pair.connectorId);
    this.revokedConnectors.add(`${pair.connectorId}:${pair.connectorVerifier}`);
    for (const [key, invitation] of this.invitations) if (invitation.connectorId === pair.connectorId) this.invitations.delete(key);
    this.connectors.delete(pair.connectorId);
    if (connector?.pairId === pairId) connector.pairId = undefined;
    return connector;
  }

  getPair(pairId: string): PairRecord | undefined { this.prune(); return this.pairs.get(pairId); }
  getConnector(connectorId: string): ConnectorRecord | undefined { this.prune(); return this.connectors.get(connectorId); }
  clear(): void { this.connectors.clear(); this.invitations.clear(); this.pairs.clear(); this.revokedConnectors.clear(); }

  private prune(): void {
    const now = this.now();
    // Keep expired invitations until a redemption attempt so the caller gets
    // the explicit expired_invitation error rather than an indistinguishable
    // invalid_invitation after pruning.
    for (const [key, value] of this.connectors) if (value.expiresAt <= now) this.connectors.delete(key);
    for (const [key, value] of this.pairs) if (value.expiresAt <= now || value.revoked) this.pairs.delete(key);
  }
}
