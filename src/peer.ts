import type { Metainfo } from "#src/torrentFile.js";
import type { Config } from "./config.js";

import net from "node:net";
export interface Peer {
  ip: string;
  port: number;
}

export interface ConnectArgs {
  config: Config;
  metainfo: Metainfo;
  onConnecting: () => void;
  onDisconnect: () => void;
  onError: (err: Error) => void;
}
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

  async connect({
    config,
    metainfo,
    onConnecting,
    onDisconnect,
    onError,
  }: ConnectArgs): Promise<net.Socket> {
    const client = new net.Socket();

    client.connect(this.peer.port, this.peer.ip, () => {
      this.#log("connected");
      this.status = "connected";
      this.handshake(config, metainfo);
    });
    this.#log("connecting");
    this.status = "connecting";
    onConnecting();

    client.on("data", (data) => {
      this.#log("data", Buffer.from(data).toString("ascii"));
    });
    client.on("error", (err) => {
      this.#log("error", err);
      this.lastErrorAt = Date.now();
      onError(err);
    });
    client.on("close", () => {
      this.#log("closed");
      this.status = "disconnected";
      onDisconnect();
    });
    client.on("timeout", () => {
      this.#log("timeout");
      client.destroy();
    });

    this.client = client;
    return client;
  }

  handshake(config: Config, metainfo: Metainfo): void {
    const handshake = this.#handshakeMessage(config, metainfo);
    this.client?.write(handshake);
  }

  #handshakeMessage(config: Config, metainfo: Metainfo): Buffer {
    const pstrlen = Buffer.from([19]);
    const pstr = Buffer.from("BitTorrent protocol");
    const reserved = Buffer.alloc(8);
    const infoHash = metainfo.infoHash;

    return Buffer.concat([pstrlen, pstr, reserved, infoHash, config.peerId]);
  }

  #log(message: string, ...rest: any): void {
    console.log(`[${this.peer.ip}:${this.peer.port}] ${message}`, ...rest);
  }
}
