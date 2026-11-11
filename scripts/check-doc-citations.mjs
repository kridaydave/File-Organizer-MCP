#!/usr/bin/env node

/**
 * Check that every `path:line` citation in the agent-facing docs still points at
 * what the doc claims.
 *
 * Line numbers drift on every refactor, and a stale citation is worse than no
 * citation: an agent follows it, edits the wrong function, and the mistake looks
 * authoritative. This turns that class of rot into a failing command.
 *
 *   node scripts/check-doc-citations.mjs          # check
 *   node scripts/check-doc-citations.mjs --fix    # rewrite line numbers in place
 *
 * A citation passes when the file exists and the cited line is non-blank. The
 * check cannot know what the line was *meant* to say, so it also reports every
 * citation whose line is blank or a bare brace, which is the usual shape of a
 * number that drifted off a function signature.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIX = process.argv.includes("--fix");

const DOCS = [
  "AGENTS.md",
  "ARCHITECTURE.md",
  "README.md",
  "API.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "TESTS.md",
  "docs/FRAMEWORK.md",
  "docs/skills/SKILL.md",
];

// path:line inside backticks, optionally followed by a parenthesised name.
const CITATION = /`([\w./-]+\.(?:ts|mjs|cjs|js|json|md))(?::(\d+))?`/g;
// A candidate symbol: a capitalised or snake_case identifier in backticks.
const SYMBOL = /`([A-Za-z_][\w]*)`/g;
// "`symbol` (" immediately left of a citation: the form these docs use, symbol
// first then its citation. Matching on the text before the citation keeps a
// second pair in the same sentence from claiming the first one's symbol.
const BOUND_SYMBOL = /`([A-Za-z_][\w]*)`\s*\(\s*$/;

/**
 * The symbol a citation claims, which is the one bound to it by "or" or named
 * in the backtick group immediately after it. Returns [] when the citation makes
 * no claim, so the check stays quiet rather than guessing.
 */
function claimedSymbol(content, matchIndex, matchLength, targetFile) {
  const declared = declaredNames(targetFile);

  // Strongest signal: "`symbol` (`file:line`)" immediately before this citation.
  const before = content.slice(Math.max(0, matchIndex - 120), matchIndex);
  const bound = BOUND_SYMBOL.exec(before);
  if (bound && declared.has(bound[1])) return [bound[1]];

  // Otherwise the citation names its symbol right after it. Stop at the next
  // file reference so a later citation's symbol is not claimed by this one.
  const after = content.slice(matchIndex + matchLength, matchIndex + matchLength + 120);
  const names = [];
  for (const group of after.matchAll(SYMBOL_GROUP)) {
    if (FILE_CITATION.test(group[0])) break;
    for (const m of group[0].matchAll(SYMBOL)) {
      if (declared.has(m[1]) && !names.includes(m[1])) names.push(m[1]);
    }
  }
  return names.length === 1 ? names : [];
}

