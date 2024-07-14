import type { Peer } from "#src/tracker.js";
import type { Metainfo } from "#src/torrentFile.js";

import net from "node:net";

export class PeerConn {
  peer: Peer;
  amChoking: boolean;
  amInterested: boolean;
  peerChoking: boolean;
  peerInterested: boolean;
  client: net.Socket | null;
  lastErrorAt: number | null;
  status: "connecting" | "connected" | "disconnected";

  constructor(peer: Peer) {
    this.peer = peer;
    this.amChoking = true;
    this.amInterested = false;
    this.peerChoking = true;
    this.peerInterested = false;
    this.client = null;
    this.lastErrorAt = null;
    this.status = "disconnected";
  }

  async connect(): Promise<net.Socket> {
    const client = new net.Socket();

    client.connect(this.peer.port, this.peer.ip, () => {
      this.#log("connecting");
      this.status = "connecting";
    });

    client.on("data", (data) => {
      this.#log("data", Buffer.from(data).toString("ascii"));
      this.status = "connected";
    });
    client.on("error", (err) => {
      this.#log("error", err);
      this.lastErrorAt = Date.now();
    });
    client.on("close", () => {
      this.#log("closed");
      this.status = "disconnected";
    });
    client.on("timeout", () => {
      this.#log("timeout");
      this.status = "disconnected";
      client.destroy();
    });

    this.client = client;
    return client;
  }

  handshake(metainfo: Metainfo): void {
    const handshake = this.#handshakeMessage(metainfo);
    this.client?.write(handshake);
  }

  #handshakeMessage(metainfo: Metainfo): Buffer {
    const pstrlen = Buffer.from([19]);
    const pstr = Buffer.from("BitTorrent protocol");
    const reserved = Buffer.alloc(8);
    const infoHash = metainfo.infoHash;
    const peerId = this.peer.id;

    return Buffer.concat([pstrlen, pstr, reserved, infoHash, peerId]);
  }

  #log(message: string, ...rest: any): void {
    console.log(`[${this.peer.ip}:${this.peer.port}] ${message}`, ...rest);
  }
}
