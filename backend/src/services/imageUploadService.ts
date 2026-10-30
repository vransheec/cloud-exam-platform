/**
 * Image Upload Service
 * 
 * Handles image uploads for questions and alternatives.
 * Validates file type and size, uploads to S3, and returns public URLs.
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env';

/**
 * Supported image MIME types
 */
const SUPPORTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
];

/**
 * Maximum file size in bytes (5MB)
 */
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * S3 client instance
 */
const s3 = new S3Client({
  region: env.s3Region,
});

/**
 * ImageUploadResult
 * 
 * Result of an image upload operation
 */
export interface ImageUploadResult {
  /** Public URL of the uploaded image */
  url: string;
  
  /** Unique key/filename in S3 */
  key: string;
  
  /** Size of the uploaded file in bytes */
  size: number;
  
  /** MIME type of the uploaded file */
  contentType: string;
}

/**
 * ImageUploadError
 * 
 * Custom error for image upload failures
 */
export class ImageUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageUploadError';
  }
}

/**
 * Validate image file type
 * 
 * @param contentType - MIME type of the file
 * @throws ImageUploadError if file type is not supported
 */
function validateImageType(contentType: string): void {
  if (!SUPPORTED_IMAGE_TYPES.includes(contentType)) {
    throw new ImageUploadError(
      `Image must be JPEG, PNG, GIF, or WebP. Received: ${contentType}`
    );
  }
}

/**
 * Validate image file size
 * 
 * @param size - Size of the file in bytes
 * @throws ImageUploadError if file size exceeds maximum
 */
function validateImageSize(size: number): void {
  if (size > MAX_FILE_SIZE) {
    const sizeMB = (size / (1024 * 1024)).toFixed(2);
    const maxSizeMB = (MAX_FILE_SIZE / (1024 * 1024)).toFixed(0);
    throw new ImageUploadError(
      `Image size (${sizeMB}MB) exceeds maximum allowed size of ${maxSizeMB}MB`
    );
  }
}

/**
 * Generate a unique S3 key for the image
 * 
 * @param contentType - MIME type of the file
 * @returns Unique S3 key with appropriate file extension
 */
function generateImageKey(contentType: string): string {
  const uuid = uuidv4();
  
  // Determine file extension based on content type
  let extension = 'jpg';
  if (contentType === 'image/png') {
    extension = 'png';
  } else if (contentType === 'image/gif') {
    extension = 'gif';
  } else if (contentType === 'image/webp') {
    extension = 'webp';
  } else if (contentType === 'image/jpg') {
    extension = 'jpg';
  }
  
  // Use a folder structure: images/YYYY/MM/uuid.ext
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  
  return `images/${year}/${month}/${uuid}.${extension}`;
}

/**
 * Upload an image to S3
 * 
 * Validates file type and size, uploads to S3, and returns a signed URL.
 * 
 * @param fileBuffer - Buffer containing the image file data
 * @param contentType - MIME type of the image
 * @param fileName - Original filename (for logging/debugging)
 * @returns ImageUploadResult with URL and metadata
 * @throws ImageUploadError if validation fails or upload fails
 */
export async function uploadImage(
  fileBuffer: Buffer,
  contentType: string,
  fileName?: string
): Promise<ImageUploadResult> {
  // Validate file type
  validateImageType(contentType);
  
  // Validate file size
  const fileSize = fileBuffer.length;
  validateImageSize(fileSize);
  
  // Generate unique key for S3
  const key = generateImageKey(contentType);
  
  try {
    // Upload to S3
    await s3.send(new PutObjectCommand({
      Bucket: env.s3BucketName,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
      // Add metadata for debugging
      Metadata: {
        originalFileName: fileName || 'unknown',
        uploadedAt: new Date().toISOString(),
      },
    }));
    
    // Generate direct S3 URL (no expiration)
    const url = `https://${env.s3BucketName}.s3.${env.s3Region}.amazonaws.com/${key}`;
    
    return {
      url,
      key,
      size: fileSize,
      contentType,
    };
  } catch (error) {
    // Log error for debugging
    console.error('S3 upload failed:', error);
    
    throw new ImageUploadError(
      `Failed to upload image: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Delete an image from S3
 * 
 * Removes an image from S3 storage. Used when deleting questions or alternatives.
 * 
 * @param imageUrl - Full URL of the image to delete
 * @returns true if deletion was successful
 * @throws ImageUploadError if deletion fails
 */
export async function deleteImage(imageUrl: string): Promise<boolean> {
  try {
    // Extract key from URL
    // URL format: https://bucket-name.s3.region.amazonaws.com/key
    const urlParts = imageUrl.split('.amazonaws.com/');
    if (urlParts.length !== 2) {
      throw new ImageUploadError('Invalid image URL format');
    }
    
    const key = urlParts[1];
    
    // Delete from S3
    await s3.send(new DeleteObjectCommand({
      Bucket: env.s3BucketName,
      Key: key,
    }));
    
    return true;
  } catch (error) {
    console.error('S3 deletion failed:', error);
    
    throw new ImageUploadError(
      `Failed to delete image: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Check if an image exists in S3
 * 
 * @param imageUrl - Full URL of the image to check
 * @returns true if image exists, false otherwise
 */
export async function imageExists(imageUrl: string): Promise<boolean> {
  try {
    // Extract key from URL
    const urlParts = imageUrl.split('.amazonaws.com/');
    if (urlParts.length !== 2) {
      return false;
    }
    
    const key = urlParts[1];
    
    // Check if object exists
    await s3.send(new HeadObjectCommand({
      Bucket: env.s3BucketName,
      Key: key,
    }));
    
    return true;
  } catch (error) {
    // If error is NoSuchKey or NotFound, image doesn't exist
    return false;
  }
}
