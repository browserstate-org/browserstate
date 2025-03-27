export class ProgressTracker {
  private progress: number = 0;
  private callbacks: Set<(progress: number) => void> = new Set();

  onProgress(callback: (progress: number) => void): void {
    this.callbacks.add(callback);
  }

  offProgress(callback: (progress: number) => void): void {
    this.callbacks.delete(callback);
  }

  updateProgress(progress: number): void {
    this.progress = Math.min(100, Math.max(0, progress));
    this.notifyCallbacks();
  }

  private notifyCallbacks(): void {
    this.callbacks.forEach((callback) => callback(this.progress));
  }

  getProgress(): number {
    return this.progress;
  }
}
