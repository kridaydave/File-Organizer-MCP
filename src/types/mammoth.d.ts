declare module "mammoth" {
  interface ExtractResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }

  interface ExtractOptions {
    buffer?: Buffer;
    path?: string;
  }

  export function extractRawText(
    options: ExtractOptions,
  ): Promise<ExtractResult>;
}
