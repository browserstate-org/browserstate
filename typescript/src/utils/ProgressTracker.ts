import { EventEmitter } from "events";

export interface ProgressEvent {
  type: "download" | "upload";
  fileName: string;
  bytesTransferred: number;
  totalBytes: number;
  percentage: number;
}

export interface FileOperation {
  type: "download" | "upload";
  fileName: string;
  totalBytes: number;
}

/**
 * Unified progress tracking for file operations
 */
export class ProgressTracker extends EventEmitter {
  private static instance: ProgressTracker;
  private currentOperation: FileOperation | null = null;
  private bytesTransferred: number = 0;

  private constructor() {
    super();
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): ProgressTracker {
    if (!ProgressTracker.instance) {
      ProgressTracker.instance = new ProgressTracker();
    }
    return ProgressTracker.instance;
  }

  /**
   * Start tracking a new file operation
   */
  public startOperation(operation: FileOperation): void {
    this.currentOperation = operation;
    this.bytesTransferred = 0;
    this.emitProgress();
  }

  /**
   * Update progress for the current operation
   */
  public updateProgress(bytesTransferred: number): void {
    if (!this.currentOperation) return;

    this.bytesTransferred = bytesTransferred;
    this.emitProgress();
  }

  /**
   * Complete the current operation
   */
  public completeOperation(): void {
    if (!this.currentOperation) return;

    this.bytesTransferred = this.currentOperation.totalBytes;
    this.emitProgress();
    this.currentOperation = null;
    this.bytesTransferred = 0;
  }

  /**
   * Emit a progress event
   */
  private emitProgress(): void {
    if (!this.currentOperation) return;

    const event: ProgressEvent = {
      type: this.currentOperation.type,
      fileName: this.currentOperation.fileName,
      bytesTransferred: this.bytesTransferred,
      totalBytes: this.currentOperation.totalBytes,
      percentage:
        (this.bytesTransferred / this.currentOperation.totalBytes) * 100,
    };

    this.emit("progress", event);
  }

  /**
   * Format bytes to human readable string
   */
  public static formatBytes(bytes: number): string {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  /**
   * Create a progress bar string
   */
  public static createProgressBar(
    percentage: number,
    width: number = 30,
  ): string {
    const filled = Math.floor(width * (percentage / 100));
    const empty = width - filled;
    const bar = "█".repeat(filled) + "░".repeat(empty);
    return `${bar} ${percentage.toFixed(1)}%`;
  }
}
