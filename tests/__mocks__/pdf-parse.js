/**
 * Mock for pdf-parse
 */

export default function pdfParse(buffer) {
  return Promise.resolve({
    numpages: 1,
    numrender: 1,
    info: {
      Title: "Test PDF",
      Author: "Test Author",
    },
    metadata: null,
    text: "Sample PDF text content for testing",
    version: "1.0.0",
  });
}
