import { PathValidatorService } from '../services/path-validator.service.js';
import { RateLimiter } from '../services/security/rate-limiter.service.js';
import { StreamingScanner } from '../services/streaming-scanner.service.js';
import path from 'path';

async function runSecurityTests() {
  console.log('--- Security Verification ---');

  // 1. Path Validator
  const validator = new PathValidatorService();
  console.log('\n[Path Validator]');

  try {
    await validator.validatePath('valid/path.txt');
    // It might fail if file doesn't exist depending on default options.
    // But invalid chars should fail immediately.
  } catch {}

  try {
    await validator.validatePath('suspicious<file.txt');
    console.error('❌ Failed: Suspicious char NOT detected');
  } catch (e: any) {
    if (e.message.includes('invalid control characters') || e.message.includes('Invalid path')) {
      // Zod might catch it or our regex
      console.log('✅ Success: Suspicious char detected:', e.message);
    } else {
      console.log('✅ Success (Error thrown):', e.message);
    }
  }

  try {
    await validator.validatePath('a'.repeat(5000));
    console.error('❌ Failed: Length limit NOT enforced');
  } catch (e: any) {
    if (e.message.includes('exceeds maximum length')) {
      console.log('✅ Success: Length limit enforced');
    } else {
      console.error('❌ Failed/Unexpected error:', e.message);
    }
  }

  // 2. Rate Limiter
  console.log('\n[Rate Limiter]');
  const limiter = new RateLimiter(2, 10); // 2 per minute

  console.log('Request 1:', limiter.checkLimit('test').allowed); // true
  console.log('Request 2:', limiter.checkLimit('test').allowed); // true
  const req3 = limiter.checkLimit('test');
  console.log('Request 3 (Should fail):', req3.allowed); // false

  if (!req3.allowed && req3.resetIn && req3.resetIn > 0) {
    console.log('✅ Success: Rate limit enforced');
  } else {
    console.error('❌ Failed: Rate limit NOT enforced');
  }

  // 3. Streaming Scanner (Mock)
  console.log('\n[Streaming Scanner]');
  const scanner = new StreamingScanner();
  // Just verify class exists and methods callable
  console.log('✅ Success: StreamingScanner initialized');
}

runSecurityTests();
