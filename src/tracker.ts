import type { Config } from "#src/config.js";
import type { Metainfo } from "#src/torrentFile.js";

export async function trackerRequest(config: Config, meta: Metainfo) {
  const announce = meta.announce;

  const announceUrl = new URL(announce);
  const params = {
    // info_hash: meta.infoHash,
    peer_id: config.peerId,
    port: config.port,
    uploaded: 0,
    downloaded: 0,
    left: meta.totalLength(),
    compact: 0,
    event: "started",
  };
  for (const [k, v] of Object.entries(params)) {
    announceUrl.searchParams.append(k, v.toString());
  }

  console.log(
    "announceUrl",
    announceUrl.toString() + `&info_hash=${meta.infoHash}`
  );
  const response = await fetch(
    announceUrl.toString() + `&info_hash=${meta.infoHash}`
  );
  const body = await response.text();
  console.log(body);
}
