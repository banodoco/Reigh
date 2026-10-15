import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validatedPairedSession } from '../../config/vite/pairedSessionContext.ts';
import { PairingRegistry } from '../../config/vite/pairedRegistry.ts';

test('connector accepts only its authenticated pair, realm, generation and expiry snapshot', () => {
  const context = { pair_id: 'p', connector_id: 'c', realm_id: 'r', generation: 2, expires_at: 2000 };
  const connection = { connectorId: 'c', realmId: 'r', generation: 2, pairs: new Map([['p', 2000]]) };
  const admitted = validatedPairedSession(context, connection, 1000);
  assert(Object.isFrozen(admitted));
  for (const [key, value] of Object.entries({ pair_id: 'other', connector_id: 'other', realm_id: 'other', generation: 1, expires_at: 3000, actor_id: 'forged' })) {
    assert.throws(() => validatedPairedSession({ ...context, [key]: value }, connection, 1000));
  }
  assert.throws(() => validatedPairedSession(context, connection, 2000));
  assert.throws(() => validatedPairedSession(null, connection));
});

test('reconnecting never mutates an old pair into the new connector generation', () => {
  const registry = new PairingRegistry(() => 1000);
  const connector = { connectorId: 'c', realmId: 'r', connectorSecret: 'synthetic' };
  const first = registry.connectConnector(connector);
  const paired = registry.redeemInvitation(first.invitation!.code);
  assert.equal(registry.authorizeSession(paired.sessionToken).generation, 1);
  const second = registry.connectConnector(connector);
  assert.equal(paired.pair.generation, 1);
  assert.throws(() => registry.authorizeSession(paired.sessionToken), /invalid_connector/);
  const fresh = registry.redeemInvitation(second.invitation!.code);
  assert.equal(registry.authorizeSession(fresh.sessionToken).generation, 2);
  assert.notEqual(fresh.pair.pairId, paired.pair.pairId);
});
