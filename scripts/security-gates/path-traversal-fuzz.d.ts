/**
 * Security Gate: Path Traversal Fuzzing
 *
 * Generates 1000+ path traversal payloads to test SecureFileReader defenses.
 * All payloads must be blocked for the gate to pass.
 *
 * @security Shepherd-Gamma Approved
 * @module scripts/security-gates/path-traversal-fuzz
 */
/**
 * Generate comprehensive path traversal payloads
 */
declare function generatePathTraversalPayloads(): Array<{
    payload: string;
    category: string;
    description: string;
}>;
/**
 * Main fuzzing execution
 */
declare function runFuzzing(): Promise<number>;
export { runFuzzing, generatePathTraversalPayloads };
//# sourceMappingURL=path-traversal-fuzz.d.ts.map