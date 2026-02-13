declare module "piexifjs" {
  export const GPSIFD: Record<string, number>;
  export const ImageIFD: Record<string, number>;
  export const ExifIFD: Record<string, number>;

  export interface ExifObject {
    "0th"?: Record<number, unknown>;
    "1st"?: Record<number, unknown>;
    Exif?: Record<number, unknown>;
    GPS?: Record<number, unknown>;
    Interop?: Record<number, unknown>;
    thumbnail?: unknown;
  }

  export function load(jpegBase64: string): ExifObject;
  export function dump(exifObj: ExifObject): string;
  export function insert(exifBytes: string, jpegBase64: string): string;
  export function remove(jpegBase64: string): string;
}
