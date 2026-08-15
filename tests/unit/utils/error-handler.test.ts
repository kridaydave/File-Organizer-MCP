import { sanitizeErrorMessage } from "../../../src/utils/error-handler.js";

describe("sanitizeErrorMessage", () => {
  it("replaces Unix absolute paths", () => {
    expect(sanitizeErrorMessage("Access denied: /var/log/app.log")).toBe(
      "Access denied: [PATH]",
    );
  });

  it("replaces quote-delimited paths in error messages", () => {
    const message =
      "ENOENT: no such file or directory, rename '/tmp/src/file.md' -> '/tmp/tgt/file.md'";
    expect(sanitizeErrorMessage(message)).toBe(
      "ENOENT: no such file or directory, rename '[PATH]' -> '[PATH]'",
    );
  });

  it("replaces relative paths", () => {
    expect(
      sanitizeErrorMessage("No such file or directory: ./foo/bar.txt"),
    ).toBe("No such file or directory: [PATH]");
  });

  it("replaces parent directory traversal", () => {
    expect(sanitizeErrorMessage("Path escapes root: ../secret/config")).toBe(
      "Path escapes root: [PATH]",
    );
  });

  it("accepts a plain string", () => {
    expect(sanitizeErrorMessage("/home/user/file.txt")).toBe("[PATH]");
  });
});
