import net from "node:net";

import { Bitfield } from "#src/Bitfield.js";
import type { Metainfo } from "#src/torrentFile.js";
import type { PeerInfo } from "#src/tracker.js";
import type {
  BlockIndex,
  BlockOffset,
  BlockRequest,
  Config,
  PieceIndex,
} from "#src/types.js";
import { TorrentMessageChunked } from "./TorrentMessageChunked.js";

export interface CallbackArgs {
  onConnecting: () => void;
  onDisconnect: () => void;
  onError: (err: Error) => void;
  onPieceBlock: (blockRequest: BlockRequest, data: Buffer) => Promise<boolean>;
}

export class PeerState {
  blockSize: number;
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
  #blocksInFlight: Map<PieceIndex, Set<BlockIndex>>;

  constructor(config: Config, peer: PeerInfo) {
    this.blockSize = config.blockSize;
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
    this.#blocksInFlight = new Map();
  }

  async connect(
    config: Config,
    metainfo: Metainfo,
    callbacks: CallbackArgs
  ): Promise<net.Socket> {
    const client = new net.Socket();
    const chunkByMessage = new TorrentMessageChunked((logMessage) =>
      this.#logRecv(logMessage)
    );
    chunkByMessage.on("data", (message) =>
      this.#processMessage(message, callbacks)
    );

    client.pipe(chunkByMessage);

    client.connect(this.peer.port, this.peer.ip, () => {
      this.#log("connected");
      this.status = "connected";
      this.sendHandshake(config, metainfo);
    });
    client.on("error", (err) => {
      this.#log("error", err);
      this.lastErrorAt = Date.now();
      callbacks.onError(err);
    });
    client.on("close", () => {
      this.#log("closed");
      this.status = "disconnected";
      callbacks.onDisconnect();
    });
    client.on("timeout", () => {
      this.#log("timeout");
      client.destroy();
    });

    this.#log("connecting");
    this.status = "connecting";
    callbacks.onConnecting();
    this.client = client;
    return client;
  }

  sendHandshake(config: Config, metainfo: Metainfo): boolean {
    this.#assertClient();
    // handshake: <pstrlen><pstr><reserved><info_hash><peer_id>
    const pstrlen = Buffer.from([19]);
    const pstr = Buffer.from("BitTorrent protocol");
    const reserved = Buffer.alloc(8);
    const infoHash = metainfo.infoHash;

    const message = Buffer.concat([
      pstrlen,
      pstr,
      reserved,
      infoHash,
      config.peerId,
    ]);

    return this.client.write(message);
  }

  sendChoke(): boolean {
    this.#assertClient();
    if (this.amChoking) return false;
    // choke: <len=0001><id=0>
    const message = Buffer.from([0, 0, 0, 1, 0]);
    this.#logSend("choke");
    return this.client.write(message);
  }

  sendUnchoke(): boolean {
    this.#assertClient();
    if (!this.amChoking) return false;
    // unchoke: <len=0001><id=1>
    const message = Buffer.from([0, 0, 0, 1, 1]);
    this.#logSend("unchoke");
    return this.client.write(message);
  }
  sendInterested(): boolean {
    this.#assertClient();
    if (this.amInterested) return false;
    // interested: <len=0001><id=2>
    const message = Buffer.from([0, 0, 0, 1, 2]);
    this.#logSend("interested");
    return this.client.write(message);
  }

  sendNotInterested(): boolean {
    this.#assertClient();
    if (!this.amInterested) return false;
    // not interested: <len=0001><id=3>
    const message = Buffer.from([0, 0, 0, 1, 3]);
    this.#logSend("not interested");
    return this.client.write(message);
  }

  sendHave(pieceIndex: number): boolean {
    this.#assertClient();
    // have: <len=0005><id=4><piece index>
    const message = Buffer.alloc(9);
    message.writeUInt32BE(5, 0);
    message.writeUInt8(4, 4);
    message.writeUInt32BE(pieceIndex, 5);
    this.#logSend("have", pieceIndex);
    return this.client.write(message);
  }

