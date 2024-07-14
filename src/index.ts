import fs from "node:fs/promises";
import { program } from "commander";

import { randomBytes } from "node:crypto";
import type { Config } from "#src/config.js";
import { buildMetainfo } from "#src/torrentFile.js";
import { getTrackerResponse } from "#src/tracker.js";
import { PeerState } from "#src/peer.js";
import { every } from "./utils.js";
import { Bitfield } from "./bitfield.js";

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
  desiredPeers: 30,
};

const data = await fs.readFile(download.filePath);

const metainfo = buildMetainfo(data);

const trackerData = await getTrackerResponse(config, metainfo);

console.log(trackerData);

const peerConns = trackerData.peers.map((peer) => new PeerState(peer));

interface AppState {
  availablePeers: Set<PeerState>;
  activePeers: Set<PeerState>;
  ignoredPeers: Set<PeerState>;
  bitfield: Bitfield;
}

const appState: AppState = {
  availablePeers: new Set(peerConns),
  activePeers: new Set(),
  ignoredPeers: new Set(),
  bitfield: new Bitfield(
    Buffer.alloc(Math.ceil(metainfo.totalLength() / metainfo.info.pieceLength))
  ),
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

every(5000, async () => {
  const desiredPiece = 1000;
  for (const p of appState.activePeers) {
    if (p.bitfield === null) continue;
    if (!p.bitfield.has(desiredPiece)) continue;
    return p.requestPiece(metainfo, desiredPiece);
  }
});
