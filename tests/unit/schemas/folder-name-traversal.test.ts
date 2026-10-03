import { describe, it, expect } from '@jest/globals';
import {
  OrganizePhotosInputSchema,
  SystemOrganizationInputSchema,
} from '../../../src/schemas/organize.js';
import { FolderNameSchema } from '../../../src/schemas/system.js';

/**
 * Regression tests for path traversal through folder-name fields.
 *
 * Both values are joined onto an already-validated directory and then mkdir'd,
 * so they must be a single path segment. Traversal has to fail at the schema,
 * before any service sees the value.
 */
const TRAVERSALS = [
  '../../../../etc/cron.d',
  '../../../../somewhere',
  '../../etc',
  '..',
  '../escape',
  'a/b',
  'nested\\folder',
  '/absolute',
  'C:\\Windows',
  'Unknown\x00Date',
  '   ',
  '',
];

describe('FolderNameSchema', () => {
  it.each(TRAVERSALS)('rejects %j', (value) => {
    const result = FolderNameSchema.safeParse(value);
    expect(result.success).toBe(false);
  });

  it.each([
    'Unknown Date',
    '2024 Unsorted',
    'Organized',
    'Unsorted Photos',
    'no-date',
  ])('accepts %j', (value) => {
    const result = FolderNameSchema.safeParse(value);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(value);
    }
  });
});

describe('OrganizePhotosInputSchema — unknown_date_folder', () => {
  const base = {
    source_dir: '/tmp/photos',
    target_dir: '/tmp/organized',
  };

  it('rejects ../../../../somewhere', () => {
    const result = OrganizePhotosInputSchema.safeParse({
      ...base,
      unknown_date_folder: '../../../../somewhere',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a nested path', () => {
    const result = OrganizePhotosInputSchema.safeParse({
      ...base,
      unknown_date_folder: 'a/b',
    });
    expect(result.success).toBe(false);
  });

  it('accepts "Unknown Date" verbatim', () => {
    const result = OrganizePhotosInputSchema.safeParse({
      ...base,
      unknown_date_folder: 'Unknown Date',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.unknown_date_folder).toBe('Unknown Date');
    }
  });

  it('defaults to "Unknown Date" when omitted', () => {
    const result = OrganizePhotosInputSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.unknown_date_folder).toBe('Unknown Date');
    }
  });
});

describe('SystemOrganizationInputSchema — local_fallback_prefix', () => {
  const base = { source_dir: '/tmp/Downloads' };

  it('rejects ../../../../etc/cron.d', () => {
    const result = SystemOrganizationInputSchema.safeParse({
      ...base,
      local_fallback_prefix: '../../../../etc/cron.d',
    });
    expect(result.success).toBe(false);
  });

  it('accepts "Organized" verbatim', () => {
    const result = SystemOrganizationInputSchema.safeParse({
      ...base,
      local_fallback_prefix: 'Organized',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.local_fallback_prefix).toBe('Organized');
    }
  });

  it('defaults to "Organized" when omitted', () => {
    const result = SystemOrganizationInputSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.local_fallback_prefix).toBe('Organized');
    }
  });
});
