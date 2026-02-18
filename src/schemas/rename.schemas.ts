import { z } from "zod";

export const FindReplaceRuleSchema = z.object({
  type: z.literal("find_replace"),
  find: z.string().min(1),
  replace: z.string(),
  use_regex: z.boolean().default(false),
  case_sensitive: z.boolean().default(false),
  global: z.boolean().default(true), // Replace all occurrences
});

export const CaseRuleSchema = z.object({
  type: z.literal("case"),
  conversion: z.enum([
    "lowercase",
    "uppercase",
    "camelCase",
    "PascalCase",
    "snake_case",
    "kebab-case",
    "Title Case",
  ]),
});

export const AddTextRuleSchema = z.object({
  type: z.literal("add_text"),
  text: z.string().min(1),
  position: z.enum(["start", "end"]),
});

export const NumberingRuleSchema = z.object({
  type: z.literal("numbering"),
  start_at: z.number().int().min(0).max(99999).default(1),
  increment_by: z.number().int().min(1).max(1000).default(1),
  format: z.string().default("search_index"),
  separator: z.string().default(" "),
  location: z.enum(["start", "end"]).default("end"),
});

export const TrimRuleSchema = z.object({
  type: z.literal("trim"),
  chars: z.string().optional(), // Characters to trim, defaults to whitespace
  position: z.enum(["start", "end", "both"]).default("both"),
});

export const RenameRuleSchema = z.discriminatedUnion("type", [
  FindReplaceRuleSchema,
  CaseRuleSchema,
  AddTextRuleSchema,
  NumberingRuleSchema,
  TrimRuleSchema,
]);

export type RenameRule = z.infer<typeof RenameRuleSchema>;
