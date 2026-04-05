import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Minus, Plus, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import type { CollectionCard } from "../hooks/useCollection";

interface CollectionProps {
  cards: CollectionCard[];
  uniqueSets: string[];
  uniqueRarities: string[];
  uniqueTypes: string[];
  onUpdateCard: (id: string, updates: Partial<CollectionCard>) => void;
  onRemoveCard: (id: string) => void;
  onScanCard: () => void;
}

type SortOption = "dateAdded" | "nameAZ" | "priceHigh" | "priceLow";

const CONDITIONS: CollectionCard["condition"][] = [
  "Mint",
  "Near Mint",
  "Excellent",
  "Good",
  "Poor",
];

const RARITY_COLORS: Record<string, string> = {
  "Holo Rare": "oklch(0.7 0.22 310 / 0.18)",
  Rare: "oklch(0.82 0.18 85 / 0.18)",
  Uncommon: "oklch(0.72 0.18 250 / 0.18)",
  Common: "oklch(0.42 0.01 265 / 0.4)",
};

const RARITY_TEXT: Record<string, string> = {
  "Holo Rare": "oklch(0.8 0.18 310)",
  Rare: "oklch(0.82 0.18 85)",
  Uncommon: "oklch(0.72 0.18 250)",
  Common: "oklch(0.62 0.01 265)",
};

function formatPrice(price: number): string {
  if (!price || Number.isNaN(price)) return "Price N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(price);
}

function CardSkeleton() {
  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{
        background: "oklch(0.18 0.008 265)",
        borderColor: "oklch(0.28 0.012 265)",
      }}
    >
      <Skeleton
        className="w-full aspect-[245/342]"
        style={{ background: "oklch(0.22 0.01 265)" }}
      />
      <div className="p-3 space-y-2">
        <Skeleton
          className="h-4 w-3/4"
          style={{ background: "oklch(0.22 0.01 265)" }}
        />
        <Skeleton
          className="h-3 w-1/2"
          style={{ background: "oklch(0.22 0.01 265)" }}
        />
        <Skeleton
          className="h-5 w-1/3"
          style={{ background: "oklch(0.22 0.01 265)" }}
        />
      </div>
    </div>
  );
}

