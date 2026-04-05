import { useCallback, useEffect, useState } from "react";
import type { CardUpdate, PokemonCard } from "../backend";
import { useActor } from "./useActor";

export interface CollectionCard {
  id: string;
  cardId: string;
  name: string;
  imageUrl: string;
  setName: string;
  setId: string;
  number: string;
  rarity: string;
  types: string[];
  marketPrice: number;
  customValue?: number;
  quantity: number;
  condition: "Mint" | "Near Mint" | "Excellent" | "Good" | "Poor";
  dateAdded: number;
}

function backendCardToFrontend(card: PokemonCard): CollectionCard {
  return {
    id: card.id,
    cardId: card.cardId,
    name: card.name,
    imageUrl: card.imageUrl,
    setName: card.setName,
    setId: card.setId,
    number: card.number,
    rarity: card.rarity,
    types: card.types,
    marketPrice: card.marketPrice,
    customValue: card.customValue,
    quantity: Number(card.quantity),
    condition: card.condition as CollectionCard["condition"],
    dateAdded: Number(card.dateAdded),
  };
}

function frontendCardToUpdate(
  card: Omit<CollectionCard, "id" | "dateAdded">,
): CardUpdate {
  return {
    cardId: card.cardId,
    name: card.name,
    imageUrl: card.imageUrl,
    setName: card.setName,
    setId: card.setId,
    number: card.number,
    rarity: card.rarity,
    types: card.types,
    marketPrice: card.marketPrice,
    customValue: card.customValue,
    quantity: BigInt(card.quantity),
    condition: card.condition,
  };
}

export function useCollection() {
  const { actor, isFetching } = useActor();
  const [cards, setCards] = useState<CollectionCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load collection from backend when actor is ready
  useEffect(() => {
    if (!actor || isFetching) return;

    setIsLoading(true);
    actor
      .getCollection()
      .then((backendCards) => {
        setCards(backendCards.map(backendCardToFrontend));
      })
      .catch((err) => {
        console.error("Failed to load collection:", err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [actor, isFetching]);

  const addCard = useCallback(
    async (card: Omit<CollectionCard, "id" | "dateAdded">) => {
      if (!actor) return;
      try {
        const update = frontendCardToUpdate(card);
        const created = await actor.addCard(update);
        const newCard = backendCardToFrontend(created);
        setCards((prev) => [newCard, ...prev]);
        return newCard;
      } catch (err) {
        console.error("Failed to add card:", err);
      }
    },
    [actor],
  );

  const updateCard = useCallback(
    async (id: string, updates: Partial<CollectionCard>) => {
      if (!actor) return;
      // Optimistically update local state first
      setCards((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...updates } : c)),
      );
      try {
        const existing = cards.find((c) => c.id === id);
        if (!existing) return;
        const merged = { ...existing, ...updates };
        const update = frontendCardToUpdate(merged);
        const updated = await actor.updateCard(id, update);
        const updatedCard = backendCardToFrontend(updated);
        setCards((prev) => prev.map((c) => (c.id === id ? updatedCard : c)));
      } catch (err) {
        console.error("Failed to update card:", err);
        // Revert on failure
        setCards((prev) =>
          prev.map((c) => (c.id === id ? { ...c, ...updates } : c)),
        );
      }
    },
    [actor, cards],
  );

  const removeCard = useCallback(
    async (id: string) => {
      if (!actor) return;
      // Optimistically remove
      setCards((prev) => prev.filter((c) => c.id !== id));
      try {
        await actor.removeCard(id);
      } catch (err) {
        console.error("Failed to remove card:", err);
      }
    },
    [actor],
  );

  const totalValue = cards.reduce(
    (sum, c) => sum + (c.customValue ?? c.marketPrice) * c.quantity,
    0,
  );
  const totalCards = cards.reduce((sum, c) => sum + c.quantity, 0);
  const mostValuable = [...cards].sort(
    (a, b) => b.marketPrice - a.marketPrice,
  )[0];
  const recentlyAdded = [...cards]
    .sort((a, b) => b.dateAdded - a.dateAdded)
    .slice(0, 5);

  const uniqueSets = [...new Set(cards.map((c) => c.setName))].filter(Boolean);
  const uniqueRarities = [...new Set(cards.map((c) => c.rarity))].filter(
    Boolean,
  );
  const uniqueTypes = [...new Set(cards.flatMap((c) => c.types))].filter(
    Boolean,
  );

  return {
    cards,
    isLoading,
    addCard,
    updateCard,
    removeCard,
    totalValue,
    totalCards,
    mostValuable,
    recentlyAdded,
    uniqueSets,
    uniqueRarities,
    uniqueTypes,
  };
}
