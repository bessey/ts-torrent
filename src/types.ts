export type Piece = number;

export interface Config {
  filePath: string;
  downloadsDirectory: string;
  port: number;
  peerId: Buffer;
  desiredPeers: number;
  desiredPiecesInFlight: number;
  desiredBlocksInFlight: number;
}

export interface BlockRequest {
  piece: Piece;
  begin: number;
}
