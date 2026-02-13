const fs = require('fs');
const path = require('path');

// Create test file
const testDir = path.join(__dirname, 'debug-analyze-temp');
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir, { recursive: true });
}

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

const mp3Content = Buffer.concat([id3Header, trckFrame, tposFrame, Buffer.alloc(100)]);
const filePath = path.join(testDir, "analyze.mp3");
fs.writeFileSync(filePath, mp3Content);

console.log("Created test file at:", filePath);
console.log("File size:", fs.statSync(filePath).size, "bytes");

// Analyze buffer
const buffer = fs.readFileSync(filePath);
console.log("\n=== Buffer Analysis ===");

// Check offset after TRCK processing
console.log("Offset 25-34:");
for (let i = 25; i < 34; i++) {
  const byte = buffer[i];
  const char = byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.';
  console.log(`  Offset ${i.toString().padStart(2)}: 0x${byte.toString(16).padStart(2, '0')} (${char})`);
}

console.log("\nOffset 26-34 (where parser looks for next frame):");
for (let i = 26; i < 34; i++) {
  const byte = buffer[i];
  const char = byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.';
  console.log(`  Offset ${i.toString().padStart(2)}: 0x${byte.toString(16).padStart(2, '0')} (${char})`);
}

console.log("\n=== Frame Analysis ===");
const tposOffsetInBuffer = 10 + trckFrame.length;
const foundFrameId = buffer.toString('ascii', tposOffsetInBuffer, tposOffsetInBuffer + 4);
console.log(`TPOS frame should be at offset ${tposOffsetInBuffer}, ID: '${foundFrameId}'`);
console.log(`Parser actually looks at offset 26, ID: '${buffer.toString('ascii', 26, 30)}'`);

// Calculate frame size at offset 26
const frameSize = buffer.readUInt32BE(26 + 4);
console.log(`Corrupted frame size: ${frameSize} bytes`);
