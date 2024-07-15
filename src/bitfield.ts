export class Bitfield {
  bits: Uint8Array;
  progress: number;

  constructor(bitCount: number);
  constructor(bits: Uint8Array);
  constructor(bitsOrBitCount: Uint8Array | number) {
    if (bitsOrBitCount instanceof Uint8Array) {
      this.bits = bitsOrBitCount;
    } else {
      if (bitsOrBitCount < 8)
        throw new Error("Bitfield length must be at least one byte");
      this.bits = new Uint8Array(Math.ceil(bitsOrBitCount / 8));
    }
    this.progress = this.totalProgress();
  }

  has(index: number): boolean {
    const byteIndex = Math.floor(index / 8);
    const bitIndex = index % 8;
    const bit = this.bits[byteIndex];
    if (bit === undefined) throw new Error("Index out of bounds");
    // We know it has the bit if when intersected with a mask with a 1 at the
    // bitIndex position, it is not 0. Fortunately that's truthy in JS.
    return (bit & (1 << (7 - bitIndex))) !== 0;
  }

  hasAllSet(): boolean {
    return this.bits.every((byte) => byte === 0xff);
  }

  isMissing(index: number): boolean {
    return !this.has(index);
  }

  remaining(maximum?: number): number[] {
    const remaining = [];

    // TODO: would be better if this was a lazy iterator
    for (let i = 0; i < (maximum ?? this.length); i++) {
      if (this.isMissing(i)) remaining.push(i);
    }
    return remaining;
  }

  set(index: number): void {
    const byteIndex = Math.floor(index / 8);
    const bitIndex = index % 8;
    this.bits[byteIndex] |= 1 << (7 - bitIndex);
  }

  get byteLength(): number {
    return this.bits.length;
  }

  get length(): number {
    return this.bits.length * 8;
  }

  totalProgress(): number {
    const totalBits = this.bits.length * 8;
    return (
      (this.bits.reduce(
        (acc, byte) => acc + byte.toString(2).split("1").length - 1,
        0
      ) /
        totalBits) *
      100
    );
  }
}
