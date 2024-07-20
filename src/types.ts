export type PieceIndex = number;
/**
 * The block's index within the piece, for human readability.
 */
export type BlockIndex = number;
/**
 * The block's offset within the piece, in bytes.
 */
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
