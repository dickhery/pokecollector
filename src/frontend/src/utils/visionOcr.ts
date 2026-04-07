import type { backendInterface } from "../backend";

// ---------------------------------------------------------------------------
// Public result shape
// ---------------------------------------------------------------------------

export interface OcrCardResult {
  /** Best single candidate name (null if nothing detected). */
  detectedName: string | null;
  /** Ranked list of all candidate names (best first). */
  candidateNames: string[];
  /** Collector number portion (e.g. "4" from "4/102", "TG23" from "TG23/TG30"). */
  collectorNumber: string | null;
  /** Printed set total (e.g. "102" from "4/102", "TG30" from "TG23/TG30"). */
  printedTotal: string | null;
  /** The raw number text as it appeared in the OCR output. */
  rawNumberText: string | null;
  /** Full OCR text from the card. */
  rawText: string;
  /** Confidence in the detected name and number. */
  confidenceBucket: "high" | "medium" | "low";
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Pokémon card suffixes that must be preserved as part of the name. */
const POKEMON_SUFFIXES =
  /\b(EX|GX|V|VMAX|VSTAR|BREAK|LEGEND|LV\.X|Prime|SP|ex|TAG TEAM)\b/i;

/** Lines to discard from OCR – these are never card names. */
const NOISE_PATTERNS = [
  /^\d+\s*HP$/i,
  /^HP\s*\d+$/i,
  /^(Fire|Water|Grass|Lightning|Psychic|Fighting|Darkness|Metal|Fairy|Dragon|Colorless|Normal)$/i,
  /^\d+\/\d+$/,
  /^[A-Z]{1,3}[0-9]{2,}\/[A-Z]{1,3}[0-9]{2,}$/, // TG23/TG30
  /^\d+$/,
  /^[A-Z]{1,3}$/,
  /^(Pok[ée]mon|Trainer|Energy|Supporter|Item|Stadium|Basic|Stage|Lv\.?\s*\d+)$/i,
  /copyright|©|www\.|nintendo|creatures|gamefreak|©\d{4}/i,
  /^(Weakness|Resistance|Retreat|Attack|Ability|Pok[ée]-Power|Pok[ée]-Body|Evolves from)$/i,
  /^[^a-zA-Z]+$/,
  /^(damage|heal|discard|draw|flip|coin|put|attach|search|shuffle|return|remove)$/i,
];

// ---------------------------------------------------------------------------
// Vision API response types
// ---------------------------------------------------------------------------

interface WebEntity {
  entityId?: string;
  score?: number;
  description?: string;
}

interface WebDetection {
  webEntities?: WebEntity[];
  bestGuessLabels?: Array<{ label: string; languageCode?: string }>;
}

interface FullTextSymbol {
  text?: string;
  confidence?: number;
}

interface FullTextWord {
  symbols?: FullTextSymbol[];
  confidence?: number;
}

interface FullTextParagraph {
  words?: FullTextWord[];
  confidence?: number;
}

interface FullTextBlock {
  paragraphs?: FullTextParagraph[];
  confidence?: number;
}

interface FullTextAnnotation {
  pages?: Array<{ blocks?: FullTextBlock[] }>;
  text?: string;
}

interface VisionResponse {
  responses?: Array<{
    textAnnotations?: Array<{ description: string }>;
    fullTextAnnotation?: FullTextAnnotation;
    webDetection?: WebDetection;
    error?: { message: string; code?: number };
  }>;
  error?: { message: string; code?: number };
}

// ---------------------------------------------------------------------------
// Image preprocessing
// ---------------------------------------------------------------------------

/**
 * Resize an image to at most MAX_PX on its longest edge, encode as JPEG at
 * QUALITY.  Returns raw base64 (no data-URL prefix).
 */
async function compressImageToBase64(
  imageUrl: string,
  maxPx = 1400,
  quality = 0.9,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxPx || height > maxPx) {
        if (width >= height) {
          height = Math.round((height * maxPx) / width);
          width = maxPx;
        } else {
          width = Math.round((width * maxPx) / height);
          height = maxPx;
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
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      console.log(
        `[VisionOCR] Image ${width}x${height} → ${Math.round((base64.length * 0.75) / 1024)} KB (base64 len ${base64.length})`,
      );
      resolve(base64);
    };
    img.onerror = () =>
      reject(new Error("Failed to load image for compression"));
    img.src = imageUrl;
  });
}

