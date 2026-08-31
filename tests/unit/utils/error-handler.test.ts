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

  it("replaces paths inside parentheses and brackets", () => {
    expect(sanitizeErrorMessage("Error reading (/var/log/app.log)")).toBe(
      "Error reading ([PATH])",
    );
    expect(sanitizeErrorMessage("Failed at [/home/user/file.txt]")).toBe(
      "Failed at [[PATH]]",
    );
  });

  it("replaces Windows relative paths and backslash traversals", () => {
    expect(sanitizeErrorMessage("Cannot open .\\foo\\bar.txt")).toBe(
      "Cannot open [PATH]",
    );
    expect(sanitizeErrorMessage("Path escapes root: ..\\secret\\config")).toBe(
      "Path escapes root: [PATH]",
    );
  });

  it("accepts a plain string", () => {
    expect(sanitizeErrorMessage("/home/user/file.txt")).toBe("[PATH]");
  });
});

describe("createErrorResponse", () => {
  it("sanitizes FileOrganizerError messages", async () => {
    const { FileOrganizerError } = await import("../../../src/errors.js");
    const { createErrorResponse } = await import(
      "../../../src/utils/error-handler.js"
    );

    const error = new FileOrganizerError(
      "Failed to read /var/log/secret.txt",
      "E_FAIL",
      { path: "/home/kriday/secret.txt" },
      "Check file at /etc/config.json",
    );

    const response = createErrorResponse(error);
    expect(response.isError).toBe(true);
    const text = response.content[0]?.text ?? "";
    expect(text).not.toContain("/var/log/secret.txt");
    expect(text).not.toContain("/home/kriday/secret.txt");
    expect(text).not.toContain("/etc/config.json");
    expect(text).toContain("[PATH]");
  });
});
