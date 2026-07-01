"use client";

import { AlertCircleIcon, ImageIcon, UploadIcon, XIcon } from "lucide-react";

import { formatBytes, useFileUpload } from "@/hooks/use-file-upload";
import { Button } from "@/components/ui/button";

type GuestPhotoUploaderProps = {
  disabled?: boolean;
  maxFiles: number;
  maxSize?: number;
  onUpload: (files: File[]) => Promise<void>;
};

export default function GuestPhotoUploader({
  disabled = false,
  maxFiles,
  maxSize = 100 * 1024 * 1024,
  onUpload
}: GuestPhotoUploaderProps) {
  const maxSizeMB = Math.round(maxSize / 1024 / 1024);
  const [
    { files, isDragging, errors },
    { handleDragEnter, handleDragLeave, handleDragOver, handleDrop, openFileDialog, removeFile, clearFiles, getInputProps }
  ] = useFileUpload({
    accept: "image/png,image/jpeg,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif",
    maxFiles: Math.max(maxFiles, 1),
    maxSize,
    multiple: true
  });

  const selectedFiles = files.map(({ file }) => file).filter((file): file is File => file instanceof File);

  async function uploadSelected() {
    if (!selectedFiles.length || disabled) return;
    await onUpload(selectedFiles);
    clearFiles();
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className="relative flex min-h-52 flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-white/18 bg-white/[0.04] p-4 text-white transition-colors has-[input:focus]:border-blue-400/70 has-[input:focus]:ring-4 has-[input:focus]:ring-blue-500/18 data-[dragging=true]:bg-white/[0.10]"
        data-dragging={isDragging || undefined}
        data-files={files.length > 0 || undefined}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <input {...getInputProps({ disabled })} aria-label="Select photos to upload" className="sr-only" />
        <div className="flex flex-col items-center justify-center px-4 py-3 text-center">
          <div aria-hidden="true" className="mb-3 flex size-11 shrink-0 items-center justify-center rounded-full border border-white/12 bg-black/35">
            <ImageIcon className="size-4 text-white/60" />
          </div>
          <p className="mb-1.5 text-sm font-medium">Drop your photos here</p>
          <p className="text-xs text-white/48">JPEG, PNG, WebP, HEIC or HEIF · max {maxSizeMB} MB</p>
          <Button type="button" disabled={disabled} className="mt-4 rounded-full border-white/14 bg-white/10 text-white hover:bg-white/16 hover:text-white" onClick={openFileDialog} variant="outline">
            <UploadIcon aria-hidden="true" className="-ms-1 opacity-70" />
            Select photos
          </Button>
        </div>
      </div>

      {errors.length > 0 ? (
        <div className="flex items-center gap-1 text-xs text-red-200" role="alert">
          <AlertCircleIcon className="size-3 shrink-0" />
          <span>{errors[0]}</span>
        </div>
      ) : null}

      {files.length > 0 ? (
        <div className="space-y-2">
          {files.map((file) => (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/32 p-2 pe-3" key={file.id}>
              <div className="flex min-w-0 items-center gap-3">
                <div className="aspect-square shrink-0 rounded bg-white/10">
                  <img alt={file.file.name} className="size-10 rounded-[inherit] object-cover" src={file.preview} />
                </div>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="truncate text-[13px] font-medium text-white">{file.file.name}</p>
                  <p className="text-xs text-white/45">{formatBytes(file.file.size)}</p>
                </div>
              </div>
              <Button type="button" disabled={disabled} aria-label={`Remove ${file.file.name}`} className="-me-2 size-8 text-white/55 hover:bg-white/10 hover:text-white" onClick={() => removeFile(file.id)} size="icon" variant="ghost">
                <XIcon aria-hidden="true" />
              </Button>
            </div>
          ))}

          <div className="flex items-center justify-between gap-3 pt-1">
            {files.length > 1 ? <Button type="button" disabled={disabled} onClick={clearFiles} size="sm" variant="ghost" className="text-white/55 hover:bg-white/10 hover:text-white">Remove all</Button> : <span />}
            <Button type="button" disabled={disabled || !selectedFiles.length} onClick={() => void uploadSelected()} className="rounded-full bg-blue-600 px-5 text-white hover:bg-blue-500">
              <UploadIcon aria-hidden="true" />
              Upload {selectedFiles.length} {selectedFiles.length === 1 ? "photo" : "photos"}
            </Button>
          </div>
        </div>
      ) : null}

      <p aria-live="polite" className="text-center text-xs text-white/42" role="region">
        Select up to {maxFiles} {maxFiles === 1 ? "photo" : "photos"} at once
      </p>
    </div>
  );
}
