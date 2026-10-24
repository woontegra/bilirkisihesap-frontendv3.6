/**
 * denemegpt.udf kapsayıcısı: deflate, yerel başlıkta sıfır crc/boyut,
 * bayrak 0x0808, veri tanımlayıcısı ve merkezi dizin.
 */

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function bytesOf(values: number[]): Uint8Array {
  return Uint8Array.from(values);
}

function u16(value: number): Uint8Array {
  return bytesOf([value & 0xff, (value >> 8) & 0xff]);
}

function u32(value: number): Uint8Array {
  return bytesOf([value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff]);
}

function blobPart(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([blobPart(data)]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([blobPart(data)]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const DOS_TIME = 0xbecf;
const DOS_DATE = 0x5d39;
const ZIP_FLAG = 0x0808;

export async function zipSingleStoredXml(name: string, xml: string): Promise<Uint8Array> {
  const payload = new TextEncoder().encode(xml);
  const compressed = await deflateRaw(payload);
  const crc = crc32(payload);
  const nameBytes = new TextEncoder().encode(name);

  const local = concat([
    u32(0x04034b50),
    u16(20),
    u16(ZIP_FLAG),
    u16(8),
    u16(DOS_TIME),
    u16(DOS_DATE),
    u32(0),
    u32(0),
    u32(0),
    u16(nameBytes.length),
    u16(0),
    nameBytes,
  ]);
  const descriptor = concat([u32(0x08074b50), u32(crc), u32(compressed.length), u32(payload.length)]);
  const central = concat([
    u32(0x02014b50),
    u16(20),
    u16(20),
    u16(ZIP_FLAG),
    u16(8),
    u16(DOS_TIME),
    u16(DOS_DATE),
    u32(crc),
    u32(compressed.length),
    u32(payload.length),
    u16(nameBytes.length),
    u16(0),
    u16(0),
    u16(0),
    u16(0),
    u32(0),
    u32(0),
    nameBytes,
  ]);
  const eocd = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(1),
    u16(1),
    u32(central.length),
    u32(local.length + compressed.length + descriptor.length),
    u16(0),
  ]);
  return concat([local, compressed, descriptor, central, eocd]);
}

export async function readZipEntries(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("ZIP son kaydı yok");
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const out = new Map<string, Uint8Array>();
  for (let n = 0; n < count; n += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("Merkezi dizin okunamadı");
    const method = view.getUint16(offset + 10, true);
    const csize = view.getUint32(offset + 20, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localOff = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLen));
    const localNameLen = view.getUint16(localOff + 26, true);
    const localExtraLen = view.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + localNameLen + localExtraLen;
    const compressed = bytes.subarray(dataStart, dataStart + csize);
    out.set(name, method === 0 ? compressed : await inflateRaw(compressed));
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
