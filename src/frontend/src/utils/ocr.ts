// Legacy OCR module — replaced by visionOcr.ts (Google Cloud Vision via backend HTTP outcall)
// Kept as dead code to avoid breaking imports elsewhere.

export interface OcrCardResult {
  detectedName: string | null;
  detectedNumber: string | null;
  rawText: string;
}

export async function recognizeCard(_imageUrl: string): Promise<OcrCardResult> {
  return { detectedName: null, detectedNumber: null, rawText: "" };
}
