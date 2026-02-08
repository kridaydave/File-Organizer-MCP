import { createErrorResponse, sanitizeErrorMessage } from '../utils/error-handler.js';
import { ValidationError } from '../types.js';

async function runTests() {
  console.log('--- Test: Enhanced Security ---');

  // 1. Test Space Handling in Path
  const pathWithSpaces = 'C:\\Users\\NewAdmin\\My Secret Documents\\data.txt';
  const message = `File not found at ${pathWithSpaces}`;
  const sanitized = sanitizeErrorMessage(message);

  console.log(`Original: "${message}"`);
  console.log(`Sanitized: "${sanitized}"`);

  if (sanitized.includes('Secret')) {
    console.error('❌ FAILED: Path with spaces leaked!');
  } else {
    console.log('✅ SUCCESS: Path with spaces redacted.');
  }

  // 2. Test Error ID for Unknown Errors
  const unknownError = new Error('Database connection failed at 192.168.1.5');
  const response = createErrorResponse(unknownError);
  const text = (response.content[0] as any).text;

  console.log('\nUnknown Error Output:', text);

  if (text.includes('192.168.1.5')) {
    console.error('❌ FAILED: Internal error leaked!');
  } else if (text.includes('Error ID:')) {
    console.log('✅ SUCCESS: Error ID returned instead of details.');
  } else {
    console.log('❓ WARNING: Unexpected format.');
  }

  // 3. Test Validation Error (Should still show sanitized message)
  const valError = new ValidationError('Invalid file type at C:\\Bad\\File.exe');
  const valResp = createErrorResponse(valError);
  const valText = (valResp.content[0] as any).text;
  console.log('\nValidation Output:', valText);

  if (valText.includes('[PATH]')) {
    console.log('✅ SUCCESS: Validation error shows sanitized message.');
  } else {
    console.error('❌ FAILED: Validation error format issue.');
  }
}

runTests();
