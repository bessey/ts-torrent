import crypto from "node:crypto";
import fs from "node:fs/promises";
import { Bitfield } from "#src/Bitfield.js";
import type { Metainfo, TFile } from "#src/torrentFile.js";
import type { BlockRequest, Config, PieceIndex } from "#src/types.js";
import type { PartialFileWrite, PieceProgress } from "./torrentState.js";
import { sha1Hash } from "./utils.js";

export class FileManager {
  config: Config;
  metainfo: Metainfo;
  files: TFile[];
  pieceProgress: Map<PieceIndex, PieceProgress>;

  constructor(config: Config, metainfo: Metainfo) {
    this.config = config;
    this.metainfo = metainfo;
    this.files = metainfo.info.fileList();
    this.pieceProgress = new Map();
  }

  async hydratePieceProgressFromFile() {
    for (
      let pieceIndex = 0;
      pieceIndex < this.metainfo.info.pieceHashes.length;
      pieceIndex++
    ) {
      const valid = await this.verifyPieceFromFile(pieceIndex);
      const allOnes = new Bitfield(
        Math.ceil(this.metainfo.info.pieceLength / this.config.blockSize)
      ).fill();
      if (valid)
        this.pieceProgress.set(pieceIndex, {
          status: "complete",
          blocks: allOnes,
        });
    }
  }

  async verifyPieceFromFile(pieceIndex: PieceIndex): Promise<boolean> {
    const pieceData = await this.#extractPieceData(pieceIndex);
    if (pieceData === null) return false;
    return this.verifyPiece(pieceIndex, pieceData);
  }

  verifyPiece(pieceIndex: PieceIndex, pieceData: Buffer): boolean {
    const pieceHash = this.metainfo.info.pieceHashes[pieceIndex];
    if (pieceHash === undefined) throw new Error("Piece index out of bounds");
    const calculatedHash = sha1Hash(pieceData);
    return Buffer.from(pieceHash).equals(calculatedHash);
  }

  bitfield(): Bitfield {
    const bitfield = new Bitfield(this.metainfo.info.pieceHashes.length);
    for (const [piece, progress] of this.pieceProgress) {
      if (progress.status === "complete") bitfield.set(piece);
    }
    return bitfield;
  }

  hasPieceBlock(piece: PieceIndex, blockIndex: number): boolean {
    return this.pieceProgress.get(piece)?.blocks.has(blockIndex) || false;
  }

  async writePieceBlock(
    blockRequest: BlockRequest,
    data: Buffer
  ): Promise<boolean> {
    let pieceProgress = this.pieceProgress.get(blockRequest.piece);
    if (pieceProgress === undefined) {
      const blockCount = Math.ceil(
        this.metainfo.info.pieceLength / this.config.blockSize
      );
      pieceProgress = {
        status: "in-progress",
        blocks: new Bitfield(blockCount),
      };
      this.pieceProgress.set(blockRequest.piece, pieceProgress);
    }

    const blockIndex = Math.floor(blockRequest.begin / this.config.blockSize);
    pieceProgress.blocks.set(blockIndex);

    const fileWrites = this.#fileWrites(blockRequest, data);
    for (const { file, offset, data } of fileWrites) {
      const filePath = [this.config.downloadsDir, ...file.path].join("/");

      const fd = await fs.open(filePath, "a");
      fd.write(data, 0, data.length, offset);
      fd.close();
    }
    if (pieceProgress.blocks.hasAllSet()) {
      const valid = await this.verifyPieceFromFile(blockRequest.piece);
      if (!valid) throw new Error("Piece verification failed");
      return true;
    }
    return false;
  }

  #fileWrites(blockRequest: BlockRequest, data: Buffer): PartialFileWrite[] {
    const pieceOffset = blockRequest.piece * this.metainfo.info.pieceLength;
    let totalOffset = 0;
    const firstFile = this.files.find((f) => {
      const fileEnd = f.length + totalOffset;
      if (fileEnd > blockRequest.begin) return true;
      totalOffset += f.length;
      return false;
    });
    if (firstFile === undefined)
      throw new Error("Block request is out of bounds");

    // For now lets assume the block never straddles files
    const endOfFileOrAllOfBlock = Math.min(
      firstFile.length - blockRequest.begin,
      data.length
    );
    return [
      {
        file: firstFile,
        offset: pieceOffset + blockRequest.begin - totalOffset,
        data: data.subarray(0, endOfFileOrAllOfBlock),
      },
    ];
  }

  async #extractPieceData(pieceIndex: PieceIndex): Promise<Buffer | null> {
    const pieceLength = this.metainfo.info.pieceLength;
    const pieceOffset = pieceIndex * pieceLength;
    const pieceData = Buffer.alloc(pieceLength);
    let fileOffset = 0;

    for (const file of this.files) {
      if (pieceOffset < fileOffset + file.length) {
        const filePath = [this.config.downloadsDir, ...file.path].join("/");
        const fd = await fs.open(filePath, "r").catch(() => undefined);
        if (fd === undefined) break;
        const readLength = Math.min(
          file.length - (pieceOffset - fileOffset),
          pieceLength
        );
        const readData = await fd.read(
          pieceData,
          0,
          readLength,
          pieceOffset - fileOffset
        );
        fd.close();
        if (readData.buffer.length !== readLength) {
          console.error("Failed to read piece data from file");
          return null;
        }
        break;
      }
      fileOffset += file.length;
    }
    return pieceData;
  }
}
