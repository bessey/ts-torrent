export type PieceIndex = number;
export type BlockIndex = number;
export type BlockOffset = number;

export interface Config {
  filePath: string;
  downloadsDir: string;
  blockSize: number;
  port: number;
  peerId: Buffer;
  desiredPeers: number;
  desiredPiecesInFlight: number;
  desiredBlocksInFlight: number;
}

export interface BlockRequest {
  piece: PieceIndex;
  begin: BlockOffset;
}
