import fs from "node:fs/promises";
import { Bitfield } from "#src/Bitfield.js";
import type { Metainfo, TFile } from "#src/torrentFile.js";
import type { BlockRequest, Config, PieceIndex } from "#src/types.js";
import type { PartialFileWrite, PieceProgress } from "./torrentState.js";

export class FileManager {
  config: Config;
  metainfo: Metainfo;
  files: TFile[];
  pieceProgress: Record<PieceIndex, PieceProgress>;

  constructor(config: Config, metainfo: Metainfo) {
    this.config = config;
    this.metainfo = metainfo;
    this.files = metainfo.info.fileList();
    this.pieceProgress = {};
  }

  workForPiece(piece: PieceIndex): number[] {
    const pieceProgress = this.pieceProgress[piece];
    if (pieceProgress === undefined)
      return [...Array(this.config.desiredBlocksInFlight).keys()];
    return pieceProgress.blocks.remaining(this.config.desiredBlocksInFlight);
  }

  hasPieceBlock(piece: PieceIndex, blockIndex: number): boolean {
    return this.pieceProgress[piece]?.blocks.has(blockIndex) || false;
  }

  async writePieceBlock(
    blockRequest: BlockRequest,
    data: Buffer
  ): Promise<boolean> {
    let pieceProgress = this.pieceProgress[blockRequest.piece];
    if (pieceProgress === undefined) {
      const blockCount = Math.ceil(
        this.metainfo.info.pieceLength / this.config.blockSize
      );
      pieceProgress = this.pieceProgress[blockRequest.piece] = {
        status: "in-progress",
        blocks: new Bitfield(blockCount),
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
    return pieceProgress.blocks.hasAllSet();
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
