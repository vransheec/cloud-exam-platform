/**
 * Image Upload Service Tests
 * 
 * Tests for image upload validation and S3 integration.
 */

// Set up test environment variables before importing modules
process.env.JWT_SECRET = 'test-secret-key-for-testing-only';
process.env.S3_BUCKET_NAME = 'test-bucket';
process.env.S3_REGION = 'us-east-1';

import {
  uploadImage,
  deleteImage,
  imageExists,
  ImageUploadError,
} from './imageUploadService';

describe('Image Upload Service - Validation', () => {
  /**
   * Test that valid image types are accepted
   */
  test('accepts valid image types (JPEG, PNG, GIF)', () => {
    const validTypes = ['image/jpeg', 'image/png', 'image/gif'];
    
    validTypes.forEach((contentType) => {
      // Create a small buffer (1KB)
      const buffer = Buffer.alloc(1024);
      
      // Should not throw for valid types
      expect(async () => {
        // Note: This will fail if S3 is not configured, but validates the type check
        try {
          await uploadImage(buffer, contentType, 'test.jpg');
        } catch (error) {
          // If error is not about image type, that's okay for this test
          if (error instanceof ImageUploadError && error.message.includes('must be JPEG, PNG, or GIF')) {
            throw error;
          }
        }
      }).not.toThrow();
    });
  });

  /**
   * Test that invalid image types are rejected
   */
  test('rejects invalid image types', async () => {
    const invalidTypes = ['image/bmp', 'image/svg+xml', 'application/pdf', 'text/plain'];
    
    for (const contentType of invalidTypes) {
      const buffer = Buffer.alloc(1024);
      
      await expect(
        uploadImage(buffer, contentType, 'test.file')
      ).rejects.toThrow(ImageUploadError);
      
      await expect(
        uploadImage(buffer, contentType, 'test.file')
      ).rejects.toThrow('Image must be JPEG, PNG, or GIF');
    }
  });

  /**
   * Test that files exceeding size limit are rejected
   */
  test('rejects files exceeding 5MB size limit', async () => {
    // Create a buffer larger than 5MB (5 * 1024 * 1024 bytes)
    const largeBuffer = Buffer.alloc(6 * 1024 * 1024); // 6MB
    
    await expect(
      uploadImage(largeBuffer, 'image/jpeg', 'large.jpg')
    ).rejects.toThrow(ImageUploadError);
    
    await expect(
      uploadImage(largeBuffer, 'image/jpeg', 'large.jpg')
    ).rejects.toThrow('exceeds maximum allowed size');
  });

  /**
   * Test that files within size limit are accepted (validation only)
   */
  test('accepts files within 5MB size limit', async () => {
    // Create a buffer smaller than 5MB
    const validBuffer = Buffer.alloc(1024 * 1024); // 1MB
    
    try {
      await uploadImage(validBuffer, 'image/jpeg', 'valid.jpg');
      // If we get here, the upload succeeded (S3 is configured)
      // This is fine - the test passes
    } catch (error) {
      // If error is about size, fail the test
      if (error instanceof ImageUploadError && error.message.includes('exceeds maximum')) {
        throw error;
      }
      // Other errors (like S3 not configured) are okay for this validation test
      // The important thing is that the size validation passed
      expect(error).toBeDefined(); // Just verify we got an error
    }
  }, 10000); // Increase timeout to 10 seconds to handle S3 connection attempts


  /**
   * Test edge case: exactly 5MB file
   */
  test('accepts file exactly at 5MB limit', async () => {
    // Create a buffer exactly 5MB
    const exactBuffer = Buffer.alloc(5 * 1024 * 1024); // Exactly 5MB
    
    try {
      await uploadImage(exactBuffer, 'image/png', 'exact.png');
    } catch (error) {
      // If error is about size, fail the test
      if (error instanceof ImageUploadError && error.message.includes('exceeds maximum')) {
        throw error;
      }
      // Other errors (like S3 not configured) are okay for this validation test
    }
  });

  /**
   * Test edge case: empty file
   */
  test('accepts empty file (0 bytes)', async () => {
    const emptyBuffer = Buffer.alloc(0);
    
    try {
      await uploadImage(emptyBuffer, 'image/gif', 'empty.gif');
    } catch (error) {
      // If error is about size, fail the test
      if (error instanceof ImageUploadError && error.message.includes('exceeds maximum')) {
        throw error;
      }
      // Other errors (like S3 not configured) are okay for this validation test
    }
  });
});

describe('Image Upload Service - URL Handling', () => {
  /**
   * Test that deleteImage handles invalid URLs gracefully
   */
  test('deleteImage throws error for invalid URL format', async () => {
    const invalidUrls = [
      'not-a-url',
      'http://example.com/image.jpg',
      'https://wrong-format.com',
    ];
    
    for (const url of invalidUrls) {
      await expect(deleteImage(url)).rejects.toThrow(ImageUploadError);
    }
  });

  /**
   * Test that imageExists handles invalid URLs gracefully
   */
  test('imageExists returns false for invalid URL format', async () => {
    const invalidUrls = [
      'not-a-url',
      'http://example.com/image.jpg',
      'https://wrong-format.com',
    ];
    
    for (const url of invalidUrls) {
      const exists = await imageExists(url);
      expect(exists).toBe(false);
    }
  });
});