/**
 * Apply a mild contrast/saturation boost to help OCR on low-contrast cards.
 * Returns a new base64 string (no data-URL prefix).
 */
async function applyContrastBoost(imageUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas context unavailable"));
        return;
      }
      // Draw the image then sharpen with a convolution kernel
      ctx.drawImage(img, 0, 0);
      // Mild contrast boost: increase contrast via CSS filter trick on 2d canvas
      // (supported in modern browsers)
      ctx.filter = "contrast(1.2) saturate(1.1)";
      ctx.drawImage(img, 0, 0);
      ctx.filter = "none";
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
    };
    img.onerror = () => reject(new Error("Failed to load image for boost"));
    img.src = imageUrl;
  });
}

// ---------------------------------------------------------------------------
// Name normalisation helpers
// ---------------------------------------------------------------------------

const GENERIC_SUFFIXES_RE =
  /(\s*[-\u2013|].*$|\s*\(.*?\)|\s*(pokemon|card|tcg|trading card game|holo|rare|full art|secret rare).*)/gi;

function cleanPokemonName(raw: string): string {
  return raw
    .replace(GENERIC_SUFFIXES_RE, "")
    .replace(/[^a-zA-Z0-9\s.'\-éè]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractNameFromWebLabel(label: string): string | null {
  if (!label) return null;
  const cleaned = cleanPokemonName(label);
  if (cleaned.length < 2) return null;
  // Must start with a letter (not a number or symbol)
  if (!/^[a-zA-Z]/.test(cleaned)) return null;
  return cleaned;
}

function isNoiseLine(line: string): boolean {
  return NOISE_PATTERNS.some((p) => p.test(line.trim()));
}

// ---------------------------------------------------------------------------
// Card-number parsing
// ---------------------------------------------------------------------------

export interface ParsedCardNumber {
  collectorNumber: string | null;
  printedTotal: string | null;
  rawNumberText: string | null;
}

/**
 * Recognises all common Pokémon TCG number formats:
 *   4/102       → { collectorNumber: "4",    printedTotal: "102" }
 *   TG23/TG30   → { collectorNumber: "TG23", printedTotal: "TG30" }
 *   GG45/GG70   → { collectorNumber: "GG45", printedTotal: "GG70" }
 *   SVP 027     → { collectorNumber: "SVP027", printedTotal: null }
 *   SWSH 123    → { collectorNumber: "SWSH123", printedTotal: null }
 *   123         → { collectorNumber: "123",  printedTotal: null }
 */
export function parseCardNumber(text: string): ParsedCardNumber {
  // 1. x/y style (numeric or alpha-numeric)
  const slashPattern = /\b([A-Z]{0,4}\d{1,4})\s*\/\s*([A-Z]{0,4}\d{1,4})\b/i;
  const slashMatch = text.match(slashPattern);
  if (slashMatch) {
    return {
      collectorNumber: slashMatch[1].toUpperCase(),
      printedTotal: slashMatch[2].toUpperCase(),
      rawNumberText: slashMatch[0],
    };
  }

  // 2. Set prefix + number (e.g. "SVP 027", "SWSH 123")
  const prefixPattern = /\b([A-Z]{2,4})\s+(\d{3})\b/i;
  const prefixMatch = text.match(prefixPattern);
  if (prefixMatch) {
    const combined = `${prefixMatch[1].toUpperCase()}${prefixMatch[2]}`;
    return {
      collectorNumber: combined,
      printedTotal: null,
      rawNumberText: prefixMatch[0],
    };
  }

  // 3. Plain number at end of a line (common for older sets)
  const plainPattern = /\b(\d{1,3})\b/;
  const plainMatch = text.match(plainPattern);
  if (plainMatch) {
    return {
      collectorNumber: plainMatch[1],
      printedTotal: null,
      rawNumberText: plainMatch[1],
    };
  }

  return { collectorNumber: null, printedTotal: null, rawNumberText: null };
}

/**
 * Scan all OCR lines to find the best card number.
 * Prefers x/y patterns, then prefix patterns, then plain numbers at the
 * end of lines (which is where card numbers typically appear).
 */
function extractCardNumberFromText(fullText: string): ParsedCardNumber {
  const lines = fullText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // Priority: x/y patterns first
  for (const line of lines) {
    const result = parseCardNumber(line);
    if (result.collectorNumber && result.printedTotal) {
      console.log("[VisionOCR] Card number (x/y):", result);
      return result;
    }
  }

  // Then prefix patterns
  for (const line of lines) {
    const result = parseCardNumber(line);
    if (
      result.collectorNumber &&
      !result.printedTotal &&
      result.collectorNumber.length > 3
    ) {
      console.log("[VisionOCR] Card number (prefix):", result);
      return result;
    }
  }

  // Last resort: plain number from the full text
  const result = parseCardNumber(fullText);
  if (result.collectorNumber) {
    console.log("[VisionOCR] Card number (plain):", result);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Name extraction from Vision result
// ---------------------------------------------------------------------------

/**
 * Build a ranked, deduplicated list of Pokémon name candidates from:
 *   1. Web detection best-guess labels (highest priority)
 *   2. Strong web entities (score > 0.3)
 *   3. OCR text lines that look like Pokémon names
 */
function buildCandidateNames(
  webDetection: WebDetection | undefined,
  ocrLines: string[],
): string[] {
  const seen = new Set<string>();
  const candidates: Array<{ name: string; score: number }> = [];

  function add(name: string | null, score: number) {
    if (!name || name.length < 2) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ name, score });
  }

  // Tier 1: bestGuessLabels
  for (const label of webDetection?.bestGuessLabels ?? []) {
    const n = extractNameFromWebLabel(label.label);
    add(n, 100);
  }

  // Tier 2: webEntities with score > 0.3
  const entities = (webDetection?.webEntities ?? [])
    .filter((e) => e.description && (e.score ?? 0) > 0.3)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  for (const entity of entities) {
    const n = extractNameFromWebLabel(entity.description ?? "");
    add(n, 50 + (entity.score ?? 0) * 30);
  }

  // Tier 3: OCR lines that look like Pokémon names
  for (const line of ocrLines) {
    if (isNoiseLine(line)) continue;
    if (line.length < 2 || line.length > 35) continue;
    if (!/[a-zA-Z]/.test(line)) continue;
    // Prefer capitalised lines; bonus if they contain a known suffix
    const hasSuffix = POKEMON_SUFFIXES.test(line);
    const isCapitalized = /^[A-Z][a-z]/.test(line);
    if (!isCapitalized && !hasSuffix) continue;

    const n = extractNameFromWebLabel(line);
    const score = (isCapitalized ? 20 : 10) + (hasSuffix ? 15 : 0);
    add(n, score);
  }

  candidates.sort((a, b) => b.score - a.score);
  const names = candidates.map((c) => c.name);
  console.log("[VisionOCR] Candidate names:", names);
  return names;
}

// ---------------------------------------------------------------------------
// Confidence computation
// ---------------------------------------------------------------------------

function computeConfidence(
  webDetection: WebDetection | undefined,
  candidateNames: string[],
  collectorNumber: string | null,
  fullTextAnnotation: FullTextAnnotation | undefined,
): "high" | "medium" | "low" {
  if (candidateNames.length === 0) return "low";

  // High confidence: web detection has a clear best-guess AND at least one
  // strong webEntity agrees, OR we also have a collector number.
  const hasBestGuess = (webDetection?.bestGuessLabels?.length ?? 0) > 0;
  const topEntityScore = webDetection?.webEntities?.[0]?.score ?? 0;
  const hasStrongEntity = topEntityScore > 0.6;

  // Check if top webEntity agrees with bestGuessLabel
  const bestGuessName =
    candidateNames[0]?.toLowerCase().split(" ").slice(0, 2).join(" ") ?? "";
  const topEntityName =
    extractNameFromWebLabel(webDetection?.webEntities?.[0]?.description ?? "")
      ?.toLowerCase()
      .split(" ")
      .slice(0, 2)
      .join(" ") ?? "";
  const namesAgree =
    bestGuessName.length > 2 &&
    topEntityName.length > 2 &&
    (bestGuessName.startsWith(topEntityName) ||
      topEntityName.startsWith(bestGuessName));

  // Average symbol confidence from DOCUMENT_TEXT_DETECTION if available
  let avgSymbolConf = 1.0;
  if (fullTextAnnotation?.pages) {
    let totalConf = 0;
    let count = 0;
    for (const page of fullTextAnnotation.pages) {
      for (const block of page.blocks ?? []) {
        for (const para of block.paragraphs ?? []) {
          for (const word of para.words ?? []) {
            for (const sym of word.symbols ?? []) {
              if (sym.confidence !== undefined) {
                totalConf += sym.confidence;
                count++;
              }
            }
          }
        }
      }
    }
    if (count > 0) avgSymbolConf = totalConf / count;
  }

  if (
    hasBestGuess &&
    (namesAgree || hasStrongEntity) &&
    (collectorNumber !== null || avgSymbolConf > 0.8)
  ) {
    return "high";
  }

  if (hasBestGuess || (candidateNames.length >= 2 && avgSymbolConf > 0.6)) {
    return "medium";
  }

  return "low";
}

// ---------------------------------------------------------------------------
// Main exported function
// ---------------------------------------------------------------------------

export async function analyzeCardWithVision(
  imageUrl: string,
  actor: backendInterface | null,
): Promise<OcrCardResult> {
  if (!actor) {
    throw new Error(
      "Scanner backend is not ready yet. Please wait a moment and try again.",
    );
  }

  console.log("[VisionOCR] Actor ready, starting Vision request");

  // --- First pass: standard compression ---
  const base64First = await compressImageToBase64(imageUrl, 1400, 0.9);

  const firstResult = await runVisionRequest(base64First, actor);

  // --- Second pass: contrast-boosted if confidence is low ---
  if (
    firstResult.confidenceBucket === "low" &&
    firstResult.rawText.length < 20
  ) {
    console.log(
      "[VisionOCR] Low confidence on first pass — retrying with contrast boost",
    );
    try {
      const boostedBase64 = await applyContrastBoost(imageUrl);
      const boostedCompressed = await compressImageToBase64(
        `data:image/jpeg;base64,${boostedBase64}`,
        1400,
        0.9,
      );
      const secondResult = await runVisionRequest(boostedCompressed, actor);
      // Use second-pass result only if it is better
      if (
        secondResult.candidateNames.length >
          firstResult.candidateNames.length ||
        secondResult.confidenceBucket !== "low"
      ) {
        console.log("[VisionOCR] Using contrast-boosted second pass result");
        return secondResult;
      }
    } catch (e) {
      console.warn("[VisionOCR] Second pass failed:", e);
    }
  }

  return firstResult;
}

async function runVisionRequest(
  base64String: string,
  actor: backendInterface,
): Promise<OcrCardResult> {
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

  // Top-level API error (billing not enabled, invalid key, etc.)
  if (parsed.error) {
    const detail = parsed.error.message ?? "Unknown Vision API error";
    throw new Error(`Vision API error: ${detail}`);
  }

  const firstResponse = parsed.responses?.[0];
  if (!firstResponse) {
    throw new Error("Vision API returned an empty response array.");
  }

  if (firstResponse.error) {
    const detail = firstResponse.error.message ?? "Unknown Vision API error";
    throw new Error(`Vision API error: ${detail}`);
  }

  // --- OCR text ---
  // Prefer fullTextAnnotation.text (DOCUMENT_TEXT_DETECTION output), fall back
  // to the legacy textAnnotations[0].description.
  const fullText =
    firstResponse.fullTextAnnotation?.text ??
    firstResponse.textAnnotations?.[0]?.description ??
    "";

  const ocrLines = fullText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // --- Card number ---
  const { collectorNumber, printedTotal, rawNumberText } =
    extractCardNumberFromText(fullText);
  console.log("[VisionOCR] Parsed number:", { collectorNumber, printedTotal });

  // --- Candidate names ---
  const candidateNames = buildCandidateNames(
    firstResponse.webDetection,
    ocrLines,
  );

  // --- Confidence ---
  const confidenceBucket = computeConfidence(
    firstResponse.webDetection,
    candidateNames,
    collectorNumber,
    firstResponse.fullTextAnnotation,
  );

  const detectedName = candidateNames[0] ?? null;

  console.log("[VisionOCR] Final parsed result:", {
    detectedName,
    candidateNames: candidateNames.slice(0, 5),
    collectorNumber,
    printedTotal,
    confidenceBucket,
    rawTextLength: fullText.length,
  });

  return {
    detectedName,
    candidateNames,
    collectorNumber,
    printedTotal,
    rawNumberText,
    rawText: fullText,
    confidenceBucket,
  };
}
