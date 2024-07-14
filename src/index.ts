import fs from "node:fs/promises";
import { program } from "commander";

import { randomBytes } from "node:crypto";
import type { Config } from "#src/config.js";
import { buildMetainfo } from "#src/torrentFile.js";
import { getTrackerResponse } from "#src/tracker.js";
import { PeerConn } from "#src/peer.js";

program.parse();

interface Download {
  filePath: string;
}

const download: Download = {
  filePath: "./test/ubuntu-24.04-desktop-amd64.iso.torrent",
};

const config: Config = {
  downloadsDirectory: "./downloads/",
  port: 6881,
  peerId: randomBytes(20),
};

const data = await fs.readFile(download.filePath);

const metainfo = buildMetainfo(data);

const trackerData = await getTrackerResponse(config, metainfo);

console.log(trackerData);

const peerConns = trackerData.peers.map((peer) => new PeerConn(peer));

const desiredPeers = 10;

const activePeers = [];

for (const peerConn of peerConns.slice(0, desiredPeers - activePeers.length)) {
  await peerConn.connect();
  peerConn.handshake(metainfo);
  activePeers.push(peerConn);
}
