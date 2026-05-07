export interface Participant {
  id: string;
  name: string;
  signed: boolean;
}

export interface RoomState {
  text: string;
  participants: Participant[];
  hashed: boolean;
  txHash: string;
}
