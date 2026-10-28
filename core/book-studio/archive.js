/** Small UTF-8, uncompressed ZIP writer. EPUB requires mimetype first and stored. */
const encoder = new TextEncoder();
function checksum(bytes) {
  let result = 0xffffffff;
  for (const byte of bytes) { result ^= byte; for (let j = 0; j < 8; j++) result = (result >>> 1) ^ ((result & 1) ? 0xedb88320 : 0); }
  return (result ^ 0xffffffff) >>> 0;
}
export function createArchive(files) {
  const chunks = [], central = []; let offset = 0, centralSize = 0;
  for (const [path, content] of files) {
    const name = encoder.encode(path), data = encoder.encode(content), crc = checksum(data);
    const header = new Uint8Array(30 + name.length), h = new DataView(header.buffer);
    h.setUint32(0,0x04034b50,true); h.setUint16(4,20,true); h.setUint16(6,0x800,true); h.setUint16(12,33,true);
    h.setUint32(14,crc,true); h.setUint32(18,data.length,true); h.setUint32(22,data.length,true); h.setUint16(26,name.length,true); header.set(name,30);
    const directory = new Uint8Array(46 + name.length), d = new DataView(directory.buffer);
    d.setUint32(0,0x02014b50,true); d.setUint16(4,20,true); d.setUint16(6,20,true); d.setUint16(8,0x800,true); d.setUint16(14,33,true);
    d.setUint32(16,crc,true); d.setUint32(20,data.length,true); d.setUint32(24,data.length,true); d.setUint16(28,name.length,true); d.setUint32(42,offset,true); directory.set(name,46);
    chunks.push(header,data); central.push(directory); offset += header.length + data.length; centralSize += directory.length;
  }
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0,0x06054b50,true); e.setUint16(8,files.length,true); e.setUint16(10,files.length,true); e.setUint32(12,centralSize,true); e.setUint32(16,offset,true);
  return new Blob([...chunks,...central,end], { type: 'application/epub+zip' });
}