  sendBitfield(bitfield: Bitfield): boolean {
    this.#assertClient();
    // bitfield: <len=0001+X><id=5><bitfield>
    const header = Buffer.alloc(5 + bitfield.byteLength);
    header.writeUInt32BE(1 + bitfield.byteLength, 0);
    header.writeUInt8(5, 4);
    const message = Buffer.concat([header, bitfield.bits]);
    this.#logSend(`bitfield: ${Math.round(bitfield.progress)}% complete`);
    return this.client.write(message);
  }

  sendRequest(pieceIndex: PieceIndex, begin: BlockOffset): boolean {
    this.#assertClient();
    // request: <len=0013><id=6><index><begin><length>
    const message = Buffer.alloc(17);
    message.writeUInt32BE(13, 0);
    message.writeUInt8(6, 4);
    message.writeUInt32BE(pieceIndex, 5);
    message.writeUInt32BE(begin, 9);
    message.writeUInt32BE(this.blockSize, 13);
    const blockIndex = begin / this.blockSize;

    this.#logSend(`request ${pieceIndex}.${blockIndex}`);
    const blocksInFlightForPiece = this.blocksInFlight(pieceIndex);
    blocksInFlightForPiece.add(blockIndex);
    return this.client.write(message);
  }

  blocksInFlight(pieceIndex: PieceIndex): Set<BlockIndex> {
    let blockSet = this.#blocksInFlight.get(pieceIndex);
    if (blockSet === undefined) {
      blockSet = new Set();
      this.#blocksInFlight.set(pieceIndex, blockSet);
    }
    return blockSet;
  }

  async #processMessage(
    message: Buffer,
    callbacks: CallbackArgs
  ): Promise<void> {
    if (message.length - 4 === 0) {
      this.#logRecv("keep-alive");
      return;
    }
    const id = message.readUInt8(4);
    switch (id) {
      case 0:
        this.#logRecv("choke");
        this.peerChoking = true;
        break;
      case 1:
        this.#logRecv("unchoke");
        this.peerChoking = false;
        break;
      case 2:
        this.#logRecv("interested");
        this.peerInterested = true;
        break;
      case 3:
        this.#logRecv("not interested");
        this.peerInterested = false;
        break;
      case 4:
        this.#logRecv("have");
        break;
      case 5:
        this.bitfield = new Bitfield(message.subarray(5));
        this.#logRecv(
          `bitfield: ${Math.round(this.bitfield.progress)}% complete`
        );
        break;
      case 6:
        this.#logRecv("request");
        break;
      case 7:
        await this.#downloadPieceBlock(message, callbacks.onPieceBlock);
        break;
      case 8:
        this.#logRecv("cancel");
        break;
      case 9:
        this.#logRecv("port");
        break;
      default:
        this.#logRecv("unknown", id);
    }
  }

  async #downloadPieceBlock(
    message: Buffer,
    onPieceBlock: CallbackArgs["onPieceBlock"]
  ): Promise<void> {
    // piece: <len=0009+X><id=7><index><begin><block>
    const pieceIndex = message.readUInt32BE(5);
    const begin = message.readUInt32BE(9);
    const block = message.subarray(13);
    this.#logRecv(`piece ${pieceIndex}.${begin / this.blockSize}`);
    const pieceProcessedOk = await onPieceBlock(
      { piece: pieceIndex, begin },
      block
    );
    if (pieceProcessedOk) {
      this.#blocksInFlight.get(pieceIndex)?.delete(begin / this.blockSize);
    }
  }

  #log(message: string, ...rest: unknown[]): void {
    console.log(`[${this.peer.ip}:${this.peer.port}] ${message}`, ...rest);
  }

  #logRecv(message: string, ...rest: unknown[]): void {
    this.#log(`<< ${message}`, ...rest);
  }

  #logSend(message: string, ...rest: unknown[]): void {
    this.#log(`>> ${message}`, ...rest);
  }

  #assertClient(): asserts this is { client: net.Socket } {
    if (this.client === null) throw new Error("Client not connected");
  }
}
