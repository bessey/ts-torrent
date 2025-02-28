import bencode from "bencode";
import { z } from "zod";
import type { Metainfo } from "#src/torrentFile.js";
import type { Config } from "#src/types.js";
import { sleep } from "#src/utils.js";

const respPeerInfoSchema = z.object({
  ip: z.instanceof(Uint8Array),
  port: z.number(),
});
const peerInfoSchema = z.object({
  ip: z.string(),
  port: z.number(),
});
export type PeerInfo = z.infer<typeof peerInfoSchema>;

export interface TrackerResponse {
  complete: number;
  incomplete: number;
  interval: number;
  peers: PeerInfo[];
}

export async function getTrackerResponse(
  config: Config,
  meta: Metainfo
): Promise<TrackerResponse> {
  const announce = meta.announce;

  const announceUrl = new URL(announce);
  const params = {
    peer_id: config.peerId.toString("ascii"),
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
  if (response.status !== 200) {
    console.log(`Tracker response status ${response.status}, retrying...`);
    await sleep(500);
    return getTrackerResponse(config, meta);
  }
  const body = await response.arrayBuffer();
  const decoded = bencode.decode(Buffer.from(body));

  return {
    complete: decoded.complete,
    incomplete: decoded.incomplete,
    interval: decoded.interval,
    peers: decoded.peers.map((peer: unknown) => {
      const peerInfo = respPeerInfoSchema.parse(peer);
      return {
        ip: Buffer.from(peerInfo.ip).toString("ascii"),
        port: peerInfo.port,
      };
    }),
  };
}
