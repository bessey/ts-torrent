import type { Metainfo } from "#src/torrentFile.js";
import { Bitfield } from "./bitfield.js";
import type { Config } from "./config.js";

import net from "node:net";

export const PIECE_SIZE = 2 ** 14;
export interface PeerInfo {
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
export class PeerState {
  peer: PeerInfo;
  amChoking: boolean;
  amInterested: boolean;
  peerChoking: boolean;
  peerInterested: boolean;
  client: net.Socket | null;
  lastErrorAt: number | null;
  status: "connecting" | "connected" | "disconnected";
  bitfield: Bitfield | null;

  constructor(peer: PeerInfo) {
    this.peer = peer;
    this.amChoking = true;
    this.amInterested = false;
    this.peerChoking = true;
    this.peerInterested = false;
    this.client = null;
    this.lastErrorAt = null;
    this.status = "disconnected";
    this.bitfield = null;
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

    client.on("data", (message) => {
      this.#processMessage(message);
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

  requestPiece(metainfo: Metainfo, pieceIndex: number): void {
    if (!this.bitfield) return;

    const blocksPerPiece = Math.ceil(metainfo.info.pieceLength / PIECE_SIZE);
    for (let i = 0; i < blocksPerPiece; i++) {
      const begin = i * PIECE_SIZE;
      this.requestBlock(pieceIndex, begin);
    }
  }
  requestBlock(pieceIndex: number, begin: number): void {
    // request: <len=0013><id=6><index><begin><length>
    const message = Buffer.alloc(17);
    message.writeUInt32BE(13, 0);
    message.writeUInt8(6, 4);
    message.writeUInt32BE(pieceIndex, 5);
    message.writeUInt32BE(begin, 9);
    message.writeUInt32BE(PIECE_SIZE, 13);

    this.#log(`requesting piece ${pieceIndex}, block ${begin / PIECE_SIZE}`);
    this.client?.write(message);
  }

  #processMessage(message: Buffer): void {
    const length = message.readUInt32BE(0);
    if (length === 0) {
      this.#log("keep-alive");
      return;
    }
    const id = message.readUInt8(4);
    switch (id) {
      case 0:
        this.#log("choke");
        this.peerChoking = true;
        break;
      case 1:
        this.#log("unchoke");
        this.peerChoking = false;
        break;
      case 2:
        this.#log("interested");
        this.peerInterested = true;
        break;
      case 3:
        this.#log("not interested");
        this.peerInterested = false;
        break;
      case 4:
        this.#log("have");
        break;
      case 5:
        this.bitfield = new Bitfield(Buffer.from(message, 5, length - 5));
        this.#log(`bitfield: ${Math.round(this.bitfield.progress)}% complete`);
        break;
      case 6:
        this.#log("request");
        break;
      case 7:
        this.#log("piece");
        break;
      case 8:
        this.#log("cancel");
        break;
      case 9:
        this.#log("port");
        break;
      default:
        this.#log("unknown", id);
    }
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
