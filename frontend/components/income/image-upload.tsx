/**
 * Image Upload Component
 * Multi-file drag-and-drop upload with HEIC conversion and compression
 */
'use client';

import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, Image as ImageIcon, Loader2, AlertCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  processImages,
  createPreviewUrl,
  revokePreviewUrl,
  formatFileSize,
  isValidImageType,
} from '@/lib/utils/image-processing';

interface ProcessedFile {
  file: File;
  previewUrl: string;
  originalSize: number;
  compressedSize: number;
}

interface ImageUploadProps {
  onFilesReady: (files: File[]) => void;
  maxFiles?: number;
  className?: string;
}

export function ImageUpload({ onFilesReady, maxFiles = 10, className }: ImageUploadProps) {
  const t = useTranslations('income.import');
  const [files, setFiles] = useState<ProcessedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      setError(null);

      // Validate file types
      const invalidFiles = acceptedFiles.filter((file) => !isValidImageType(file));
      if (invalidFiles.length > 0) {
        setError(t('invalidFileType'));
        return;
      }

      // Check total file count
      const totalFiles = files.length + acceptedFiles.length;
      if (totalFiles > maxFiles) {
        setError(t('maxFilesExceeded', { max: maxFiles }));
        return;
      }

      setIsProcessing(true);
      setProcessingProgress({ current: 0, total: acceptedFiles.length });

      try {
        // Process images (HEIC conversion + compression)
        const processedFiles = await processImages(acceptedFiles, (current, total) => {
          setProcessingProgress({ current, total });
        });

        // Create preview URLs and track sizes
        const newFiles: ProcessedFile[] = processedFiles.map((file, index) => ({
          file,
          previewUrl: createPreviewUrl(file),
          originalSize: acceptedFiles[index].size,
          compressedSize: file.size,
        }));

        const updatedFiles = [...files, ...newFiles];
        setFiles(updatedFiles);
        onFilesReady(updatedFiles.map((f) => f.file));
      } catch (err) {
        setError(err instanceof Error ? err.message : t('processingError'));
      } finally {
        setIsProcessing(false);
        setProcessingProgress({ current: 0, total: 0 });
      }
    },
    [files, maxFiles, onFilesReady, t]
  );

  const removeFile = useCallback(
    (index: number) => {
      const fileToRemove = files[index];
      revokePreviewUrl(fileToRemove.previewUrl);

      const updatedFiles = files.filter((_, i) => i !== index);
      setFiles(updatedFiles);
      onFilesReady(updatedFiles.map((f) => f.file));
    },
    [files, onFilesReady]
  );

  const clearAll = useCallback(() => {
    files.forEach((f) => revokePreviewUrl(f.previewUrl));
    setFiles([]);
    onFilesReady([]);
  }, [files, onFilesReady]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
      'image/heic': ['.heic'],
      'image/heif': ['.heif'],
    },
    maxFiles: maxFiles - files.length,
    disabled: isProcessing || files.length >= maxFiles,
  });

  return (
    <div className={cn('space-y-4', className)}>
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={cn(
          'border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer',
          isDragActive
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-primary/50',
          (isProcessing || files.length >= maxFiles) && 'cursor-not-allowed opacity-50'
        )}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-3">
          {isProcessing ? (
            <>
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">
                {t('processing', {
                  current: processingProgress.current,
                  total: processingProgress.total,
                })}
              </p>
            </>
          ) : (
            <>
              <Upload className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-medium">
                  {isDragActive ? t('dropHere') : t('dragDrop')}
                </p>
                <p className="text-sm text-muted-foreground mt-1">{t('supportedFiles')}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('maxFiles', { max: maxFiles })}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 text-destructive text-sm">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Preview grid */}
      {files.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              {t('selectedFiles', { count: files.length })}
            </p>
            <Button variant="ghost" size="sm" onClick={clearAll} className="text-destructive">
              {t('clearAll')}
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {files.map((file, index) => (
              <div
                key={`${file.file.name}-${index}`}
                className="relative group rounded-lg overflow-hidden border bg-muted"
              >
                {/* Thumbnail */}
                <div className="aspect-square relative">
                  <img
                    src={file.previewUrl}
                    alt={file.file.name}
                    className="w-full h-full object-cover"
                  />
                  {/* Remove button */}
                  <button
                    onClick={() => removeFile(index)}
                    className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* File info */}
                <div className="p-2 text-xs">
                  <p className="truncate font-medium" title={file.file.name}>
                    {file.file.name}
                  </p>
                  <p className="text-muted-foreground">
                    {file.originalSize !== file.compressedSize ? (
                      <>
                        <span className="line-through">{formatFileSize(file.originalSize)}</span>
                        {' → '}
                        <span className="text-green-600 dark:text-green-400">
                          {formatFileSize(file.compressedSize)}
                        </span>
                      </>
                    ) : (
                      formatFileSize(file.compressedSize)
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
