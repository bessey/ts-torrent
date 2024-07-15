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
  status: "connecting" | "connected" | "handshaken" | "disconnected";
  bitfield: Bitfield | null;
  nextMessage: Buffer;

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
    this.nextMessage = Buffer.from([]);
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

    client.on("data", (messageChunk) => {
      this.#processMessageChunk(messageChunk);
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

  #processMessageChunk(messageChunk: Buffer): void {
    let message = this.#accumulateMessage(messageChunk);
    while (message) {
      if (message.length - 4 === 0) {
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
          this.bitfield = new Bitfield(Buffer.from(message, 5));
          this.#log(
            `bitfield: ${Math.round(this.bitfield.progress)}% complete`
          );
          break;
        case 6:
          this.#log("request");
          break;
        case 7:
          this.#downloadPieceBlock(message);
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
      message = this.#accumulateMessage(Buffer.from([]));
    }
  }

  #downloadPieceBlock(message: Buffer): void {
    // piece: <len=0009+X><id=7><index><begin><block>
    // const blockSize = length - 9;
    // const index = message.readUInt32BE(5);
    // const begin = message.readUInt32BE(9);
    this.#log("piece");
    // const block = Buffer.from(message, 13, length - 9));
  }

  #handshakeMessage(config: Config, metainfo: Metainfo): Buffer {
    const pstrlen = Buffer.from([19]);
    const pstr = Buffer.from("BitTorrent protocol");
    const reserved = Buffer.alloc(8);
    const infoHash = metainfo.infoHash;

    return Buffer.concat([pstrlen, pstr, reserved, infoHash, config.peerId]);
  }

  #accumulateMessage(messageChunk: Buffer): Buffer | null {
    this.nextMessage = Buffer.concat([this.nextMessage, messageChunk]);
    if (this.nextMessage.length < 4) return null;

    // Handshake is a special case
    if (this.status !== "handshaken") {
      const pstrlen = this.nextMessage.readUInt8(0);
      const length = 49 + pstrlen;
      this.status = "handshaken";
      if (this.nextMessage.length === length) {
        this.nextMessage = Buffer.from([]);
      } else {
        this.nextMessage = Buffer.from(this.nextMessage, length);
      }
      return null;
    }

    const payloadlength = this.nextMessage.readUInt32BE(0);
    const length = payloadlength + 4;

    if (this.nextMessage.length < length) return null;

    const currentMessage = Buffer.from(this.nextMessage, 0, length);
    if (this.nextMessage.length === length) {
      this.nextMessage = Buffer.from([]);
    } else {
      this.nextMessage = Buffer.from(this.nextMessage, length);
    }

    return currentMessage;
  }

  #log(message: string, ...rest: any): void {
    console.log(`[${this.peer.ip}:${this.peer.port}] ${message}`, ...rest);
  }
}
