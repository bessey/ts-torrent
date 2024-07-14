import fs from "node:fs/promises";
import { program } from "commander";

import { randomBytes } from "node:crypto";
import type { Config } from "#src/config.js";
import { buildMetainfo } from "#src/torrentFile.js";
import { getTrackerResponse } from "#src/tracker.js";
import { PeerConn } from "#src/peer.js";
import { every } from "./utils.js";

program.parse();

interface Download {
  filePath: string;
}

const download: Download = {
  filePath: "./test/debian-12.6.0-arm64-netinst.iso.torrent",
};

const config: Config = {
  downloadsDirectory: "./downloads/",
  port: 6881,
  peerId: randomBytes(20),
  desiredPeers: 10,
};

const data = await fs.readFile(download.filePath);

const metainfo = buildMetainfo(data);

const trackerData = await getTrackerResponse(config, metainfo);

console.log(trackerData);

const peerConns = trackerData.peers.map((peer) => new PeerConn(peer));

interface AppState {
  activePeers: Set<PeerConn>;
  availablePeers: Set<PeerConn>;
  ignoredPeers: Set<PeerConn>;
}

const appState: AppState = {
  activePeers: new Set(),
  availablePeers: new Set(peerConns),
  ignoredPeers: new Set(),
};

every(10, async () => {
  const neededPeers = config.desiredPeers - appState.activePeers.size;
  if (neededPeers <= 0) return;
  let i = 0;
  for (const peerConn of appState.availablePeers) {
    if (i >= neededPeers) break;
    if (peerConn.lastErrorAt && Date.now() - peerConn.lastErrorAt < 60000)
      continue;
    peerConn.connect({
      config,
      metainfo,
      onConnecting() {
        appState.activePeers.add(peerConn);
        appState.availablePeers.delete(peerConn) ||
          appState.ignoredPeers.delete(peerConn);
      },
      onDisconnect() {
        if (appState.activePeers.delete(peerConn))
          appState.availablePeers.add(peerConn);
      },
      onError() {
        appState.activePeers.delete(peerConn);
        appState.ignoredPeers.add(peerConn);
      },
    });
    i++;
  }
  console.log(
    `New connections attempted. Active: ${appState.activePeers.size}, Available: ${appState.availablePeers.size}, Ignored: ${appState.ignoredPeers.size}`
  );
});
