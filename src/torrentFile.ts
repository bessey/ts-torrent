import crypto from "node:crypto";
import bencode from "bencode";

export interface Metainfo {
  announce: string;
  announceList?: string[][];
  info: SingleFileInfo | MultiFileInfo;
  infoHash: Buffer;
  totalLength(): number;
}

export interface FileInfo {
  pieceLength: number;
  pieces: string;
  private?: 0 | 1;
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

function buildInfoHash(info: unknown): string {
  const encodedInfo = bencode.encode(info);
  const hash = crypto.createHash("sha1");
  hash.update(encodedInfo);
  return "%2a%a4%f5%a7%e2%09%e5%4b%32%80%3d%43%67%09%71%c4%c8%ca%aa%05";
  // return hash.digest("binary");
}

export function buildMetainfo(data: Buffer): Metainfo {
  const decodedData = bencode.decode(data);
  if (decodedData.info.files)
    throw new Error("Multi-file torrents are not supported yet");

  const metainfo: Metainfo = {
    announce: str(decodedData.announce),
    announceList: decodedData["announce-list"],
    infoHash: buildInfoHash(decodedData.info),
    totalLength: () => decodedData.info.length,
    info: {
      pieceLength: decodedData.info["piece length"],
      pieces: decodedData.info.pieces,
      length: decodedData.info.length,
      name: str(decodedData.info.name),
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
