import { Bitfield } from "#src/Bitfield.js";
import type { PeerState } from "#src/PeerState.js";
import type { Metainfo } from "#src/torrentFile.js";
import type {
  BlockIndex,
  BlockOffset,
  BlockRequest,
  Config,
  PieceIndex,
} from "#src/types.js";
import { FileManager } from "./FileManager.js";

export class TorrentState {
  config: Config;
  metainfo: Metainfo;
  availablePeers: Set<PeerState>;
  activePeers: Set<PeerState>;
  ignoredPeers: Set<PeerState>;
  bitfield: Bitfield;
  requestsInFlight: Map<PieceIndex, PeerState>;
  fileManager: FileManager;

  constructor(config: Config, metainfo: Metainfo) {
    this.config = config;
    this.metainfo = metainfo;
    this.availablePeers = new Set();
    this.activePeers = new Set();
    this.ignoredPeers = new Set();
    this.requestsInFlight = new Map();
    this.fileManager = new FileManager(config, metainfo);
    this.bitfield = new Bitfield(metainfo.info.pieceHashes.length);
  }

  async hydrateBitfield() {
    await this.fileManager.hydratePieceProgressFromFile();
    this.bitfield = this.fileManager.bitfield();
    console.log(
      `Restoring progress: ${this.bitfield.totalProgress().toFixed(1)}%`
    );
    return this.bitfield;
  }

  peerConnected(peer: PeerState) {
    this.activePeers.add(peer);
    this.availablePeers.delete(peer) || this.ignoredPeers.delete(peer);
  }

  peerDisconnected(peer: PeerState) {
    if (this.activePeers.delete(peer)) this.availablePeers.add(peer);
  }

  peerErrored(peer: PeerState) {
    this.activePeers.delete(peer);
    this.ignoredPeers.add(peer);
  }

  get blocksPerPiece() {
    return this.metainfo.info.pieceLength / this.config.blockSize;
  }

  blockOffsetForIndex(block: BlockIndex): BlockOffset {
    return block * this.config.blockSize;
  }

  async receivedPieceBlock(blockRequest: BlockRequest, data: Buffer) {
    const pieceComplete = await this.fileManager.writePieceBlock(
      blockRequest,
      data
    );
    if (pieceComplete) {
      console.log(`piece ${blockRequest.piece} complete`);
      this.bitfield.set(blockRequest.piece);
      this.requestsInFlight.delete(blockRequest.piece);
    }
    return true;
  }
}
