import bencode from "bencode";
import crypto from "crypto";

export interface Metainfo {
  announce: string;
  announceList?: string[][];
  info: SingleFileInfo | MultiFileInfo;
  infoHash: string;
}

export interface FileInfo {
  pieceLength: number;
  pieces: string;
  private?: 0 | 1;
}

export interface SingleFileInfo extends FileInfo {
  length: number;
  name: string;
  md5sum?: string;
}

export interface MultiFileInfo extends FileInfo {
  files: {
    length: number;
    md5sum?: string;
    path: string[];
  };
}

function buildInfoHash(info: any): string {
  const encodedInfo = bencode.encode(info);
  const hash = crypto.createHash("sha1");
  hash.update(encodedInfo);
  return hash.digest("hex");
}

export function buildMetainfo(data: Buffer): Metainfo {
  const decodedData = bencode.decode(data);
  if (decodedData.info.files)
    throw new Error("Multi-file torrents are not supported yet");

  const metainfo: Metainfo = {
    announce: decodedData.announce,
    announceList: decodedData["announce-list"],
    infoHash: buildInfoHash(decodedData.info),
    info: {
      pieceLength: decodedData.info["piece length"],
      pieces: decodedData.info.pieces,
      length: decodedData.info.length,
      name: decodedData.info.name,
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
