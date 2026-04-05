import {
  Clock,
  DollarSign,
  Package,
  Star,
  TrendingUp,
  Zap,
} from "lucide-react";
import { motion } from "motion/react";
import type { CollectionCard } from "../hooks/useCollection";

interface DashboardProps {
  cards: CollectionCard[];
  totalValue: number;
  totalCards: number;
  mostValuable: CollectionCard | undefined;
  recentlyAdded: CollectionCard[];
  onNavigate: (page: string) => void;
}

function formatPrice(price: number): string {
  if (!price || Number.isNaN(price)) return "Price N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(price);
}

function formatDate(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// Generate sparkline path from value data
function generateSparkline(baseValue: number, points = 12): string {
  const w = 300;
  const h = 60;
  const padding = 4;
  const values: number[] = [];
  let v = baseValue * 0.82;
  for (let i = 0; i < points; i++) {
    v = v * (1 + (Math.random() * 0.08 - 0.02));
    values.push(v);
  }
  values[values.length - 1] = baseValue;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const coords = values.map((val, i) => {
    const x = padding + (i / (points - 1)) * (w - padding * 2);
    const y = h - padding - ((val - min) / range) * (h - padding * 2);
    return `${x},${y}`;
  });
  return `M ${coords.join(" L ")} L ${w - padding},${h} L ${padding},${h} Z`;
}

export default function Dashboard({
  cards,
  totalValue,
  totalCards,
  mostValuable,
  recentlyAdded,
  onNavigate,
}: DashboardProps) {
  const thisWeekCount = cards.filter(
    (c) => Date.now() - c.dateAdded < 7 * 86400000,
  ).length;

  const sparklinePath = generateSparkline(totalValue);

  const rarityOrder = ["Holo Rare", "Rare", "Uncommon", "Common"];
  const rarestCard = [...cards].sort(
    (a, b) => rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity),
  )[0];

  return (
    <div className="space-y-6">
      {/* Hero Stats */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="grid grid-cols-1 sm:grid-cols-3 gap-4"
      >
        {/* Total Value */}
        <div
          className="rounded-lg p-5 border"
          style={{
            background: "oklch(0.18 0.008 265)",
            borderColor: "oklch(0.28 0.012 265)",
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <span
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: "oklch(0.62 0.01 265)" }}
            >
              Total Value
            </span>
            <div
              className="w-8 h-8 rounded-md flex items-center justify-center"
              style={{ background: "oklch(0.58 0.2 250 / 0.15)" }}
            >
              <DollarSign
                className="w-4 h-4"
                style={{ color: "oklch(0.72 0.18 250)" }}
              />
            </div>
          </div>
          <div className="text-2xl font-bold text-foreground">
            {formatPrice(totalValue)}
          </div>
          <div
            className="text-xs mt-1 flex items-center gap-1"
            style={{ color: "oklch(0.65 0.18 145)" }}
          >
            <TrendingUp className="w-3 h-3" />
            <span>+5.1% this month</span>
          </div>
        </div>

        {/* Total Cards */}
        <div
          className="rounded-lg p-5 border"
          style={{
            background: "oklch(0.18 0.008 265)",
            borderColor: "oklch(0.28 0.012 265)",
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <span
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: "oklch(0.62 0.01 265)" }}
            >
              Total Cards
            </span>
            <div
              className="w-8 h-8 rounded-md flex items-center justify-center"
              style={{ background: "oklch(0.65 0.18 145 / 0.15)" }}
            >
              <Package
                className="w-4 h-4"
                style={{ color: "oklch(0.65 0.18 145)" }}
              />
            </div>
          </div>
          <div className="text-2xl font-bold text-foreground">{totalCards}</div>
          <div
            className="text-xs mt-1"
            style={{ color: "oklch(0.62 0.01 265)" }}
          >
            across {cards.length} unique cards
          </div>
        </div>

        {/* Added This Week */}
        <div
          className="rounded-lg p-5 border"
          style={{
            background: "oklch(0.18 0.008 265)",
            borderColor: "oklch(0.28 0.012 265)",
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <span
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: "oklch(0.62 0.01 265)" }}
            >
              Added This Week
            </span>
            <div
              className="w-8 h-8 rounded-md flex items-center justify-center"
              style={{ background: "oklch(0.82 0.18 85 / 0.15)" }}
            >
              <Zap
                className="w-4 h-4"
                style={{ color: "oklch(0.82 0.18 85)" }}
              />
            </div>
          </div>
          <div className="text-2xl font-bold text-foreground">
            {thisWeekCount}
          </div>
          <div
            className="text-xs mt-1"
            style={{ color: "oklch(0.62 0.01 265)" }}
          >
            new cards scanned
          </div>
        </div>
      </motion.div>

      {/* Middle row: Quick stats + Sparkline */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Quick Info Cards */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="lg:col-span-2 space-y-3"
        >
          {/* Most Valuable */}
          {mostValuable && (
            <div
              className="rounded-lg p-4 border flex items-center gap-3"
              style={{
                background: "oklch(0.18 0.008 265)",
                borderColor: "oklch(0.28 0.012 265)",
              }}
            >
              <img
                src={mostValuable.imageUrl}
                alt={mostValuable.name}
                className="w-12 h-16 object-contain rounded flex-shrink-0"
                style={{ background: "oklch(0.14 0.008 265)" }}
              />
              <div className="min-w-0">
                <div
                  className="text-xs font-semibold uppercase tracking-wider mb-1"
                  style={{ color: "oklch(0.62 0.01 265)" }}
                >
                  Most Valuable
                </div>
                <div className="font-semibold text-sm text-foreground truncate">
                  {mostValuable.name}
                </div>
                <div
                  className="text-xs"
                  style={{ color: "oklch(0.62 0.01 265)" }}
                >
                  {mostValuable.setName}
                </div>
                <div
                  className="font-bold text-sm mt-1"
                  style={{ color: "oklch(0.72 0.18 250)" }}
                >
                  {formatPrice(mostValuable.marketPrice)}
                </div>
              </div>
              <Star
                className="w-4 h-4 ml-auto flex-shrink-0"
                style={{ color: "oklch(0.82 0.18 85)" }}
                fill="oklch(0.82 0.18 85)"
              />
            </div>
          )}

          {/* Rarest Card */}
          {rarestCard && (
            <div
              className="rounded-lg p-4 border flex items-center gap-3"
              style={{
                background: "oklch(0.18 0.008 265)",
                borderColor: "oklch(0.28 0.012 265)",
              }}
            >
              <img
                src={rarestCard.imageUrl}
                alt={rarestCard.name}
                className="w-12 h-16 object-contain rounded flex-shrink-0"
                style={{ background: "oklch(0.14 0.008 265)" }}
              />
              <div className="min-w-0">
                <div
                  className="text-xs font-semibold uppercase tracking-wider mb-1"
                  style={{ color: "oklch(0.62 0.01 265)" }}
                >
                  Rarest Card
                </div>
                <div className="font-semibold text-sm text-foreground truncate">
                  {rarestCard.name}
                </div>
                <div
                  className="text-xs"
                  style={{ color: "oklch(0.62 0.01 265)" }}
                >
                  {rarestCard.rarity}
                </div>
              </div>
              <div
                className="text-xs font-semibold px-2 py-1 rounded ml-auto flex-shrink-0"
                style={{
                  background: "oklch(0.7 0.22 310 / 0.15)",
                  color: "oklch(0.8 0.18 310)",
                }}
              >
                {rarestCard.rarity}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onNavigate("scan")}
              className="flex-1 py-2.5 text-sm font-semibold rounded-md transition-colors"
              style={{
                background: "oklch(0.58 0.2 250)",
                color: "white",
              }}
              data-ocid="dashboard.scan_button"
            >
              Scan a Card
            </button>
            <button
              type="button"
              onClick={() => onNavigate("collection")}
              className="flex-1 py-2.5 text-sm font-semibold rounded-md transition-colors border"
              style={{
                background: "transparent",
                borderColor: "oklch(0.28 0.012 265)",
                color: "oklch(0.82 0.01 265)",
              }}
              data-ocid="dashboard.collection_button"
            >
              View Collection
            </button>
          </div>
        </motion.div>

        {/* Value Chart */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="lg:col-span-3 rounded-lg border p-5"
          style={{
            background: "oklch(0.18 0.008 265)",
            borderColor: "oklch(0.28 0.012 265)",
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: "oklch(0.62 0.01 265)" }}
              >
                Collection Value Trend
              </h3>
              <div className="text-lg font-bold text-foreground mt-1">
                {formatPrice(totalValue)}
              </div>
            </div>
            <span
              className="text-xs font-semibold px-2 py-1 rounded flex items-center gap-1"
              style={{
                background: "oklch(0.65 0.18 145 / 0.15)",
                color: "oklch(0.65 0.18 145)",
              }}
            >
              <TrendingUp className="w-3 h-3" />
              +5.1%
            </span>
          </div>
          <svg
            viewBox="0 0 300 60"
            role="img"
            aria-label="Collection value trend chart"
            className="w-full"
            preserveAspectRatio="none"
            style={{ height: "80px" }}
          >
            <title>Collection value trend over 12 months</title>
            <defs>
              <linearGradient id="sparkGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="oklch(0.58 0.2 250)"
                  stopOpacity="0.4"
                />
                <stop
                  offset="100%"
                  stopColor="oklch(0.58 0.2 250)"
                  stopOpacity="0"
                />
              </linearGradient>
            </defs>
            <path d={sparklinePath} fill="url(#sparkGradient)" />
            <path
              d={sparklinePath.split(" L ").slice(0, -2).join(" L ")}
              fill="none"
              stroke="oklch(0.58 0.2 250)"
              strokeWidth="1.5"
            />
          </svg>
          <div
            className="flex justify-between text-xs mt-2"
            style={{ color: "oklch(0.42 0.01 265)" }}
          >
            <span>12 months ago</span>
            <span>Today</span>
          </div>
        </motion.div>
      </div>

      {/* Recent Activity */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="rounded-lg border"
        style={{
          background: "oklch(0.18 0.008 265)",
          borderColor: "oklch(0.28 0.012 265)",
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: "oklch(0.28 0.012 265)" }}
        >
          <h3
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: "oklch(0.62 0.01 265)" }}
          >
            Recent Activity
          </h3>
          <button
            type="button"
            onClick={() => onNavigate("collection")}
            className="text-xs transition-colors"
            style={{ color: "oklch(0.72 0.18 250)" }}
            data-ocid="dashboard.view_all_link"
          >
            View all
          </button>
        </div>

        {recentlyAdded.length === 0 ? (
          <div
            className="py-10 text-center"
            style={{ color: "oklch(0.42 0.01 265)" }}
          >
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No cards added yet</p>
          </div>
        ) : (
          <div
            className="divide-y"
            style={{ borderColor: "oklch(0.28 0.012 265)" }}
          >
            {recentlyAdded.map((card, idx) => (
              <div
                key={card.id}
                className="flex items-center gap-3 px-5 py-3"
                data-ocid={`activity.item.${idx + 1}`}
              >
                <img
                  src={card.imageUrl}
                  alt={card.name}
                  className="w-9 h-12 object-contain rounded flex-shrink-0"
                  style={{ background: "oklch(0.14 0.008 265)" }}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-foreground truncate">
                    {card.name}
                  </div>
                  <div
                    className="text-xs"
                    style={{ color: "oklch(0.62 0.01 265)" }}
                  >
                    {card.setName} · {card.rarity}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div
                    className="font-bold text-sm"
                    style={{ color: "oklch(0.92 0.005 265)" }}
                  >
                    {formatPrice(card.marketPrice)}
                  </div>
                  <div
                    className="text-xs"
                    style={{ color: "oklch(0.42 0.01 265)" }}
                  >
                    {formatDate(card.dateAdded)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
