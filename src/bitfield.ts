export class Bitfield {
  bits: Uint8Array;
  progress: number;

  constructor(bits: Uint8Array) {
    this.bits = bits;
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