export default function Collection({
  cards,
  uniqueSets,
  uniqueRarities,
  onUpdateCard,
  onRemoveCard,
  onScanCard,
}: CollectionProps) {
  const [search, setSearch] = useState("");
  const [selectedSet, setSelectedSet] = useState<string>("all");
  const [selectedRarity, setSelectedRarity] = useState<string>("all");
  const [selectedCondition, setSelectedCondition] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortOption>("dateAdded");
  const [selectedCard, setSelectedCard] = useState<CollectionCard | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [editingCustomValue, setEditingCustomValue] = useState<string>("");

  // Suppress unused warning - CardSkeleton is available for loading states
  void CardSkeleton;

  // Seed custom value input when a card is selected
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally seed only when card id changes
  useEffect(() => {
    if (selectedCard) {
      setEditingCustomValue(
        selectedCard.customValue !== undefined
          ? selectedCard.customValue.toFixed(2)
          : "",
      );
    }
  }, [selectedCard?.id]);

  const filtered = cards
    .filter((c) => {
      const matchesSearch =
        !search ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.setName.toLowerCase().includes(search.toLowerCase());
      const matchesSet = selectedSet === "all" || c.setName === selectedSet;
      const matchesRarity =
        selectedRarity === "all" || c.rarity === selectedRarity;
      const matchesCondition =
        selectedCondition === "all" || c.condition === selectedCondition;
      return matchesSearch && matchesSet && matchesRarity && matchesCondition;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "nameAZ":
          return a.name.localeCompare(b.name);
        case "priceHigh":
          return b.marketPrice - a.marketPrice;
        case "priceLow":
          return a.marketPrice - b.marketPrice;
        default:
          return b.dateAdded - a.dateAdded;
      }
    });

  const handleQuantityChange = (card: CollectionCard, delta: number) => {
    const newQty = Math.max(0, card.quantity + delta);
    if (newQty === 0) {
      onRemoveCard(card.id);
      setSelectedCard(null);
    } else {
      onUpdateCard(card.id, { quantity: newQty });
      setSelectedCard((prev) => (prev ? { ...prev, quantity: newQty } : null));
    }
  };

  return (
    <div className="flex gap-5">
      {/* Sidebar Filters */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 240, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-shrink-0 overflow-hidden"
            style={{ width: 240 }}
          >
            <div
              className="rounded-lg border p-4 space-y-5"
              style={{
                background: "oklch(0.18 0.008 265)",
                borderColor: "oklch(0.28 0.012 265)",
                width: 240,
              }}
            >
              <div>
                <h3
                  className="text-xs font-semibold uppercase tracking-wider mb-3"
                  style={{ color: "oklch(0.62 0.01 265)" }}
                >
                  Sets
                </h3>
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => setSelectedSet("all")}
                    className="w-full text-left text-sm px-2 py-1.5 rounded transition-colors font-semibold"
                    style={{
                      color:
                        selectedSet === "all"
                          ? "oklch(0.72 0.18 250)"
                          : "oklch(0.72 0.01 265)",
                      background:
                        selectedSet === "all"
                          ? "oklch(0.58 0.2 250 / 0.1)"
                          : "transparent",
                    }}
                    data-ocid="collection.filter.tab"
                  >
                    All Sets ({cards.length})
                  </button>
                  {uniqueSets.map((set) => (
                    <button
                      type="button"
                      key={set}
                      onClick={() =>
                        setSelectedSet((s) => (s === set ? "all" : set))
                      }
                      className="w-full text-left text-sm px-2 py-1.5 rounded transition-colors"
                      style={{
                        color:
                          selectedSet === set
                            ? "oklch(0.72 0.18 250)"
                            : "oklch(0.72 0.01 265)",
                        background:
                          selectedSet === set
                            ? "oklch(0.58 0.2 250 / 0.1)"
                            : "transparent",
                      }}
                    >
                      {set} ({cards.filter((c) => c.setName === set).length})
                    </button>
                  ))}
                </div>
              </div>

              <div
                className="border-t"
                style={{ borderColor: "oklch(0.28 0.012 265)" }}
              />

              <div>
                <h3
                  className="text-xs font-semibold uppercase tracking-wider mb-3"
                  style={{ color: "oklch(0.62 0.01 265)" }}
                >
                  Rarity
                </h3>
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => setSelectedRarity("all")}
                    className="w-full text-left text-sm px-2 py-1.5 rounded transition-colors"
                    style={{
                      color:
                        selectedRarity === "all"
                          ? "oklch(0.72 0.18 250)"
                          : "oklch(0.72 0.01 265)",
                      background:
                        selectedRarity === "all"
                          ? "oklch(0.58 0.2 250 / 0.1)"
                          : "transparent",
                    }}
                  >
                    All Rarities
                  </button>
                  {uniqueRarities.map((rarity) => (
                    <button
                      type="button"
                      key={rarity}
                      onClick={() =>
                        setSelectedRarity((r) =>
                          r === rarity ? "all" : rarity,
                        )
                      }
                      className="w-full text-left text-sm px-2 py-1.5 rounded transition-colors"
                      style={{
                        color:
                          selectedRarity === rarity
                            ? "oklch(0.72 0.18 250)"
                            : "oklch(0.72 0.01 265)",
                        background:
                          selectedRarity === rarity
                            ? "oklch(0.58 0.2 250 / 0.1)"
                            : "transparent",
                      }}
                    >
                      {rarity}
                    </button>
                  ))}
                </div>
              </div>

              <div
                className="border-t"
                style={{ borderColor: "oklch(0.28 0.012 265)" }}
              />

              <div>
                <h3
                  className="text-xs font-semibold uppercase tracking-wider mb-3"
                  style={{ color: "oklch(0.62 0.01 265)" }}
                >
                  Condition
                </h3>
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => setSelectedCondition("all")}
                    className="w-full text-left text-sm px-2 py-1.5 rounded transition-colors"
                    style={{
                      color:
                        selectedCondition === "all"
                          ? "oklch(0.72 0.18 250)"
                          : "oklch(0.72 0.01 265)",
                      background:
                        selectedCondition === "all"
                          ? "oklch(0.58 0.2 250 / 0.1)"
                          : "transparent",
                    }}
                  >
                    All Conditions
                  </button>
                  {CONDITIONS.map((cond) => (
                    <button
                      type="button"
                      key={cond}
                      onClick={() =>
                        setSelectedCondition((c) => (c === cond ? "all" : cond))
                      }
                      className="w-full text-left text-sm px-2 py-1.5 rounded transition-colors"
                      style={{
                        color:
                          selectedCondition === cond
                            ? "oklch(0.72 0.18 250)"
                            : "oklch(0.72 0.01 265)",
                        background:
                          selectedCondition === cond
                            ? "oklch(0.58 0.2 250 / 0.1)"
                            : "transparent",
                      }}
                    >
                      {cond}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            className="p-2 rounded-md border transition-colors"
            style={{
              background: "oklch(0.18 0.008 265)",
              borderColor: "oklch(0.28 0.012 265)",
              color: "oklch(0.62 0.01 265)",
            }}
            title="Toggle filters"
            data-ocid="collection.filter.toggle"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>

          <div className="relative flex-1 min-w-40 max-w-64">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
              style={{ color: "oklch(0.42 0.01 265)" }}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search cards…"
              className="w-full pl-8 pr-3 py-2 text-sm rounded-md border outline-none"
              style={{
                background: "oklch(0.145 0.01 265)",
                borderColor: "oklch(0.28 0.012 265)",
                color: "oklch(0.92 0.005 265)",
              }}
              data-ocid="collection.search_input"
            />
          </div>

          <Select
            value={sortBy}
            onValueChange={(v) => setSortBy(v as SortOption)}
          >
            <SelectTrigger
              className="w-44 text-sm border"
              style={{
                background: "oklch(0.18 0.008 265)",
                borderColor: "oklch(0.28 0.012 265)",
                color: "oklch(0.82 0.01 265)",
              }}
              data-ocid="collection.sort_select"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              style={{
                background: "oklch(0.2 0.01 265)",
                borderColor: "oklch(0.28 0.012 265)",
              }}
            >
              <SelectItem value="dateAdded">Recently Added</SelectItem>
              <SelectItem value="nameAZ">Name A–Z</SelectItem>
              <SelectItem value="priceHigh">Price: High → Low</SelectItem>
              <SelectItem value="priceLow">Price: Low → High</SelectItem>
            </SelectContent>
          </Select>

          <span
            className="text-xs ml-auto"
            style={{ color: "oklch(0.42 0.01 265)" }}
          >
            {filtered.length} cards
          </span>
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-20 rounded-lg border"
            style={{
              background: "oklch(0.18 0.008 265)",
              borderColor: "oklch(0.28 0.012 265)",
            }}
            data-ocid="collection.empty_state"
          >
            <img
              src="/assets/generated/empty-collection-transparent.dim_200x200.png"
              alt="Empty collection"
              className="w-24 h-24 object-contain mb-4 opacity-60"
            />
            <h3
              className="text-lg font-semibold mb-2"
              style={{ color: "oklch(0.72 0.01 265)" }}
            >
              {cards.length === 0
                ? "Your collection is empty"
                : "No cards match filters"}
            </h3>
            <p
              className="text-sm mb-5"
              style={{ color: "oklch(0.42 0.01 265)" }}
            >
              {cards.length === 0
                ? "Scan your first Pokemon card to get started!"
                : "Try adjusting your search or filters"}
            </p>
            {cards.length === 0 && (
              <button
                type="button"
                onClick={onScanCard}
                className="px-5 py-2.5 text-sm font-semibold rounded-md transition-colors"
                style={{ background: "oklch(0.58 0.2 250)", color: "white" }}
                data-ocid="collection.scan_first_button"
              >
                Scan a Card
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filtered.map((card, idx) => (
              <motion.button
                type="button"
                key={card.id}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2, delay: idx * 0.03 }}
                className="pokemon-card-tile text-left w-full"
                onClick={() => setSelectedCard(card)}
                data-ocid={`collection.item.${idx + 1}`}
              >
                <div
                  className="relative overflow-hidden rounded-t-lg"
                  style={{ background: "oklch(0.145 0.008 265)" }}
                >
                  <img
                    src={card.imageUrl}
                    alt={card.name}
                    className="w-full aspect-[245/342] object-contain"
                    loading="lazy"
                  />
                  {card.quantity > 1 && (
                    <span
                      className="absolute top-2 right-2 text-xs font-bold px-1.5 py-0.5 rounded"
                      style={{
                        background: "oklch(0.58 0.2 250)",
                        color: "white",
                      }}
                    >
                      ×{card.quantity}
                    </span>
                  )}
                </div>
                <div className="p-2.5">
                  <div
                    className="font-semibold text-sm truncate"
                    style={{ color: "oklch(0.92 0.005 265)" }}
                  >
                    {card.name}
                  </div>
                  <div
                    className="text-xs truncate mt-0.5"
                    style={{ color: "oklch(0.52 0.01 265)" }}
                  >
                    {card.setName} · #{card.number}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span
                      className="text-xs px-1.5 py-0.5 rounded"
                      style={{
                        background:
                          RARITY_COLORS[card.rarity] ??
                          "oklch(0.32 0.01 265 / 0.4)",
                        color:
                          RARITY_TEXT[card.rarity] ?? "oklch(0.62 0.01 265)",
                        fontSize: "10px",
                      }}
                    >
                      {card.rarity}
                    </span>
                    <div className="text-right">
                      {card.customValue !== undefined ? (
                        <>
                          <div
                            className="font-bold text-sm"
                            style={{ color: "oklch(0.72 0.18 145)" }}
                          >
                            {formatPrice(card.customValue)}
                          </div>
                          <div
                            className="text-xs line-through opacity-50"
                            style={{ color: "oklch(0.62 0.01 265)" }}
                          >
                            {formatPrice(card.marketPrice)}
                          </div>
                        </>
                      ) : (
                        <span
                          className="font-bold text-sm"
                          style={{ color: "oklch(0.92 0.005 265)" }}
                        >
                          {formatPrice(card.marketPrice)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </div>

      {/* Card Detail Dialog */}
      <Dialog
        open={!!selectedCard}
        onOpenChange={(open) => !open && setSelectedCard(null)}
      >
        <DialogContent
          className="max-w-2xl border"
          style={{
            background: "oklch(0.18 0.008 265)",
            borderColor: "oklch(0.28 0.012 265)",
            color: "oklch(0.92 0.005 265)",
          }}
          data-ocid="collection.card_detail.dialog"
        >
          {selectedCard && (
            <>
              <DialogHeader>
                <DialogTitle
                  className="text-xl font-bold"
                  style={{ color: "oklch(0.92 0.005 265)" }}
                >
                  {selectedCard.name}
                </DialogTitle>
              </DialogHeader>

              <div className="flex gap-5">
                <div
                  className="flex-shrink-0 rounded-lg overflow-hidden"
                  style={{ background: "oklch(0.145 0.008 265)", width: 160 }}
                >
                  <img
                    src={selectedCard.imageUrl}
                    alt={selectedCard.name}
                    className="w-full aspect-[245/342] object-contain"
                  />
                </div>

                <div className="flex-1 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div
                        className="text-xs uppercase tracking-wider mb-1"
                        style={{ color: "oklch(0.42 0.01 265)" }}
                      >
                        Set
                      </div>
                      <div className="text-sm font-medium">
                        {selectedCard.setName}
                      </div>
                    </div>
                    <div>
                      <div
                        className="text-xs uppercase tracking-wider mb-1"
                        style={{ color: "oklch(0.42 0.01 265)" }}
                      >
                        Number
                      </div>
                      <div className="text-sm font-medium">
                        #{selectedCard.number}
                      </div>
                    </div>
                    <div>
                      <div
                        className="text-xs uppercase tracking-wider mb-1"
                        style={{ color: "oklch(0.42 0.01 265)" }}
                      >
                        Rarity
                      </div>
                      <Badge
                        style={{
                          background:
                            RARITY_COLORS[selectedCard.rarity] ??
                            "oklch(0.32 0.01 265 / 0.4)",
                          color:
                            RARITY_TEXT[selectedCard.rarity] ??
                            "oklch(0.62 0.01 265)",
                          border: "none",
                        }}
                      >
                        {selectedCard.rarity}
                      </Badge>
                    </div>
                    <div>
                      <div
                        className="text-xs uppercase tracking-wider mb-1"
                        style={{ color: "oklch(0.42 0.01 265)" }}
                      >
                        Types
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        {selectedCard.types.map((t) => (
                          <Badge
                            key={t}
                            variant="outline"
                            className="text-xs"
                            style={{
                              borderColor: "oklch(0.32 0.012 265)",
                              color: "oklch(0.72 0.01 265)",
                            }}
                          >
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {/* Market Price + Your Value - full width row */}
                    <div className="col-span-2 grid grid-cols-2 gap-3">
                      <div>
                        <div
                          className="text-xs uppercase tracking-wider mb-1"
                          style={{ color: "oklch(0.42 0.01 265)" }}
                        >
                          Market Price
                        </div>
                        <div
                          className="text-lg font-bold"
                          style={{ color: "oklch(0.72 0.18 250)" }}
                        >
                          {formatPrice(selectedCard.marketPrice)}
                        </div>
                      </div>
                      <div>
                        <div
                          className="text-xs uppercase tracking-wider mb-1"
                          style={{ color: "oklch(0.42 0.01 265)" }}
                        >
                          Your Value
                        </div>
                        <div className="relative">
                          <span
                            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs"
                            style={{ color: "oklch(0.52 0.01 265)" }}
                          >
                            $
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={editingCustomValue}
                            onChange={(e) =>
                              setEditingCustomValue(e.target.value)
                            }
                            onBlur={() => {
                              const parsed =
                                Number.parseFloat(editingCustomValue);
                              onUpdateCard(selectedCard.id, {
                                customValue:
                                  !Number.isNaN(parsed) && parsed > 0
                                    ? parsed
                                    : undefined,
                              });
                            }}
                            placeholder={
                              selectedCard.marketPrice
                                ? selectedCard.marketPrice.toFixed(2)
                                : "0.00"
                            }
                            className="w-full pl-6 pr-2 py-1.5 text-sm rounded border outline-none"
                            style={{
                              background: "oklch(0.145 0.01 265)",
                              borderColor: "oklch(0.28 0.012 265)",
                              color: "oklch(0.92 0.005 265)",
                            }}
                            data-ocid="collection.card_detail.custom_value_input"
                          />
                        </div>
                        {selectedCard.customValue !== undefined && (
                          <p
                            className="text-xs mt-1"
                            style={{ color: "oklch(0.52 0.18 145)" }}
                          >
                            Custom value set
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Total Value */}
                    <div className="col-span-2">
                      <div
                        className="text-xs uppercase tracking-wider mb-1"
                        style={{ color: "oklch(0.42 0.01 265)" }}
                      >
                        Total Value
                      </div>
                      <div
                        className="text-lg font-bold"
                        style={{ color: "oklch(0.92 0.005 265)" }}
                      >
                        {formatPrice(
                          (selectedCard.customValue ??
                            selectedCard.marketPrice) * selectedCard.quantity,
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Condition selector */}
                  <div>
                    <div
                      className="text-xs uppercase tracking-wider mb-2"
                      style={{ color: "oklch(0.42 0.01 265)" }}
                    >
                      Condition
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {CONDITIONS.map((cond) => (
                        <button
                          type="button"
                          key={cond}
                          onClick={() =>
                            onUpdateCard(selectedCard.id, { condition: cond })
                          }
                          className="text-xs px-2 py-1 rounded border transition-colors"
                          style={{
                            background:
                              selectedCard.condition === cond
                                ? "oklch(0.58 0.2 250)"
                                : "transparent",
                            borderColor:
                              selectedCard.condition === cond
                                ? "oklch(0.58 0.2 250)"
                                : "oklch(0.28 0.012 265)",
                            color:
                              selectedCard.condition === cond
                                ? "white"
                                : "oklch(0.62 0.01 265)",
                          }}
                          data-ocid="collection.card_detail.condition_button"
                        >
                          {cond}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Quantity */}
                  <div>
                    <div
                      className="text-xs uppercase tracking-wider mb-2"
                      style={{ color: "oklch(0.42 0.01 265)" }}
                    >
                      Quantity
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleQuantityChange(selectedCard, -1)}
                        className="w-8 h-8 rounded border flex items-center justify-center transition-colors"
                        style={{
                          borderColor: "oklch(0.28 0.012 265)",
                          color: "oklch(0.62 0.01 265)",
                        }}
                        data-ocid="collection.card_detail.decrease_button"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-lg font-bold w-8 text-center">
                        {selectedCard.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleQuantityChange(selectedCard, 1)}
                        className="w-8 h-8 rounded border flex items-center justify-center transition-colors"
                        style={{
                          borderColor: "oklch(0.28 0.012 265)",
                          color: "oklch(0.62 0.01 265)",
                        }}
                        data-ocid="collection.card_detail.increase_button"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Remove */}
              <div
                className="flex justify-end pt-2 border-t"
                style={{ borderColor: "oklch(0.28 0.012 265)" }}
              >
                <button
                  type="button"
                  onClick={() => {
                    onRemoveCard(selectedCard.id);
                    setSelectedCard(null);
                  }}
                  className="flex items-center gap-2 px-3 py-2 text-sm rounded-md border transition-colors"
                  style={{
                    borderColor: "oklch(0.577 0.245 27.325 / 0.4)",
                    color: "oklch(0.7 0.18 27)",
                  }}
                  data-ocid="collection.card_detail.delete_button"
                >
                  <Trash2 className="w-4 h-4" />
                  Remove from Collection
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
