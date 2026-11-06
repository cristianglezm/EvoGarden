/** Hands the browser a file to save. */
export function downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = fileName;
    link.href = url;
    link.click();
    // the browser reads it when the click is handled, not before
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
