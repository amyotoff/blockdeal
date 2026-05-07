import { describe, expect, it } from 'vitest';
import { computeHashPayload, getContractHash } from '../../src/lib/contractHash';
import type { RoomState } from '../../src/types/room';

function roomWithParticipants(participants: RoomState['participants']): RoomState {
  return {
    text: 'Pay 10 tokens for delivery',
    participants,
    hashed: false,
    txHash: '',
  };
}

describe('contract hash payload', () => {
  it('sorts participants by id for deterministic payloads', () => {
    const first = roomWithParticipants([
      { id: 'b-client', name: 'Buyer', signed: true },
      { id: 'a-client', name: 'Seller', signed: true },
    ]);
    const second = roomWithParticipants([
      { id: 'a-client', name: 'Seller', signed: true },
      { id: 'b-client', name: 'Buyer', signed: true },
    ]);

    expect(computeHashPayload(first)).toBe(computeHashPayload(second));
  });

  it('changes the hash when the final agreement text changes', () => {
    const first = roomWithParticipants([{ id: 'a-client', name: 'Seller', signed: true }]);
    const second = { ...first, text: 'Pay 11 tokens for delivery' };

    expect(getContractHash(first)).not.toBe(getContractHash(second));
  });
});
