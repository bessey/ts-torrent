import { Transform, type TransformCallback } from "node:stream";

/**
Transforms an arbitrarily chunked stream of data into a stream of BitTorrent
protocol compliant messages
*/
export class TorrentMessageChunked extends Transform {
  nextMessage: Buffer;
  hasHandshaken: boolean;
  logger: (message: string) => void;

  constructor(logger: (message: string) => void) {
    super();
    this.logger = logger;
    this.nextMessage = Buffer.from([]);
    this.hasHandshaken = false;
  }

  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: TransformCallback
  ): void {
    const messages = this.#accumulateMessages(chunk);
    for (const message of messages) {
      this.push(message);
    }
    callback();
  }

  #accumulateMessages(messageChunk: Buffer): Buffer[] {
    this.nextMessage = Buffer.concat([this.nextMessage, messageChunk]);

    // Handshake is a special case
    if (!this.hasHandshaken) {
      const pstrlen = this.nextMessage.readUInt8(0);
      const pstr = this.nextMessage.subarray(1, pstrlen + 1).toString("ascii");
      if (pstr !== "BitTorrent protocol")
        throw new Error(`Unknown protocol: ${pstr} ${pstr.length}`);
      const peerId = this.nextMessage
        .subarray(pstrlen + 29, pstrlen + 29 + 20)
        .toString("ascii");
      this.logger(`handshake ${peerId}`);
      const length = 49 + pstrlen;
      if (this.nextMessage.length < length) return [];
      this.hasHandshaken = true;
      this.#clearLastMessage(length);
      return [];
    }

    const messages = [];

    while (true) {
      if (this.nextMessage.length < 4) return messages;
      const payloadLength = this.nextMessage.readUInt32BE(0);
      const length = payloadLength + 4;
      if (this.nextMessage.length < length) return messages;

      messages.push(this.nextMessage.subarray(0, length));
      this.#clearLastMessage(length);
    }
  }

  #clearLastMessage(lastMessageLength: number): void {
    if (this.nextMessage.length < lastMessageLength)
      throw new Error("Last message shorter than length");
    if (this.nextMessage.length === lastMessageLength) {
      this.nextMessage = Buffer.from([]);
    } else {
      this.nextMessage = this.nextMessage.subarray(lastMessageLength);
    }
  }
}
