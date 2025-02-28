import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import { program } from "commander";
import {
  maintainPeerConnections,
  saturatePieceBlockRequests,
} from "#src//algorithm.js";
import { every } from "#src//utils.js";
import { PeerState } from "#src/PeerState.js";
import { buildMetainfo } from "#src/torrentFile.js";
import { getTrackerResponse } from "#src/tracker.js";
import type { Config } from "#src/types.js";
import { TorrentState } from "./TorrentState.js";

if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse();
  main();
}

export async function main(): Promise<Promise<void>> {
  const config: Config = {
    filePath: "./test/debian-12.6.0-arm64-netinst.iso.torrent",
    downloadsDir: "./downloads",
    port: 6881,
    peerId: randomBytes(20),
    blockSize: 2 ** 14,
    desiredPeers: 40,
    desiredPiecesInFlight: 5,
    desiredBlocksInFlight: 5,
  };

  const data = await fs.readFile(config.filePath);
  const metainfo = buildMetainfo(data);
  const torrentState = new TorrentState(config, metainfo);
  await torrentState.hydrateBitfield();
  const trackerData = await getTrackerResponse(config, metainfo);
  console.log(trackerData);
  torrentState.availablePeers = new Set(
    trackerData.peers.map((peer) => new PeerState(config, peer))
  );

  every(100, () => maintainPeerConnections(torrentState));
  every(100, () => saturatePieceBlockRequests(torrentState));
}
