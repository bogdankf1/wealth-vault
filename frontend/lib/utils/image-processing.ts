/**
 * Image Processing Utilities
 * Handles HEIC conversion and image compression for iPhone screenshots
 */
import imageCompression from 'browser-image-compression';

// Configuration
const MAX_FILE_SIZE_MB = 2;
const MAX_DIMENSION_PX = 2048;
const HEIC_QUALITY = 0.9;
const COMPRESSION_QUALITY = 0.85;

/**
 * Check if a file is HEIC/HEIF format
 */
export function isHeicFile(file: File): boolean {
  const fileName = file.name.toLowerCase();
  const mimeType = file.type.toLowerCase();

  return (
    fileName.endsWith('.heic') ||
    fileName.endsWith('.heif') ||
    mimeType === 'image/heic' ||
    mimeType === 'image/heif'
  );
}

/**
 * Convert HEIC file to JPEG
 * Uses heic2any library for browser-based conversion
 */
export async function convertHeicToJpeg(file: File): Promise<File> {
  if (!isHeicFile(file)) {
    return file;
  }

  try {
    // Dynamic import to avoid SSR issues
    const heic2any = (await import('heic2any')).default;

    const convertedBlob = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: HEIC_QUALITY,
    });

    // heic2any can return a single blob or array of blobs
    const blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;

    // Create a new File with the converted blob
    const newFileName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
    return new File([blob], newFileName, { type: 'image/jpeg' });
  } catch (error) {
    console.error('HEIC conversion failed:', error);
    throw new Error(`Failed to convert HEIC file: ${file.name}`);
  }
}

/**
 * Compress an image to meet size and dimension requirements
 */
export async function compressImage(file: File): Promise<File> {
  // Skip compression if file is small enough
  const fileSizeMB = file.size / (1024 * 1024);
  if (fileSizeMB <= MAX_FILE_SIZE_MB) {
    return file;
  }

  try {
    const compressedFile = await imageCompression(file, {
      maxSizeMB: MAX_FILE_SIZE_MB,
      maxWidthOrHeight: MAX_DIMENSION_PX,
      useWebWorker: true,
      initialQuality: COMPRESSION_QUALITY,
      fileType: file.type as 'image/jpeg' | 'image/png' | 'image/webp',
    });

    // Preserve original filename
    return new File([compressedFile], file.name, { type: compressedFile.type });
  } catch (error) {
    console.error('Image compression failed:', error);
    throw new Error(`Failed to compress image: ${file.name}`);
  }
}

/**
 * Process a single image: HEIC conversion + compression
 */
export async function processImage(file: File): Promise<File> {
  let processedFile = file;

  // Step 1: Convert HEIC if needed
  if (isHeicFile(file)) {
    processedFile = await convertHeicToJpeg(file);
  }

  // Step 2: Compress if needed
  processedFile = await compressImage(processedFile);

  return processedFile;
}

/**
 * Batch process multiple images with progress callback
 */
export async function processImages(
  files: File[],
  onProgress?: (processed: number, total: number) => void
): Promise<File[]> {
  const results: File[] = [];
  const total = files.length;

  for (let i = 0; i < files.length; i++) {
    const processedFile = await processImage(files[i]);
    results.push(processedFile);
    onProgress?.(i + 1, total);
  }

  return results;
}

/**
 * Create a preview URL for an image file
 */
export function createPreviewUrl(file: File): string {
  return URL.createObjectURL(file);
}

/**
 * Revoke a preview URL to free memory
 */
export function revokePreviewUrl(url: string): void {
  URL.revokeObjectURL(url);
}

/**
 * Get human-readable file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Validate that a file is an acceptable image type
 */
export function isValidImageType(file: File): boolean {
  const acceptedTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
  ];

  const fileName = file.name.toLowerCase();
  const isHeic = fileName.endsWith('.heic') || fileName.endsWith('.heif');

  return acceptedTypes.includes(file.type) || isHeic;
}
