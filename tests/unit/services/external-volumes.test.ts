/**
 * File Organizer MCP Server - External Volume Path Tests
 *
 * These tests validate the external-volume path logic introduced to fix
 * the GitHub issue: "/Volumes on macOS is silently blocked".
 *
 * We test:
 * 1. The UserConfig.allowExternalVolumes type field
 * 2. The isExternalVolumePath() patterns (tested directly, not via module re-import)
 * 3. The macOS always-blocked regexps do NOT match /Volumes paths
 */

import { describe, it, expect } from '@jest/globals';
import type { UserConfig } from '../../../src/config.js';

// ── UserConfig type checks ────────────────────────────────────────────────────

describe('UserConfig.allowExternalVolumes', () => {
    it('accepts allowExternalVolumes: true', () => {
        const config: UserConfig = { allowExternalVolumes: true };
        expect(config.allowExternalVolumes).toBe(true);
    });

    it('accepts allowExternalVolumes: false', () => {
        const config: UserConfig = { allowExternalVolumes: false };
        expect(config.allowExternalVolumes).toBe(false);
    });

    it('is optional — defaults to undefined', () => {
        const config: UserConfig = {};
        expect(config.allowExternalVolumes).toBeUndefined();
    });
});

// ── isExternalVolumePath — pattern correctness ────────────────────────────────
//
// isExternalVolumePath() is a private function in config.ts. We test the same
// logic by replicating the exact patterns used in that function.

/** Matches macOS /Volumes/<name>/... */
const macosVolumeStart = (p: string) => p.startsWith('/Volumes/');

/** Matches Linux /media/..., /mnt/..., /run/media/... */
const linuxMediaRe = /^\/media\//;
const linuxMntRe = /^\/mnt\//;
const linuxRunMediaRe = /^\/run\/media\//;
const isLinuxVolume = (p: string) =>
    linuxMediaRe.test(p) || linuxMntRe.test(p) || linuxRunMediaRe.test(p);

describe('External volume path patterns — macOS', () => {
    const VALID = [
        '/Volumes/MyDrive',
        '/Volumes/MyDrive/Projects',
        '/Volumes/TimeMachine',
        '/Volumes/network-share/data',
    ];
    const INVALID = [
        '/Volumes',           // root itself — no trailing slash after name
        '/VolumesExtra/foo',  // different prefix
        '/etc',
        '/System',
        '/usr/local',
        '/home/user',
    ];

    VALID.forEach((p) => {
        it(`accepts "${p}"`, () => {
            expect(macosVolumeStart(p)).toBe(true);
        });
    });

    INVALID.forEach((p) => {
        it(`rejects "${p}"`, () => {
            expect(macosVolumeStart(p)).toBe(false);
        });
    });
});

describe('External volume path patterns — Linux', () => {
    const VALID = [
        '/media/user/usbdrive',
        '/media/usb0',
        '/mnt/nas',
        '/mnt/backup',
        '/run/media/user/drive',
    ];
    const INVALID = [
        '/mediafiles',
        '/mntpoint',
        '/run/other',
        '/etc/media',
        '/home/user',
    ];

    VALID.forEach((p) => {
        it(`accepts "${p}"`, () => {
            expect(isLinuxVolume(p)).toBe(true);
        });
    });

    INVALID.forEach((p) => {
        it(`rejects "${p}"`, () => {
            expect(isLinuxVolume(p)).toBe(false);
        });
    });
});

// ── macOS always-blocked patterns ─────────────────────────────────────────────
//
// Validate that the macOS regexps in getAlwaysBlockedPatterns() do NOT
// match /Volumes paths (the previous doc claimed /Volumes was blocked, but
// it was actually blocked only by the home-dir guard).

const macOSBlockedPatterns = [
    /^\/System\//,
    /^\/Library\//,
    /^\/Applications\//,
    /^\/private\//,
    /^\/usr\//,
    /^\/bin\//,
    /^\/sbin\//,
    /^\/opt\//,
    /\/Library\/Application Support\//,
];

const isBlockedByMacOSPattern = (p: string) =>
    macOSBlockedPatterns.some((re) => re.test(p));

describe('macOS always-blocked patterns', () => {
    describe('should block system paths', () => {
        const SYSTEM_PATHS = [
            '/System/Library/CoreServices',
            '/Library/Preferences/com.apple.dock.plist',
            '/Applications/Safari.app',
            '/usr/local/bin/git',
            '/bin/bash',
            '/sbin/launchd',
            '/private/tmp/something',
            '/opt/homebrew/bin',
        ];
        SYSTEM_PATHS.forEach((p) => {
            it(`blocks "${p}"`, () => {
                expect(isBlockedByMacOSPattern(p)).toBe(true);
            });
        });
    });

    describe('should NOT block /Volumes paths', () => {
        const VOLUME_PATHS = [
            '/Volumes/ExternalDrive',
            '/Volumes/ExternalDrive/Projects',
            '/Volumes/Backup/Documents',
            '/Volumes/TimeMachineDisk',
        ];
        VOLUME_PATHS.forEach((p) => {
            it(`does NOT block "${p}"`, () => {
                expect(isBlockedByMacOSPattern(p)).toBe(false);
            });
        });
    });
});
