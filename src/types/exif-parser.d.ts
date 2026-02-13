declare module "exif-parser" {
  interface ExifTags {
    DateTimeOriginal?: number;
    CreateDate?: number;
    ModifyDate?: number;
    Make?: string;
    Model?: string;
    [key: string]: any;
  }

  interface ImageSize {
    width: number;
    height: number;
  }

  interface ExifResult {
    tags?: ExifTags;
    imageSize?: ImageSize;
    [key: string]: any;
  }

  interface ExifParserInstance {
    parse(): ExifResult;
  }

  export function create(buffer: Buffer): ExifParserInstance;
}
