import type { Metainfo } from "#src/torrentFile.js";
import type { Config } from "#src/config.js";

export async function trackerRequest(config: Config, meta: Metainfo) {
  const announce = meta.announce;

  const announceUrl = new URL(announce);
  announceUrl.searchParams.append("info_hash", meta.infoHash);

  return await fetch(announceUrl);
}
