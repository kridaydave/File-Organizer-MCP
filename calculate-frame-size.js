// Calculate actual frame sizes
const id3Header = Buffer.from([
  0x49, 0x44, 0x33, 0x03, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x7f,
]);

const trckFrame = Buffer.concat([
  Buffer.from("TRCK"),
  Buffer.from([0x00, 0x00, 0x00, 0x06]),
  Buffer.from([0x00, 0x00]),
  Buffer.from([0x03]), // UTF-8
  Buffer.from("5/12"),
]);

const tposFrame = Buffer.concat([
  Buffer.from("TPOS"),
  Buffer.from([0x00, 0x00, 0x00, 0x06]),
  Buffer.from([0x00, 0x00]),
  Buffer.from([0x03]),
  Buffer.from("2/3"),
]);

console.log("ID3 Header length:", id3Header.length);
console.log("TRCK Frame length:", trckFrame.length);
console.log("TPOS Frame length:", tposFrame.length);
console.log("Total frame data length:", trckFrame.length + tposFrame.length);
console.log("TRCK Frame content:", trckFrame);
console.log("TRCK Frame buffer:", trckFrame.toString('hex'));
console.log("TRCK Frame size field:", trckFrame.readUInt32BE(4));

// Calculate offset after TRCK frame
const offsetAfterTrck = id3Header.length + trckFrame.length;
console.log("Offset after TRCK frame:", offsetAfterTrck);

// Create complete buffer
const mp3Content = Buffer.concat([id3Header, trckFrame, tposFrame, Buffer.alloc(100)]);
console.log("\nComplete buffer:");
console.log("Frame ID at offset 10:", mp3Content.toString('ascii', 10, 14));
console.log("Frame size at offset 14:", mp3Content.readUInt32BE(14));
console.log("TPOS Frame should start at offset", id3Header.length + trckFrame.length, 
            "and contains ID:", mp3Content.toString('ascii', id3Header.length + trckFrame.length, id3Header.length + trckFrame.length + 4));
