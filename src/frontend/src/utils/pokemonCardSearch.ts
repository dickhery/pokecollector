/**
 * pokemonCardSearch.ts
 *
 * Ranked multi-pass search against the Pokémon TCG API.
 *
 * Strategy:
 *   Pass A  – Exact phrase search for each candidate name (highest signal).
 *   Pass B  – Wildcard/prefix fallback for candidates that returned nothing.
 *   Scoring – Exact name, exact number, exact printedTotal each boost rank.
 *             Top result auto-selected when its score clearly dominates.
 */

import type { OcrCardResult } from "./visionOcr";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PokemonTCGCard {
  id: string;
  name: string;
  images: { small: string; large: string };
  set: { name: string; id: string; printedTotal?: number };
  number: string;
  rarity?: string;
  types?: string[];
  tcgplayer?: {
    prices?: {
      holofoil?: { market?: number };
      normal?: { market?: number };
      "1stEditionHolofoil"?: { market?: number };
      reverseHolofoil?: { market?: number };
    };
  };
}

export interface ScoredCard {
  card: PokemonTCGCard;
  score: number;
}

export interface SearchResult {
  /** All results sorted by score descending. */
  results: PokemonTCGCard[];
  /** Score of the top result (0 if no results). */
  topScore: number;
  /**
   * True when the top result is clearly the correct card and should be
   * pre-selected in the UI without requiring user confirmation.
   */
  autoSelect: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const TCG_FIELDS = "id,name,images,set,number,rarity,types,tcgplayer";
const PAGE_SIZE = 20;

async function fetchCards(q: string): Promise<PokemonTCGCard[]> {
  const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&pageSize=${PAGE_SIZE}&select=${TCG_FIELDS}`;
  console.log("[TCGSearch] Query:", q);
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: PokemonTCGCard[] };
    return data.data ?? [];
  } catch {
    return [];
  }
}

/** Score a single card against the OCR hints. */
function scoreCard(
  card: PokemonTCGCard,
  hints: OcrCardResult,
  matchedByExactPhrase: boolean,
): number {
  let score = 0;

  // Base: matched by exact phrase vs wildcard
  score += matchedByExactPhrase ? 40 : 10;

  // Exact name match (case-insensitive)
  const cardNameLower = card.name.toLowerCase();
  const detectedLower = (hints.detectedName ?? "").toLowerCase();
  if (detectedLower.length > 0 && cardNameLower === detectedLower) score += 30;
  else if (detectedLower.length > 0 && cardNameLower.includes(detectedLower))
    score += 15;

  // Exact collector number match
  if (
    hints.collectorNumber &&
    card.number.toUpperCase() === hints.collectorNumber.toUpperCase()
  ) {
    score += 30;
  }

  // Exact printedTotal match
  if (
    hints.printedTotal &&
    card.set.printedTotal !== undefined &&
    String(card.set.printedTotal).toUpperCase() ===
      hints.printedTotal.toUpperCase()
  ) {
    score += 20;
  }

  return score;
}

function dedupeById(cards: PokemonTCGCard[]): PokemonTCGCard[] {
  const seen = new Set<string>();
  return cards.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Search the Pokémon TCG API for the best match given OCR hints.
 *
 * The function is async and makes at most 2-3 HTTP requests.
 * Results are scored and sorted; the caller should display them in order.
 */
export async function searchForPokemonCard(
  hints: OcrCardResult,
): Promise<SearchResult> {
  const { detectedName, candidateNames, collectorNumber } = hints;

  if (!detectedName && candidateNames.length === 0) {
    return { results: [], topScore: 0, autoSelect: false };
  }

  // Use top 3 candidates (best first)
  const names = candidateNames.slice(0, 3);
  if (detectedName && !names.includes(detectedName)) {
    names.unshift(detectedName);
  }

  // --- Pass A: exact phrase searches ---
  const exactResults: PokemonTCGCard[] = [];
  const exactIds = new Set<string>();

  for (const name of names) {
    if (!name) continue;
    const cards = await fetchCards(`name:"${name}"`);
    for (const c of cards) {
      if (!exactIds.has(c.id)) {
        exactIds.add(c.id);
        exactResults.push(c);
      }
    }
    if (exactResults.length >= PAGE_SIZE) break;
  }

  // --- Pass B: wildcard fallback if exact returned nothing ---
  let wildcardResults: PokemonTCGCard[] = [];
  if (exactResults.length === 0 && names.length > 0) {
    const firstName = names[0];
    const q = collectorNumber
      ? `name:${firstName}* number:${collectorNumber}`
      : `name:${firstName}*`;
    wildcardResults = await fetchCards(q);

    // If wildcard+number returned nothing, try name only
    if (wildcardResults.length === 0 && collectorNumber) {
      wildcardResults = await fetchCards(`name:${firstName}*`);
    }
  }

  // --- Merge and score ---
  const allCards = dedupeById([...exactResults, ...wildcardResults]);

  const scored: ScoredCard[] = allCards.map((card) => ({
    card,
    score: scoreCard(card, hints, exactIds.has(card.id)),
  }));

  scored.sort((a, b) => b.score - a.score);

  const topScore = scored[0]?.score ?? 0;
  const secondScore = scored[1]?.score ?? 0;

  // Auto-select if top result is clearly dominant
  const autoSelect =
    scored.length > 0 &&
    topScore >= 70 &&
    (scored.length === 1 || topScore - secondScore >= 25);

  const results = scored.map((s) => s.card);

  console.log(
    "[TCGSearch] Results:",
    results.length,
    "topScore:",
    topScore,
    "autoSelect:",
    autoSelect,
    scored
      .slice(0, 3)
      .map((s) => `${s.card.name} #${s.card.number} (${s.score})`)
      .join(", "),
  );

  return { results, topScore, autoSelect };
}

/**
 * Simple name-only search used for manual queries.
 * No scoring — just returns what the TCG API gives us.
 */
export async function searchByName(query: string): Promise<PokemonTCGCard[]> {
  if (!query.trim()) return [];
  return fetchCards(`name:${encodeURIComponent(query.trim())}*`);
}

export function getCardPrice(card: PokemonTCGCard): number {
  const prices = card.tcgplayer?.prices;
  if (!prices) return 0;
  return (
    prices.holofoil?.market ??
    prices["1stEditionHolofoil"]?.market ??
    prices.normal?.market ??
    prices.reverseHolofoil?.market ??
    0
  );
}