const SYMBOL_GROUP = /`[A-Za-z_][\w]*`(?:[\s/]+`[A-Za-z_][\w]*`)*/g;
const FILE_CITATION = /`[\w./-]+\.(?:ts|mjs|cjs|js|json|md)/;

function declaredNames(targetFile) {
  const names = new Set();
  const source = fs.readFileSync(targetFile, "utf8");
  for (const m of source.matchAll(/(?:export\s+)?(?:declare\s+)?(?:async\s+)?(?:function|const|class|interface|type|enum)\s+([A-Za-z_][\w]*)/g)) {
    names.add(m[1]);
  }
  for (const m of source.matchAll(/export \{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) names.add(name);
    }
  }
  return names;
}

const findings = [];

function resolveInRepo(rel) {
  const full = path.join(REPO, rel);
  return fs.existsSync(full) && fs.statSync(full).isFile() ? full : null;
}

/** Find the line a named symbol is declared on. */
function findDeclaration(file, symbol) {
  const source = fs.readFileSync(file, "utf8").split("\n");
  const patterns = [
    new RegExp(`export (async )?function ${symbol}\\b`),
    new RegExp(`export (const|class|interface|type) ${symbol}\\b`),
    new RegExp(`function ${symbol}\\b`),
    new RegExp(`(const|class|interface|type) ${symbol}\\b`),
  ];
  for (let i = 0; i < source.length; i++) {
    if (patterns.some((p) => p.test(source[i]))) return i + 1;
  }
  return null;
}

function isDrifted(text) {
  const trimmed = text.trim();
  if (!trimmed) return "blank line";
  if (["}", "{", ");", ");", "],", "});"].includes(trimmed)) return "structural filler, not a declaration";
  return null;
}

let fixed = 0;

for (const doc of DOCS) {
  const docPath = path.join(REPO, doc);
  if (!fs.existsSync(docPath)) {
    findings.push({ doc, severity: "info", message: "document not found, skipped" });
    continue;
  }
  const content = fs.readFileSync(docPath, "utf8");
  // Edits are collected and applied once at the end, from the end of the file
  // backwards. Rewriting content mid-scan would shift every later match index,
  // and a plain string replace would hit the wrong occurrence when a citation
  // appears more than once.
  const edits = [];

  for (const match of content.matchAll(CITATION)) {
    const [full, rel, lineNo] = match;
    if (!lineNo) continue;

    const target = resolveInRepo(rel);
    if (!target) {
      findings.push({ doc, severity: "error", citation: full, message: `no such file: ${rel}` });
      continue;
    }

    const lines = fs.readFileSync(target, "utf8").split("\n");
    const cited = Number(lineNo);
    if (cited > lines.length) {
      findings.push({
        doc,
        severity: "error",
        citation: full,
        message: `${rel} has ${lines.length} lines, citation points at ${cited}`,
      });
      continue;
    }

    // A citation almost always names the symbol it points at, either right
    // after it as (`name`) or in the same sentence. That name is the only
    // strong drift signal available, so resolve each one and compare the
    // declared line against the cited line.
    const claimed = claimedSymbol(content, match.index, full.length, target);
    if (claimed.length === 1) {
      const symbol = claimed[0];
      const declared = findDeclaration(target, symbol);
      if (declared === null) {
        findings.push({ doc, severity: "error", citation: full, message: `\`${symbol}\` is not declared anywhere in ${rel}` });
        continue;
      }
      if (declared !== cited) {
        if (FIX) {
          edits.push({ start: match.index, end: match.index + full.length, text: "`" + rel + ":" + declared + "`" });
        } else {
          findings.push({
            doc,
            severity: "error",
            citation: full,
            message: `cites line ${cited} but \`${symbol}\` is declared at line ${declared}`,
          });
        }
        continue;
      }
    }

    const drifted = isDrifted(lines[cited - 1]);
    if (!drifted) continue;

    findings.push({ doc, severity: "warn", citation: full, message: `points at ${drifted}` });
  }

  if (edits.length > 0) {
    let patched = content;
    for (const edit of edits.sort((a, b) => b.start - a.start)) {
      patched = patched.slice(0, edit.start) + edit.text + patched.slice(edit.end);
    }
    fs.writeFileSync(docPath, patched);
    fixed += edits.length;
  }
}

const errors = findings.filter((f) => f.severity === "error");
const warns = findings.filter((f) => f.severity === "warn");

for (const f of findings) {
  const tag = f.severity === "info" ? "skip" : f.severity === "error" ? "FAIL" : "warn";
  process.stdout.write(`${tag}  ${f.doc}  ${f.citation || ""}  ${f.message}\n`);
}

if (FIX) process.stdout.write(`\nrewrote ${fixed} citation(s)\n`);
process.stdout.write(`\n${errors.length} error(s), ${warns.length} warning(s) across ${DOCS.length} documents\n`);
process.exit(errors.length > 0 ? 1 : 0);
