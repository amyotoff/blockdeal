import { ethers } from 'ethers';
import type { RoomState } from '../types/room';

export function computeHashPayload(room: RoomState): string {
  const sortedParticipants = [...room.participants].sort((a, b) => a.id.localeCompare(b.id));
  const signersStr = sortedParticipants.map((p) => `${p.name} (Signed: ${p.signed})`).join('\n');
  return `Договоренность:\n${room.text}\n\nПодписанты:\n${signersStr}`;
}

export function getContractHash(room: RoomState): string {
  return ethers.id(computeHashPayload(room));
}
