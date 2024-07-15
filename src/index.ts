import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import { program } from "commander";
import {
  maintainPeerConnections,
  saturatePieceBlockRequests,
} from "#src//algorithm.js";
import { every } from "#src//utils.js";
import { Bitfield } from "#src/bitfield.js";
import { PeerState } from "#src/peer.js";
import { type Metainfo, buildMetainfo } from "#src/torrentFile.js";
import { getTrackerResponse } from "#src/tracker.js";
import type { Config } from "#src/types.js";

if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse();
  main();
}

export class TorrentState {
  config: Config;
  metainfo: Metainfo;
  availablePeers: Set<PeerState>;
  activePeers: Set<PeerState>;
  ignoredPeers: Set<PeerState>;
  bitfield: Bitfield;
  requestsInFlight: Record<number, PeerState>;

  constructor(config: Config, metainfo: Metainfo) {
    this.config = config;
    this.metainfo = metainfo;
    this.availablePeers = new Set();
    this.activePeers = new Set();
    this.ignoredPeers = new Set();
    this.requestsInFlight = {};

    const emptyBitfield = Buffer.alloc(metainfo.info.pieces.length);
    this.bitfield = new Bitfield(emptyBitfield);
  }

  peerConnected(peer: PeerState) {
    this.activePeers.add(peer);
    this.availablePeers.delete(peer) || this.ignoredPeers.delete(peer);
  }

  peerDisconnected(peer: PeerState) {
    if (this.activePeers.delete(peer)) this.availablePeers.add(peer);
  }

  peerErrored(peer: PeerState) {
    this.activePeers.delete(peer);
    this.ignoredPeers.add(peer);
  }
}
export async function main(): Promise<Promise<void>> {
  const config: Config = {
    filePath: "./test/debian-12.6.0-arm64-netinst.iso.torrent",
    downloadsDirectory: "./downloads/",
    port: 6881,
    peerId: randomBytes(20),
    desiredPeers: 30,
    desiredPiecesInFlight: 1,
    desiredBlocksInFlight: 2,
  };

  const data = await fs.readFile(config.filePath);
  const metainfo = buildMetainfo(data);
  const torrentState = new TorrentState(config, metainfo);
  const trackerData = await getTrackerResponse(config, metainfo);
  console.log(trackerData);
  torrentState.availablePeers = new Set(
    trackerData.peers.map((peer) => new PeerState(peer))
  );

  every(100, () => maintainPeerConnections(torrentState));
  every(100, () => saturatePieceBlockRequests(torrentState));
}
