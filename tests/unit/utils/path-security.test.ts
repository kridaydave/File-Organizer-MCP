/**
 * File Organizer MCP - path-security tests
 *
 * Covers the soft/hard split in isPathBlocked: an explicit whitelist may
 * unlock a soft block (/root when the user runs as root) but never a
 * system-critical root, on linux, darwin and win32.
 *
 * Both getAlwaysBlockedPatterns() and the hard-block list read os.platform(),
 * so the test mocks os rather than process.platform.
 */

import { jest, describe, it, expect, afterEach } from "@jest/globals";

let mockedPlatform: NodeJS.Platform = process.platform;

jest.unstable_mockModule("os", () => ({
  default: {
    platform: () => mockedPlatform,
    tmpdir: () => "/tmp",
    homedir: () => "/root",
  },
  platform: () => mockedPlatform,
  tmpdir: () => "/tmp",
  homedir: () => "/root",
}));

const { CONFIG } = await import("../../../src/config.js");
const { getAlwaysBlockedPatterns } = await import(
  "../../../src/core/config/security.js"
);
const { isPathBlocked } = await import("../../../src/utils/path-security.js");

const OVERRIDE = { allowWhitelistedOverride: true };

/**
 * CONFIG snapshots the blocked patterns at import time, so switching platform
 * mid-test has to refresh them the same way the loader does.
 */
function setPlatform(platform: NodeJS.Platform): void {
  mockedPlatform = platform;
  CONFIG.paths.alwaysBlocked = getAlwaysBlockedPatterns();
}

afterEach(() => {
  setPlatform(process.platform);
});

describe("isPathBlocked whitelist override", () => {
  it("keeps /etc blocked even when whitelisted on linux", () => {
    setPlatform("linux");
    expect(isPathBlocked("/etc/passwd", OVERRIDE)).toBe(true);
  });

  it("keeps /proc, /sys, /dev and /boot blocked when whitelisted on linux", () => {
    setPlatform("linux");
    expect(isPathBlocked("/proc/self/environ", OVERRIDE)).toBe(true);
    expect(isPathBlocked("/sys/kernel", OVERRIDE)).toBe(true);
    expect(isPathBlocked("/dev/sda", OVERRIDE)).toBe(true);
    expect(isPathBlocked("/boot/vmlinuz", OVERRIDE)).toBe(true);
  });

  it("keeps /usr, /bin and /sbin blocked when whitelisted on linux", () => {
    setPlatform("linux");
    expect(isPathBlocked("/usr/local/bin", OVERRIDE)).toBe(true);
    expect(isPathBlocked("/bin/sh", OVERRIDE)).toBe(true);
    expect(isPathBlocked("/sbin/init", OVERRIDE)).toBe(true);
  });

  it("yields the /root block when it is whitelisted on linux", () => {
    setPlatform("linux");
    expect(isPathBlocked("/root", OVERRIDE)).toBe(false);
    expect(isPathBlocked("/root/projects", OVERRIDE)).toBe(false);
  });

  it("still blocks /root without an override", () => {
    setPlatform("linux");
    expect(isPathBlocked("/root")).toBe(true);
    expect(isPathBlocked("/root/projects")).toBe(true);
  });

  it("keeps macOS system roots blocked when whitelisted on darwin", () => {
    setPlatform("darwin");
    expect(isPathBlocked("/System/Library/Kernels", OVERRIDE)).toBe(true);
    expect(isPathBlocked("/Library/Application Support", OVERRIDE)).toBe(true);
    expect(isPathBlocked("/Applications/Safari.app", OVERRIDE)).toBe(true);
    expect(isPathBlocked("/private/etc/hosts", OVERRIDE)).toBe(true);
  });

  it("keeps macOS /usr, /bin and /sbin blocked when whitelisted on darwin", () => {
    setPlatform("darwin");
    expect(isPathBlocked("/usr/local/bin", OVERRIDE)).toBe(true);
    expect(isPathBlocked("/bin/sh", OVERRIDE)).toBe(true);
    expect(isPathBlocked("/sbin/init", OVERRIDE)).toBe(true);
  });

  it("keeps sensitive macOS /private/var subdirs blocked when whitelisted", () => {
    setPlatform("darwin");
    expect(isPathBlocked("/private/var/db/file", OVERRIDE)).toBe(true);
    expect(isPathBlocked("/private/var/log/system.log", OVERRIDE)).toBe(true);
  });

  it("yields the macOS /var block for per-user temp when whitelisted", () => {
    setPlatform("darwin");
    expect(isPathBlocked("/var/folders/ab/T/file", OVERRIDE)).toBe(false);
  });

  it("keeps C:\\Windows and Program Files blocked when whitelisted on win32", () => {
    setPlatform("win32");
    expect(isPathBlocked("C:\\Windows\\System32\\cmd.exe", OVERRIDE)).toBe(
      true,
    );
    expect(isPathBlocked("C:\\Program Files\\App\\data", OVERRIDE)).toBe(true);
    expect(isPathBlocked("C:\\Program Files (x86)\\App", OVERRIDE)).toBe(true);
    expect(isPathBlocked("C:\\ProgramData\\App", OVERRIDE)).toBe(true);
    expect(isPathBlocked("C:\\$Recycle.Bin", OVERRIDE)).toBe(true);
    expect(isPathBlocked("C:\\System Volume Information\\track", OVERRIDE)).toBe(
      true,
    );
  });

  it("keeps POSIX /etc traversal blocked when whitelisted on win32", () => {
    setPlatform("win32");
    // getAlwaysBlockedPatterns() lists only /etc and /var in its common set,
    // so /etc is the POSIX traversal catch that must survive an override.
    expect(isPathBlocked("/etc/passwd", OVERRIDE)).toBe(true);
    expect(isPathBlocked("/etc/ssh/sshd_config", OVERRIDE)).toBe(true);
  });

  it("still yields a whitelisted AppData\\Local\\Temp path on win32", () => {
    setPlatform("win32");
    expect(
      isPathBlocked("C:\\Users\\dev\\AppData\\Local\\Temp\\f.txt", OVERRIDE),
    ).toBe(false);
  });
});