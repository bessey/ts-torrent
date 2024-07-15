import { Bitfield } from "#src/Bitfield.js";
import type { PeerState } from "#src/peer.js";
import type { Metainfo, TFile } from "#src/torrentFile.js";
import type { BlockRequest, Config } from "#src/types.js";
import { FileManager } from "./FileManager.js";

export class TorrentState {
  config: Config;
  metainfo: Metainfo;
  availablePeers: Set<PeerState>;
  activePeers: Set<PeerState>;
  ignoredPeers: Set<PeerState>;
  bitfield: Bitfield;
  requestsInFlight: Record<number, PeerState>;
  fileManager: FileManager;

  constructor(config: Config, metainfo: Metainfo) {
    this.config = config;
    this.metainfo = metainfo;
    this.availablePeers = new Set();
    this.activePeers = new Set();
    this.ignoredPeers = new Set();
    this.requestsInFlight = {};
    this.fileManager = new FileManager(config, metainfo);

    const emptyBitfield = Buffer.alloc(metainfo.info.pieceHashes.length);
    this.bitfield = new Bitfield(emptyBitfield);
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

  async receivedPieceBlock(blockRequest: BlockRequest, data: Buffer) {
    const pieceComplete = await this.fileManager.writePieceBlock(
      blockRequest,
      data
    );
    if (pieceComplete) {
      console.log(`piece ${blockRequest.piece} complete`);
      this.bitfield.set(blockRequest.piece);
      delete this.requestsInFlight[blockRequest.piece];
    }
  }
}

export interface PieceProgress {
  status: "missing" | "in-progress" | "complete";
  blocks: Bitfield;
}

export interface PartialFileWrite {
  file: TFile;
  offset: number;
  data: Buffer;
}
