import fs from "fs";

/**
 * Minimal streaming ZIP writer ("stored", no compression — MP4s don't
 * compress). Entries stream straight from disk: local header, data, then a
 * data descriptor with the CRC/size, and a central directory at the end.
 * Plain ZIP (no Zip64), so it's for archives under 4 GB.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Uint8Array, crc = 0): number {
  let c = (crc ^ 0xffffffff) >>> 0;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export type ZipEntry = { name: string } & ({ path: string } | { data: Buffer });

function dosTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** A web ReadableStream of the ZIP bytes. */
export function zipStream(entries: ZipEntry[]): ReadableStream<Uint8Array> {
  const { time, date } = dosTime(new Date());
  const central: Buffer[] = [];
  let offset = 0;
  let i = 0;
  let current: { reader: AsyncIterator<Buffer>; crc: number; size: number; name: Buffer; start: number } | null = null;

  const localHeader = (name: Buffer) => {
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4); // version needed
    h.writeUInt16LE(0x0808, 6); // bit 3: data descriptor, bit 11: UTF-8 names
    h.writeUInt16LE(0, 8); // stored
    h.writeUInt16LE(time, 10);
    h.writeUInt16LE(date, 12);
    // crc / sizes go in the data descriptor
    h.writeUInt16LE(name.length, 26);
    return Buffer.concat([h, name]);
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (current) {
        const { value, done } = await current.reader.next();
        if (!done && value) {
          current.crc = crc32(value, current.crc);
          current.size += value.length;
          offset += value.length;
          controller.enqueue(value);
          return;
        }
        const dd = Buffer.alloc(16);
        dd.writeUInt32LE(0x08074b50, 0);
        dd.writeUInt32LE(current.crc, 4);
        dd.writeUInt32LE(current.size, 8);
        dd.writeUInt32LE(current.size, 12);
        offset += dd.length;
        controller.enqueue(dd);
        const c = Buffer.alloc(46);
        c.writeUInt32LE(0x02014b50, 0);
        c.writeUInt16LE(20, 4);
        c.writeUInt16LE(20, 6);
        c.writeUInt16LE(0x0808, 8);
        c.writeUInt16LE(0, 10);
        c.writeUInt16LE(time, 12);
        c.writeUInt16LE(date, 14);
        c.writeUInt32LE(current.crc, 16);
        c.writeUInt32LE(current.size, 20);
        c.writeUInt32LE(current.size, 24);
        c.writeUInt16LE(current.name.length, 28);
        c.writeUInt32LE(current.start, 42);
        central.push(Buffer.concat([c, current.name]));
        current = null;
        return;
      }
      if (i < entries.length) {
        const e = entries[i++];
        const name = Buffer.from(e.name, "utf8");
        const start = offset;
        const header = localHeader(name);
        offset += header.length;
        controller.enqueue(header);
        const source: AsyncIterable<Buffer> =
          "path" in e
            ? (fs.createReadStream(e.path, { highWaterMark: 1 << 20 }) as AsyncIterable<Buffer>)
            : (async function* () {
                yield e.data;
              })();
        current = { reader: source[Symbol.asyncIterator](), crc: 0, size: 0, name, start };
        return;
      }
      const dir = Buffer.concat(central);
      const end = Buffer.alloc(22);
      end.writeUInt32LE(0x06054b50, 0);
      end.writeUInt16LE(central.length, 8);
      end.writeUInt16LE(central.length, 10);
      end.writeUInt32LE(dir.length, 12);
      end.writeUInt32LE(offset, 16);
      controller.enqueue(Buffer.concat([dir, end]));
      controller.close();
    },
  });
}
