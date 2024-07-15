import { Bitfield } from "#src/bitfield.js";
import type { PeerState } from "#src/peer.js";
import type { Metainfo, TFile } from "#src/torrentFile.js";
import type { BlockRequest, Config, Piece } from "#src/types.js";

export class TorrentState {
  config: Config;
  metainfo: Metainfo;
  availablePeers: Set<PeerState>;
  activePeers: Set<PeerState>;
  ignoredPeers: Set<PeerState>;
  bitfield: Bitfield;
  requestsInFlight: Record<number, PeerState>;
  assembledPieces: Buffer[];

  constructor(config: Config, metainfo: Metainfo) {
    this.config = config;
    this.metainfo = metainfo;
    this.availablePeers = new Set();
    this.activePeers = new Set();
    this.ignoredPeers = new Set();
    this.requestsInFlight = {};
    this.assembledPieces = [];

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

  receivedPieceBlock(blockRequest: BlockRequest, data: Buffer) {}
}

interface PieceProgress {
  status: "missing" | "in-progress" | "complete";
  blocks: Bitfield;
}

export class FileManager {
  config: Config;
  files: TFile[];
  completedPieces: Bitfield;
  pieceProgress: Record<Piece, PieceProgress>;

  constructor(config: Config, metainfo: Metainfo) {
    this.config = config;
    this.files = metainfo.info.fileList();
    const blocksPerPiece = Math.ceil(
      metainfo.info.pieceLength / config.blockSize
    );
    this.completedPieces = new Bitfield(Buffer.alloc(blocksPerPiece));
    this.pieceProgress = {};
  }

  writePieceBlock(piece: number, begin: number, data: Buffer) {}
}
