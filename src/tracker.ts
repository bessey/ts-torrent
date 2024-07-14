import bencode from "bencode";
import type { Config } from "#src/config.js";
import type { Metainfo } from "#src/torrentFile.js";

export interface TrackerResponse {
  complete: number;
  incomplete: number;
  interval: number;
  peers: {
    id: string;
    ip: string;
    port: number;
  }[];
}

export async function getTrackerResponse(
  config: Config,
  meta: Metainfo
): Promise<TrackerResponse> {
  const announce = meta.announce;

  const announceUrl = new URL(announce);
  const params = {
    peer_id: config.peerId,
    port: config.port,
    uploaded: 0,
    downloaded: 0,
    left: meta.totalLength(),
    event: "started",
  };
  for (const [k, v] of Object.entries(params)) {
    announceUrl.searchParams.append(k, v.toString());
  }

  // I just cannot get node to encode this correctly so doing it manually.
  const escapedInfoHash = [...meta.infoHash.values()]
    .map((v) => `%${v.toString(16).padStart(2, "0")}`)
    .join("");

  const url = `${announceUrl.toString()}&info_hash=${escapedInfoHash}`;

  const response = await fetch(url);
  const body = await response.arrayBuffer();

  const decoded = bencode.decode(Buffer.from(body));

  return {
    complete: decoded.complete,
    incomplete: decoded.incomplete,
    interval: decoded.interval,
    peers: decoded.peers.map((peer: any) => {
      return {
        id: Buffer.from(peer["peer id"]).toString("hex"),
        ip: peer.ip,
        port: peer.port,
      };
    }),
  };
}
