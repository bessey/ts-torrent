import fs from "node:fs/promises";
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

  receivedPieceBlock(blockRequest: BlockRequest, data: Buffer) {
    this.fileManager.writePieceBlock(blockRequest, data);
  }
}

interface PieceProgress {
  status: "missing" | "in-progress" | "complete";
  blocks: Bitfield;
}

interface PartialFileWrite {
  file: TFile;
  offset: number;
  data: Buffer;
}

export class FileManager {
  config: Config;
  metainfo: Metainfo;
  files: TFile[];
  completedPieces: Bitfield;
  pieceProgress: Record<Piece, PieceProgress>;

  constructor(config: Config, metainfo: Metainfo) {
    this.config = config;
    this.metainfo = metainfo;
    this.files = metainfo.info.fileList();
    const blocksPerPiece = Math.ceil(
      metainfo.info.pieceLength / config.blockSize
    );
    this.completedPieces = new Bitfield(Buffer.alloc(blocksPerPiece));
    this.pieceProgress = {};
  }

  async writePieceBlock(
    blockRequest: BlockRequest,
    data: Buffer
  ): Promise<boolean> {
    let pieceProgress = this.pieceProgress[blockRequest.piece];
    if (pieceProgress === undefined) {
      pieceProgress = this.pieceProgress[blockRequest.piece] = {
        status: "in-progress",
        blocks: new Bitfield(Buffer.alloc(data.length)),
      };
    }

    const blockOffset = Math.floor(blockRequest.begin / this.config.blockSize);
    pieceProgress.blocks.set(blockOffset);

    const fileWrites = this.fileWrites(blockRequest, data);
    for (const { file, offset, data } of fileWrites) {
      const filePath = [this.config.downloadsDirectory, ...file.path].join("/");

      const fd = await fs.open(filePath, "w");
      fd.write(data, 0, data.length, offset);
      fd.close();
    }
    return true;
  }

  fileWrites(blockRequest: BlockRequest, data: Buffer): PartialFileWrite[] {
    let totalOffset = 0;
    const firstFile = this.files.find((f) => {
      const fileEnd = f.length + totalOffset;
      totalOffset += f.length;
      return fileEnd > blockRequest.begin;
    });
    if (!firstFile) throw new Error("Block request is out of bounds");

    // For now lets assume the block never straddles files
    const endOfFileOrAllOfBlock = Math.min(
      firstFile.length - blockRequest.begin,
      data.length
    );
    return [
      {
        file: firstFile,
        offset: blockRequest.begin - totalOffset,
        data: data.subarray(0, endOfFileOrAllOfBlock),
      },
    ];
  }
}
