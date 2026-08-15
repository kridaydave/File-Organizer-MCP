import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'path';

jest.unstable_mockModule('fs/promises', () => ({
    default: {
        readFile: jest.fn(),
        stat: jest.fn(),
    },
}));

jest.unstable_mockModule('fs', () => ({
    default: {
        watchFile: jest.fn(),
        unwatchFile: jest.fn(),
    },
}));

const { FileTracker } = await import('../../../src/services/file-tracker.service');
const fs = (await import('fs/promises')).default;
const fsSync = (await import('fs')).default;

describe('FileTracker', () => {
    let service: any;

    beforeEach(() => {
        service = new FileTracker();
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('should set default configPath from cwd', () => {
            expect(service.configPath).toBe(path.join(process.cwd(), 'config.json'));
        });

        it('should initialize watchers, pendingFiles, and debounceTimeout', () => {
            expect(service.watchers).toBeInstanceOf(Map);
            expect(service.watchers.size).toBe(0);
            expect(service.pendingFiles).toBeInstanceOf(Set);
            expect(service.pendingFiles.size).toBe(0);
            expect(service.debounceTimeout).toBeNull();
        });
    });

    describe('init', () => {
        it('should call loadConfig and mark as initialized', async () => {
            const spy = jest.spyOn(service, 'loadConfig').mockResolvedValue(undefined);
            await service.init();
            expect(spy).toHaveBeenCalled();
            expect(service.isInitialized()).toBe(true);
        });
    });

    describe('loadConfig', () => {
        it('should parse config and store with default debounceTime 1000', async () => {
            fs.readFile.mockResolvedValue(JSON.stringify({ rules: [{}] }));
            await service.loadConfig();
            expect(service.getConfig()).toEqual({ debounceTime: 1000, rules: [{}] });
        });

        it('should preserve a valid custom debounceTime', async () => {
            fs.readFile.mockResolvedValue(JSON.stringify({ rules: [{}], debounceTime: 2500 }));
            await service.loadConfig();
            expect(service.getConfig()?.debounceTime).toBe(2500);
        });

        it('should throw invalid configuration when rules are missing', async () => {
            fs.readFile.mockResolvedValue(JSON.stringify({}));
            await expect(service.loadConfig()).rejects.toMatchObject({
                message: 'Invalid configuration - please check config.json',
                cause: expect.objectContaining({
                    message: 'No organization rules defined in config',
                }),
            });
        });

        it('should throw invalid configuration when rules are empty', async () => {
            fs.readFile.mockResolvedValue(JSON.stringify({ rules: [] }));
            await expect(service.loadConfig()).rejects.toMatchObject({
                message: 'Invalid configuration - please check config.json',
                cause: expect.objectContaining({
                    message: 'No organization rules defined in config',
                }),
            });
        });

        it('should warn and use default 1000 when debounceTime is out of range', async () => {
            fs.readFile.mockResolvedValue(JSON.stringify({ rules: [{}], debounceTime: 50000 }));
            await service.loadConfig();
            expect(service.getConfig()?.debounceTime).toBe(1000);
        });

        it('should throw invalid configuration when readFile fails', async () => {
            fs.readFile.mockRejectedValue(new Error('ENOENT'));
            await expect(service.loadConfig()).rejects.toThrow(
                'Invalid configuration - please check config.json',
            );
        });

        it('should throw invalid configuration when JSON is malformed', async () => {
            fs.readFile.mockResolvedValue('not valid json');
            await expect(service.loadConfig()).rejects.toThrow(
                'Invalid configuration - please check config.json',
            );
        });
    });

    describe('stop', () => {
        it('should close all watchers, clear map, and clear debounceTimeout', async () => {
            const close = jest.fn().mockResolvedValue(undefined);
            service.watchers.set('a', { close });
            service.watchers.set('b', { close });
            service.debounceTimeout = setTimeout(() => {}, 1000);

            await service.stop();

            expect(close).toHaveBeenCalledTimes(2);
            expect(service.watchers.size).toBe(0);
            expect(service.debounceTimeout).toBeNull();
        });
    });

    describe('accessors', () => {
        it('should return initialized state', () => {
            expect(service.isInitialized()).toBe(false);
            service.initialized = true;
            expect(service.isInitialized()).toBe(true);
        });

        it('should return the stored config', () => {
            expect(service.getConfig()).toBeNull();
            const config = { debounceTime: 1000, rules: [] };
            service.config = config;
            expect(service.getConfig()).toBe(config);
        });
    });

    describe('watchConfig', () => {
        it('should not register a watcher and not throw when config is null', () => {
            expect(() => service.watchConfig()).not.toThrow();
            expect(fsSync.watchFile).not.toHaveBeenCalled();
        });

        it('should register a watchFile callback when config is set', () => {
            service.config = { debounceTime: 1000, rules: [{}] };
            service.watchConfig();
            expect(fsSync.watchFile).toHaveBeenCalledTimes(1);
            expect(fsSync.watchFile).toHaveBeenCalledWith(
                service.configPath,
                expect.any(Function),
            );
        });
    });
});