import { describe, it, expect } from '@jest/globals';
import { ManifestIntegrityService } from '../../../src/services/manifest-integrity.service';

const actions = [
    {
        type: 'move' as const,
        originalPath: '/src/a.txt',
        currentPath: '/dest/a.txt',
        timestamp: 100,
    },
    {
        type: 'copy' as const,
        originalPath: '/src/b.txt',
        currentPath: '/dest/b.txt',
        timestamp: 101,
    },
];

function buildValidManifest(service: ManifestIntegrityService, overrides: Record<string, unknown> = {}) {
    const base = {
        id: 'test-manifest',
        timestamp: 1700000000000,
        description: 'Test manifest',
        actions,
        version: '1.0',
        ...overrides,
    };
    const hash = service.computeHash(base.actions as typeof actions, base.timestamp as number);
    const signature = service.computeSignature({ ...base, hash });
    return { ...base, hash, signature };
}

describe('ManifestIntegrityService', () => {
    describe('computeHash', () => {
        it('should compute a deterministic sha256 hex hash', () => {
            const service = new ManifestIntegrityService();
            const h1 = service.computeHash(actions, 123);
            const h2 = service.computeHash(actions, 123);
            expect(h1).toBe(h2);
            expect(h1).toMatch(/^[a-f0-9]{64}$/);
        });

        it('should produce different hashes for different inputs', () => {
            const service = new ManifestIntegrityService();
            const h1 = service.computeHash([actions[0]!], 123);
            const h2 = service.computeHash([actions[0]!], 124);
            expect(h1).not.toBe(h2);
        });
    });

    describe('computeSignature', () => {
        it('should compute a deterministic HMAC hex signature', () => {
            const service = new ManifestIntegrityService();
            const manifest = {
                id: 'x',
                timestamp: 123,
                description: 'd',
                actions,
                version: '1.0',
                hash: 'abc',
            };
            const s1 = service.computeSignature(manifest);
            const s2 = service.computeSignature(manifest);
            expect(s1).toBe(s2);
            expect(s1).toMatch(/^[a-f0-9]{64}$/);
        });

        it('should produce different signatures for different manifests', () => {
            const service = new ManifestIntegrityService();
            const manifest = {
                id: 'x',
                timestamp: 123,
                description: 'd',
                actions,
                version: '1.0',
                hash: 'abc',
            };
            expect(service.computeSignature(manifest)).not.toBe(
                service.computeSignature({ ...manifest, description: 'other' }),
            );
        });
    });

    describe('verifyManifest', () => {
        it('should return invalid for a wrong manifest version', () => {
            const service = new ManifestIntegrityService();
            const manifest = buildValidManifest(service, { version: '2.0' });
            expect(service.verifyManifest(manifest)).toEqual({
                valid: false,
                error: 'Invalid or missing manifest version',
            });
        });

        it('should return invalid for a missing manifest version', () => {
            const service = new ManifestIntegrityService();
            const manifest = buildValidManifest(service) as { version?: string };
            delete manifest.version;
            expect(service.verifyManifest(manifest as never)).toEqual({
                valid: false,
                error: 'Invalid or missing manifest version',
            });
        });

        it('should return invalid for a missing manifest hash', () => {
            const service = new ManifestIntegrityService();
            const manifest = buildValidManifest(service) as { hash?: string };
            delete manifest.hash;
            expect(service.verifyManifest(manifest as never)).toEqual({
                valid: false,
                error: 'Missing manifest hash',
            });
        });

        it('should detect a hash mismatch when an action is tampered', () => {
            const service = new ManifestIntegrityService();
            const manifest = buildValidManifest(service) as { actions: typeof actions };
            manifest.actions = [
                { type: 'delete' as const, originalPath: '/evil.txt', timestamp: 999 },
            ];
            expect(service.verifyManifest(manifest)).toEqual({
                valid: false,
                error: 'Manifest hash mismatch - possible tampering detected',
            });
        });

        it('should return invalid for a missing manifest signature', () => {
            const service = new ManifestIntegrityService();
            const manifest = buildValidManifest(service) as { signature?: string };
            delete manifest.signature;
            expect(service.verifyManifest(manifest as never)).toEqual({
                valid: false,
                error: 'Missing manifest signature',
            });
        });

        it('should detect a signature mismatch', () => {
            const service = new ManifestIntegrityService();
            const manifest = buildValidManifest(service) as { signature: string };
            manifest.signature = 'deadbeef';
            expect(service.verifyManifest(manifest)).toEqual({
                valid: false,
                error: 'Manifest signature mismatch - possible tampering detected',
            });
        });

        it('should return valid for a correctly constructed manifest', () => {
            const service = new ManifestIntegrityService();
            const manifest = buildValidManifest(service);
            expect(service.verifyManifest(manifest)).toEqual({ valid: true });
        });
    });
});