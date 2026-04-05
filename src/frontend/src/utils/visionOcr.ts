import { toast } from "sonner";
import type { backendInterface } from "../backend";

export interface OcrCardResult {
  detectedName: string | null;
  detectedNumber: string | null;
  rawText: string;
}

// Pokemon name suffixes to preserve
const POKEMON_SUFFIXES = /\b(EX|GX|V|VMAX|VSTAR|BREAK|LEGEND|LV\.X|Prime|SP)$/i;

// Lines to filter out from OCR text -- these are NOT card names
const NOISE_PATTERNS = [
  /^\d+\s*HP$/i, // HP values: "120 HP"
  /^HP\s*\d+$/i, // HP values reversed: "HP 120"
  /^(Fire|Water|Grass|Lightning|Psychic|Fighting|Darkness|Metal|Fairy|Dragon|Colorless|Normal)$/i, // Energy types
  /^\d+\/\d+$/, // Card numbers: "4/102"
  /^\d+$/, // Pure numbers
  /^[A-Z]{1,3}$/, // Short abbreviations: "HP", "GX", etc.
  /^(Pok[ée]mon|Trainer|Energy|Supporter|Item|Stadium|Basic|Stage|Lv\.?\s*\d+)$/i, // Card type labels
  /copyright|©|www\.|nintendo|creatures|gamefreak|©\d{4}/i, // Copyright text
  /^(Weakness|Resistance|Retreat|Attack|Ability|Pok[ée]-Power|Pok[ée]-Body)$/i, // Stat labels
  /^[^a-zA-Z]+$/, // Lines with no letters
];

function isNoiseLine(line: string): boolean {
  return NOISE_PATTERNS.some((p) => p.test(line.trim()));
}

