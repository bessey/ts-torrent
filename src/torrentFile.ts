import crypto from "node:crypto";
import bencode from "bencode";

export interface Metainfo {
  announce: string;
  announceList?: string[][];
  info: SingleFileInfo | MultiFileInfo;
  infoHash: Buffer;
  totalLength(): number;
}

export interface TFile {
  length: number;
  md5sum: string;
  path: string[];
}

export interface FileInfo {
  pieceLength: number;
  pieceHashes: Buffer[];
  private?: 0 | 1;
  fileList(): TFile[];
}

export interface SingleFileInfo extends FileInfo {
  name: string;
  length: number;
  md5sum?: string;
}

export interface MultiFileInfo extends FileInfo {
  files: {
    length: number;
    md5sum?: string;
    path: string[];
  };
}

function buildInfoHash(info: unknown): Buffer {
  const encodedInfo = bencode.encode(info);
  const hash = crypto.createHash("sha1");
  hash.update(encodedInfo);
  return hash.digest();
}

export function buildMetainfo(data: Buffer): Metainfo {
  const decodedData = bencode.decode(data);
  if (decodedData.info.files)
    throw new Error("Multi-file torrents are not supported yet");

  const singleFile = {
    md5sum: decodedData.info.md5su,
    length: decodedData.info.length,
    name: str(decodedData.info.name),
  };

  const metainfo: Metainfo = {
    announce: str(decodedData.announce),
    announceList: decodedData["announce-list"],
    infoHash: buildInfoHash(decodedData.info),
    totalLength: () => decodedData.info.length,
    info: {
      ...singleFile,
      pieceLength: decodedData.info["piece length"],
      pieceHashes: buildPieceHashes(decodedData.info.pieces),
      fileList: () => [{ ...singleFile, path: [singleFile.name] }],
    },
  };

  if (decodedData.info.private) {
    const privateNumber = Number.parseInt(decodedData.info.private);
    if (privateNumber !== 0 && privateNumber !== 1)
      throw new Error("Private flag must be 0 or 1");
    metainfo.info.private = privateNumber;
  }

  if ("name" in metainfo.info && decodedData.info.md5sum) {
    metainfo.info.md5sum = decodedData.info.md5sum;
  }

  return metainfo;
}
function str(data: Uint8Array): string {
  return Buffer.from(data).toString("utf-8");
}

function buildPieceHashes(pieces: Buffer): Buffer[] {
  const pieceLength = 20;
  const numPieces = pieces.length / pieceLength;
  const hashes = Array<Buffer>(numPieces);
  for (let i = 0; i < numPieces; i++) {
    hashes[i] = pieces.subarray(i * pieceLength, (i + 1) * pieceLength);
  }
  return hashes;
}
