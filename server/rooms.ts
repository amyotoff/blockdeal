import type { Participant, RoomState } from '../src/types/room';

export const DEFAULT_CONTRACT_TEXT = 'Договор купли-продажи\n\nМодель R2-D2 (далее "Покупатель") и Сгибальщик Сгибающий Родригес, он же Бендер (далее "Продавец"), заключили настоящий договор о нижеследующем:\n\n1. Продавец обязуется передать в собственность Покупателю, а Покупатель обязуется принять и оплатить атомный аккумулятор емкостью 10 000 МВт·ч для домашних нужд.\n2. Товар должен быть доставлен в исправном состоянии, без следов взлома, кражи или воздействия алкоголя.\n3. В случае нарушения сроков поставки Продавец обязуется выплатить неустойку в размере 10 криптокредитов за каждый оборот вокруг Солнца, но оставляет за собой право потребовать от Покупателя блестящий зад.';

export type RoomsStore = Map<string, RoomState>;

export function createRoom(): RoomState {
  return {
    text: DEFAULT_CONTRACT_TEXT,
    participants: [],
    hashed: false,
    txHash: '',
  };
}

export function getOrCreateRoom(rooms: RoomsStore, roomId: string): RoomState {
  const existing = rooms.get(roomId);
  if (existing) return existing;

  const room = createRoom();
  rooms.set(roomId, room);
  return room;
}

export function joinRoom(room: RoomState, socketId: string, userName?: string): Participant {
  const existing = room.participants.find((p) => p.id === socketId);
  if (existing) return existing;

  const participant = { id: socketId, name: userName || 'Аноним', signed: false };
  room.participants.push(participant);
  return participant;
}

export function updateRoomText(room: RoomState, newText: string): boolean {
  if (room.hashed) return false;

  room.text = newText;
  return true;
}

export function updateParticipantName(room: RoomState, socketId: string, newName: string): boolean {
  const participant = room.participants.find((p) => p.id === socketId);
  if (!participant) return false;

  participant.name = newName;
  return true;
}

export function toggleParticipantSign(room: RoomState, socketId: string): boolean {
  if (room.hashed) return false;

  const participant = room.participants.find((p) => p.id === socketId);
  if (!participant) return false;

  participant.signed = !participant.signed;
  if (canLockRoom(room)) {
    room.hashed = true;
  }

  return true;
}

export function canLockRoom(room: RoomState): boolean {
  return room.participants.length > 1 && room.participants.every((participant) => participant.signed);
}

export function setRoomTxHash(room: RoomState, txHash: string): void {
  room.txHash = txHash;
}

export function removeParticipantFromRooms(rooms: RoomsStore, socketId: string): string[] {
  const changedRoomIds: string[] = [];

  rooms.forEach((room, roomId) => {
    const initialCount = room.participants.length;
    room.participants = room.participants.filter((participant) => participant.id !== socketId);
    if (room.participants.length !== initialCount) {
      changedRoomIds.push(roomId);
    }
  });

  return changedRoomIds;
}