function cleanPokemonName(raw: string): string {
  return raw
    .replace(/[^a-zA-Z0-9\s.'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractNameFromWebLabel(label: string): string | null {
  if (!label) return null;
  // "Charizard EX (Pokemon Trading Card Game)" -> "Charizard EX"
  // "Pikachu - Base Set" -> "Pikachu"
  // "Mewtwo VMAX Pokemon Card" -> "Mewtwo VMAX"
  const cleaned = label
    .replace(/\s*[-–|].*$/, "") // Strip everything after dash/pipe
    .replace(/\s*\(.*?\)/g, "") // Strip parentheticals
    .replace(/\s*(pokemon|card|tcg|trading card game).*/gi, "") // Strip generic suffixes
    .trim();

  if (cleaned.length < 2) return null;
  return cleanPokemonName(cleaned);
}

function parseCardText(text: string): {
  name: string | null;
  number: string | null;
} {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // Extract card number first (most reliable via regex)
  const numberPattern = /\b(\d{1,3}\/\d{1,3})\b/;
  let detectedNumber: string | null = null;
  for (const line of lines) {
    const match = line.match(numberPattern);
    if (match) {
      detectedNumber = match[1];
      break;
    }
  }

  // Filter noisy lines, then find the best name candidate
  const candidates = lines.filter((line) => {
    if (isNoiseLine(line)) return false;
    if (line.length < 3 || line.length > 40) return false;
    if (!/[a-zA-Z]/.test(line)) return false;
    // Reject all-caps lines longer than 6 chars (usually flavor text or labels)
    if (line === line.toUpperCase() && line.length > 6) return false;
    return true;
  });

  // Prefer lines that start with a capital letter and optionally have a Pokemon suffix
  const nameCandidate =
    candidates.find(
      (line) => /^[A-Z][a-z]/.test(line) && POKEMON_SUFFIXES.test(line),
    ) ??
    candidates.find((line) => /^[A-Z][a-z]/.test(line)) ??
    candidates[0] ??
    null;

  return {
    name: nameCandidate ? cleanPokemonName(nameCandidate) : null,
    number: detectedNumber,
  };
}

// --- Vision API response types ---
// NOTE: Google Vision API returns "webDetection", NOT "webDetectionAnnotation"

interface WebEntity {
  entityId?: string;
  score?: number;
  description?: string;
}

interface WebDetection {
  webEntities?: WebEntity[];
  bestGuessLabels?: Array<{ label: string; languageCode?: string }>;
}

interface VisionResponse {
  responses?: Array<{
    textAnnotations?: Array<{ description: string }>;
    // Correct field name from Google Vision API
    webDetection?: WebDetection;
    error?: { message: string; code?: number };
  }>;
  error?: { message: string; code?: number };
}

/**
 * Resize/compress an image to max 800x800 JPEG at 0.7 quality.
 * Returns the raw base64 string (no data URL prefix).
 */
async function compressImageToBase64(imageUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 800;
      let { width, height } = img;

      if (width > MAX || height > MAX) {
        if (width > height) {
          height = Math.round((height * MAX) / width);
          width = MAX;
        } else {
          width = Math.round((width * MAX) / height);
          height = MAX;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
      const comma = dataUrl.indexOf(",");
      const base64 = comma !== -1 ? dataUrl.slice(comma + 1) : dataUrl;
      console.log(
        "[VisionOCR] Compressed image size:",
        base64.length,
        "chars (~",
        Math.round((base64.length * 0.75) / 1024),
        "KB)",
      );
      resolve(base64);
    };
    img.onerror = () =>
      reject(new Error("Failed to load image for compression"));
    img.src = imageUrl;
  });
}

/**
 * Extract the best card name from WEB_DETECTION results.
 * Prioritizes bestGuessLabels, then top-scored webEntities.
 */
function extractNameFromWebDetection(
  webDetection: WebDetection | undefined,
): string | null {
  if (!webDetection) return null;

  // Try bestGuessLabel first -- it's the most human-readable
  const bestGuess = webDetection.bestGuessLabels?.[0]?.label;
  if (bestGuess) {
    const name = extractNameFromWebLabel(bestGuess);
    if (name && name.length >= 3) {
      console.log("[VisionOCR] Name from bestGuessLabel:", name);
      return name;
    }
  }

  // Fall back to top-scored web entity
  const entities = (webDetection.webEntities ?? [])
    .filter((e) => e.description && (e.score ?? 0) > 0.3)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  for (const entity of entities) {
    if (!entity.description) continue;
    const name = extractNameFromWebLabel(entity.description);
    if (name && name.length >= 3) {
      console.log(
        "[VisionOCR] Name from webEntity:",
        name,
        "score:",
        entity.score,
      );
      return name;
    }
  }

  return null;
}

export async function analyzeCardWithVision(
  imageUrl: string,
  actor: backendInterface | null,
): Promise<OcrCardResult> {
  // CHANGE: Throw instead of silently returning empty when actor is not ready.
  // ScanCard.tsx should guard this, but belt-and-suspenders here.
  if (!actor) {
    throw new Error(
      "Scanner backend is not ready yet. Please wait a moment and try again.",
    );
  }

  console.log("[VisionOCR] Actor ready, starting Vision request");

  const base64String = await compressImageToBase64(imageUrl);

  console.log("[VisionOCR] Sending image to backend analyzeCardImage");
  let rawJson: string;
  try {
    rawJson = await actor.analyzeCardImage(base64String);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Backend call failed: ${message}`);
  }

  console.log(
    "[VisionOCR] Raw Vision response (first 500 chars):",
    rawJson.slice(0, 500),
  );

  let parsed: VisionResponse;
  try {
    parsed = JSON.parse(rawJson) as VisionResponse;
  } catch {
    throw new Error(
      "Could not parse Vision API response. The backend may have returned an unexpected format.",
    );
  }

  // Top-level API error (e.g. billing not enabled, invalid key)
  if (parsed.error) {
    const detail = parsed.error.message ?? "Unknown Vision API error";
    throw new Error(`Vision API error: ${detail}`);
  }

  const firstResponse = parsed.responses?.[0];
  if (!firstResponse) {
    throw new Error("Vision API returned an empty response array.");
  }

  // Per-response error (e.g. missing key, quota exceeded)
  if (firstResponse.error) {
    const detail = firstResponse.error.message ?? "Unknown Vision API error";
    throw new Error(`Vision API error: ${detail}`);
  }

  // --- Extract card number from TEXT_DETECTION (most reliable for numbers) ---
  const fullText = firstResponse.textAnnotations?.[0]?.description ?? "";
  const { number: detectedNumber } = parseCardText(fullText);

  // --- Extract card name: prefer webDetection, fall back to TEXT_DETECTION ---
  // CHANGE: was "webDetectionAnnotation" -- Google Vision actually returns "webDetection"
  const webName = extractNameFromWebDetection(firstResponse.webDetection);
  const { name: ocrName } = parseCardText(fullText);
  const detectedName = webName ?? ocrName;

  console.log("[VisionOCR] Parsed result:", {
    detectedName,
    detectedNumber,
    ocrText: fullText.slice(0, 100),
  });

  return {
    detectedName,
    detectedNumber,
    rawText: fullText,
  };
}
