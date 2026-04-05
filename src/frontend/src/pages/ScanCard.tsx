import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Camera,
  CheckCircle,
  ChevronRight,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useCamera } from "../camera/useCamera";
import { useActor } from "../hooks/useActor";
import type { CollectionCard } from "../hooks/useCollection";
import { analyzeCardWithVision } from "../utils/visionOcr";

interface ScanCardProps {
  onClose: () => void;
  onAddCard: (card: Omit<CollectionCard, "id" | "dateAdded">) => void;
}

interface PokemonTCGCard {
  id: string;
  name: string;
  images: { small: string; large: string };
  set: { name: string; id: string };
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

type Step = "camera" | "search" | "confirm";
type Condition = CollectionCard["condition"];

const CONDITIONS: Condition[] = [
  "Mint",
  "Near Mint",
  "Excellent",
  "Good",
  "Poor",
];

function getCardPrice(card: PokemonTCGCard): number {
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

export default function ScanCard({ onClose, onAddCard }: ScanCardProps) {
  const [step, setStep] = useState<Step>("camera");
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<PokemonTCGCard[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedResult, setSelectedResult] = useState<PokemonTCGCard | null>(
    null,
  );
  const [quantity, setQuantity] = useState(1);
  const [condition, setCondition] = useState<Condition>("Near Mint");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isOcrRunning, setIsOcrRunning] = useState(false);
  const [ocrDetected, setOcrDetected] = useState<{
    name: string | null;
    number: string | null;
  } | null>(null);
  const [customValueInput, setCustomValueInput] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const viewfinderRef = useRef<HTMLDivElement>(null);

  const camera = useCamera({ facingMode: "environment" });
  const { startCamera, stopCamera } = camera;
  // Change 1: also destructure isFetching
  const { actor, isFetching: actorLoading } = useActor();

  // Change 2: debug log actor readiness on changes
  useEffect(() => {
    console.log(
      "[ScanCard] actor ready:",
      !!actor,
      "actorLoading:",
      actorLoading,
    );
  }, [actor, actorLoading]);

  const handleStop = useCallback(async () => {
    await stopCamera();
  }, [stopCamera]);

  // Start camera when on camera step
  useEffect(() => {
    if (step === "camera") {
      startCamera();
    } else {
      handleStop();
    }
    return () => {
      handleStop();
    };
  }, [step, startCamera, handleStop]);

  // Focus search input when on search step
  useEffect(() => {
    if (step === "search") {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [step]);

  const handleSearch = async (query: string, cardNumber?: string) => {
    if (!query.trim()) return;
    setIsSearching(true);
    setResults([]);
    try {
      let url = `https://api.pokemontcg.io/v2/cards?q=name:${encodeURIComponent(query.trim())}*&pageSize=16`;
      // If we have a card number, add it to narrow results
      if (cardNumber) {
        url = `https://api.pokemontcg.io/v2/cards?q=name:${encodeURIComponent(query.trim())}* number:${encodeURIComponent(cardNumber)}&pageSize=16`;
      }
      const res = await fetch(url);
      const data = (await res.json()) as { data: PokemonTCGCard[] };
      // If number search returned nothing, fall back to name only
      if (cardNumber && (!data.data || data.data.length === 0)) {
        const fallback = await fetch(
          `https://api.pokemontcg.io/v2/cards?q=name:${encodeURIComponent(query.trim())}*&pageSize=16`,
        );
        const fallbackData = (await fallback.json()) as {
          data: PokemonTCGCard[];
        };
        setResults(fallbackData.data ?? []);
      } else {
        setResults(data.data ?? []);
      }
    } catch {
      toast.error("Failed to search. Check your connection.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleCapture = async () => {
    // Change 5: Guard — actor must be ready before we can run OCR
    if (!actor) {
      toast.error(
        "Scanner backend is not ready yet. Please wait a moment and try again.",
      );
      return;
    }

    // Step 1: Capture the photo COMPLETELY before changing any state.
    // Changing step triggers stopCamera() via useEffect, which sets isActive=false
    // and would cause capturePhoto() to return null. So we MUST finish capture first.
    let photo: File | null = null;

    // Try crop capture first (focuses on just the card inside the viewfinder)
    try {
      if (viewfinderRef.current && camera.videoRef.current) {
        const videoRect = camera.videoRef.current.getBoundingClientRect();
        const vfRect = viewfinderRef.current.getBoundingClientRect();

        if (
          vfRect.width > 0 &&
          vfRect.height > 0 &&
          videoRect.width > 0 &&
          videoRect.height > 0
        ) {
          const cropRect = {
            x: vfRect.left - videoRect.left,
            y: vfRect.top - videoRect.top,
            width: vfRect.width,
            height: vfRect.height,
          };
          photo = await camera.capturePhotoWithCrop(cropRect);
        }
      }
    } catch (err) {
      console.warn("Crop capture failed, falling back to full frame:", err);
    }

    // Fall back to full-frame if crop didn't work
    if (!photo) {
      try {
        photo = await camera.capturePhoto();
      } catch (err) {
        console.warn("Full-frame capture failed:", err);
      }
    }

    // Step 2: Only now that capture is done, transition to search step
    if (!photo) {
      toast.error(
        "Failed to capture image. Make sure the camera is active and try again.",
      );
      return;
    }

    const imageUrl = URL.createObjectURL(photo);
    setCapturedImage(imageUrl);
    setIsOcrRunning(true);
    setOcrDetected(null);
    // Change step AFTER capture is complete -- this triggers stopCamera() safely
    setStep("search");

    // Step 3: Run Vision OCR analysis
    try {
      const result = await analyzeCardWithVision(imageUrl, actor);
      setOcrDetected({
        name: result.detectedName,
        number: result.detectedNumber,
      });
      if (result.detectedName) {
        setSearchQuery(result.detectedName);
        await handleSearch(
          result.detectedName,
          result.detectedNumber ?? undefined,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`Card scan failed: ${message}`);
      setOcrDetected({ name: null, number: null });
    } finally {
      setIsOcrRunning(false);
    }
  };

  const handleSkipCamera = () => {
    setStep("search");
  };

  const handleSelectResult = (card: PokemonTCGCard) => {
    setSelectedResult(card);
    setStep("confirm");
  };

  const handleAddToCollection = () => {
    if (!selectedResult) return;
    const price = getCardPrice(selectedResult);
    const parsed = Number.parseFloat(customValueInput);
    onAddCard({
      cardId: selectedResult.id,
      name: selectedResult.name,
      imageUrl: selectedResult.images.large ?? selectedResult.images.small,
      setName: selectedResult.set.name,
      setId: selectedResult.set.id,
      number: selectedResult.number,
      rarity: selectedResult.rarity ?? "Unknown",
      types: selectedResult.types ?? [],
      marketPrice: price,
      customValue: !Number.isNaN(parsed) && parsed > 0 ? parsed : undefined,
      quantity,
      condition,
    });
    toast.success(`${selectedResult.name} added to your collection!`);
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "oklch(0.08 0.01 265 / 0.92)" }}
      data-ocid="scan.modal"
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-2xl rounded-xl border overflow-hidden flex flex-col"
        style={{
          background: "oklch(0.18 0.008 265)",
          borderColor: "oklch(0.28 0.012 265)",
          maxHeight: "90vh",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0"
          style={{ borderColor: "oklch(0.28 0.012 265)" }}
        >
          <div className="flex items-center gap-3">
            {/* Steps indicator */}
            {(["camera", "search", "confirm"] as Step[]).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{
                    background:
                      step === s
                        ? "oklch(0.58 0.2 250)"
                        : (["search", "confirm"].includes(step) &&
                              s === "camera") ||
                            (step === "confirm" && s === "search")
                          ? "oklch(0.65 0.18 145 / 0.3)"
                          : "oklch(0.28 0.012 265)",
                    color: step === s ? "white" : "oklch(0.62 0.01 265)",
                  }}
                >
                  {i + 1}
                </div>
                <span
                  className="text-xs font-medium capitalize hidden sm:inline"
                  style={{
                    color:
                      step === s
                        ? "oklch(0.92 0.005 265)"
                        : "oklch(0.42 0.01 265)",
                  }}
                >
                  {s}
                </span>
                {i < 2 && (
                  <ChevronRight
                    className="w-3 h-3 hidden sm:block"
                    style={{ color: "oklch(0.32 0.01 265)" }}
                  />
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md transition-colors"
            style={{ color: "oklch(0.52 0.01 265)" }}
            data-ocid="scan.close_button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {/* Step 1: Camera */}
            {step === "camera" && (
              <motion.div
                key="camera"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-5 space-y-4"
              >
                <div>
                  <h2 className="text-lg font-bold text-foreground mb-1">
                    Scan Your Card
                  </h2>
                  <p
                    className="text-sm"
                    style={{ color: "oklch(0.52 0.01 265)" }}
                  >
                    Position the card inside the blue frame, then tap Capture.
                  </p>
                </div>

                {/* Change 4: Actor loading warning banner — above the camera viewport */}
                {actorLoading && (
                  <div
                    className="flex items-center gap-2 px-3 py-2 rounded-md text-sm"
                    style={{
                      background: "oklch(0.18 0.06 50 / 0.3)",
                      border: "1px solid oklch(0.45 0.1 50 / 0.4)",
                      color: "oklch(0.82 0.1 50)",
                    }}
                  >
                    <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                    <span>Connecting to scanner backend…</span>
                  </div>
                )}

                {/* Camera viewport */}
                <div
                  className="relative rounded-lg overflow-hidden"
                  style={{
                    background: "oklch(0.12 0.008 265)",
                    aspectRatio: "4/3",
                  }}
                >
                  <video
                    ref={camera.videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  <canvas ref={camera.canvasRef} className="hidden" />

                  {/* Card outline overlay */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div
                      ref={viewfinderRef}
                      className="border-2 rounded-lg"
                      style={{
                        width: "45%",
                        aspectRatio: "245/342",
                        borderColor: "oklch(0.58 0.2 250 / 0.8)",
                        boxShadow: "0 0 0 9999px oklch(0 0 0 / 0.4)",
                      }}
                    />
                  </div>

                  {/* Corner guides */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div
                      className="relative"
                      style={{ width: "45%", aspectRatio: "245/342" }}
                    >
                      {/* Top-left corner */}
                      <div
                        className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 rounded-tl"
                        style={{ borderColor: "oklch(0.72 0.2 250)" }}
                      />
                      {/* Top-right corner */}
                      <div
                        className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 rounded-tr"
                        style={{ borderColor: "oklch(0.72 0.2 250)" }}
                      />
                      {/* Bottom-left corner */}
                      <div
                        className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 rounded-bl"
                        style={{ borderColor: "oklch(0.72 0.2 250)" }}
                      />
                      {/* Bottom-right corner */}
                      <div
                        className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 rounded-br"
                        style={{ borderColor: "oklch(0.72 0.2 250)" }}
                      />
                    </div>
                  </div>

                  {camera.isLoading && (
                    <div
                      className="absolute inset-0 flex items-center justify-center"
                      style={{ background: "oklch(0.12 0.008 265 / 0.9)" }}
                      data-ocid="scan.camera_loading_state"
                    >
                      <div className="text-center">
                        <Loader2
                          className="w-8 h-8 animate-spin mx-auto mb-2"
                          style={{ color: "oklch(0.58 0.2 250)" }}
                        />
                        <p
                          className="text-sm"
                          style={{ color: "oklch(0.62 0.01 265)" }}
                        >
                          Starting camera…
                        </p>
                      </div>
                    </div>
                  )}

                  {camera.error && (
                    <div
                      className="absolute inset-0 flex items-center justify-center"
                      style={{ background: "oklch(0.12 0.008 265 / 0.95)" }}
                      data-ocid="scan.camera_error_state"
                    >
                      <div className="text-center px-6">
                        <Camera
                          className="w-10 h-10 mx-auto mb-3 opacity-40"
                          style={{ color: "oklch(0.62 0.01 265)" }}
                        />
                        <p
                          className="text-sm mb-3"
                          style={{ color: "oklch(0.62 0.01 265)" }}
                        >
                          {camera.error.message}
                        </p>
                        <button
                          type="button"
                          onClick={camera.retry}
                          className="text-xs px-3 py-1.5 rounded-md border transition-colors flex items-center gap-1 mx-auto"
                          style={{
                            borderColor: "oklch(0.32 0.012 265)",
                            color: "oklch(0.62 0.01 265)",
                          }}
                        >
                          <RefreshCw className="w-3 h-3" /> Retry
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleCapture}
                    // Change 3: also disable when actor is not ready
                    disabled={
                      !camera.isActive ||
                      camera.isLoading ||
                      actorLoading ||
                      !actor
                    }
                    className="flex-1 py-3 text-sm font-semibold rounded-md flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
                    style={{
                      background: "oklch(0.58 0.2 250)",
                      color: "white",
                    }}
                    data-ocid="scan.capture_button"
                  >
                    <Camera className="w-4 h-4" />
                    Capture &amp; Analyze
                  </button>
                  <button
                    type="button"
                    onClick={handleSkipCamera}
                    className="px-4 py-3 text-sm font-medium rounded-md border transition-colors"
                    style={{
                      borderColor: "oklch(0.28 0.012 265)",
                      color: "oklch(0.62 0.01 265)",
                    }}
                    data-ocid="scan.skip_camera_button"
                  >
                    <Search className="w-4 h-4" />
                  </button>
                </div>
                <p
                  className="text-center text-xs"
                  style={{ color: "oklch(0.38 0.01 265)" }}
                >
                  Or{" "}
                  <button
                    type="button"
                    onClick={handleSkipCamera}
                    className="underline"
                    style={{ color: "oklch(0.62 0.18 250)" }}
                  >
                    search manually
                  </button>{" "}
                  without using the camera
                </p>
              </motion.div>
            )}

            {/* Step 2: Search */}
            {step === "search" && (
              <motion.div
                key="search"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-5 space-y-4"
              >
                <div className="flex items-start gap-3">
                  {capturedImage && (
                    <div
                      className="flex-shrink-0 rounded-md overflow-hidden"
                      style={{
                        width: 56,
                        height: 72,
                        border: "1px solid oklch(0.28 0.012 265)",
                        background: "oklch(0.12 0.008 265)",
                      }}
                    >
                      <img
                        src={capturedImage}
                        alt="Captured card"
                        className="w-full h-full object-cover"
                        style={{ display: "block" }}
                      />
                    </div>
                  )}
                  <div className="flex-1">
                    <h2 className="text-lg font-bold text-foreground mb-1">
                      Find Your Card
                    </h2>
                    <p
                      className="text-sm"
                      style={{ color: "oklch(0.52 0.01 265)" }}
                    >
                      {capturedImage
                        ? "Analyzing your card with Google Vision…"
                        : "Type the Pokemon name to search the database."}
                    </p>
                  </div>
                </div>

                {/* OCR status banner */}
                {capturedImage && (
                  <div>
                    {isOcrRunning && (
                      <div
                        className="flex items-center gap-2 px-3 py-2.5 rounded-md text-sm"
                        style={{
                          background: "oklch(0.14 0.04 250 / 0.4)",
                          border: "1px solid oklch(0.38 0.15 250 / 0.4)",
                          color: "oklch(0.72 0.12 250)",
                        }}
                        data-ocid="scan.ocr_loading_state"
                      >
                        <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                        <span>
                          Sending image to Google Vision API for analysis…
                        </span>
                      </div>
                    )}
                    {!isOcrRunning &&
                      ocrDetected !== null &&
                      (ocrDetected.name || ocrDetected.number ? (
                        <div
                          className="flex items-center gap-2 px-3 py-2.5 rounded-md text-sm"
                          style={{
                            background: "oklch(0.18 0.08 145 / 0.25)",
                            border: "1px solid oklch(0.45 0.12 145 / 0.4)",
                            color: "oklch(0.72 0.12 145)",
                          }}
                          data-ocid="scan.ocr_success_state"
                        >
                          <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>
                            Vision detected:{" "}
                            {[ocrDetected.name, ocrDetected.number]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </div>
                      ) : (
                        <div
                          className="px-3 py-2.5 rounded-md text-sm"
                          style={{
                            background: "oklch(0.18 0.06 30 / 0.25)",
                            border: "1px solid oklch(0.45 0.1 30 / 0.4)",
                            color: "oklch(0.72 0.1 30)",
                          }}
                          data-ocid="scan.ocr_error_state"
                        >
                          Could not identify card — search manually below
                        </div>
                      ))}
                  </div>
                )}

                {/* Search input */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                      style={{ color: "oklch(0.42 0.01 265)" }}
                    />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleSearch(searchQuery)
                      }
                      placeholder="e.g. Charizard, Pikachu, Mewtwo…"
                      className="w-full pl-9 pr-3 py-2.5 text-sm rounded-md border outline-none"
                      style={{
                        background: "oklch(0.145 0.01 265)",
                        borderColor: "oklch(0.28 0.012 265)",
                        color: "oklch(0.92 0.005 265)",
                      }}
                      data-ocid="scan.search_input"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSearch(searchQuery)}
                    disabled={isSearching || !searchQuery.trim()}
                    className="px-4 py-2.5 text-sm font-semibold rounded-md flex items-center gap-2 transition-colors disabled:opacity-50"
                    style={{
                      background: "oklch(0.58 0.2 250)",
                      color: "white",
                    }}
                    data-ocid="scan.search_button"
                  >
                    {isSearching ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                    Search
                  </button>
                </div>

                {/* Results */}
                {isSearching && (
                  <div
                    className="grid grid-cols-3 sm:grid-cols-4 gap-2"
                    data-ocid="scan.search_loading_state"
                  >
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div
                        // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
                        key={i}
                        className="rounded-lg overflow-hidden"
                        style={{ background: "oklch(0.14 0.008 265)" }}
                      >
                        <div className="card-shimmer w-full aspect-[245/342]" />
                        <div className="p-2 space-y-1">
                          <div className="card-shimmer h-3 rounded w-3/4" />
                          <div className="card-shimmer h-3 rounded w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!isSearching && results.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-80 overflow-y-auto">
                    {results.map((card, idx) => (
                      <button
                        type="button"
                        key={card.id}
                        onClick={() => handleSelectResult(card)}
                        className="rounded-lg border overflow-hidden text-left transition-all hover:scale-105"
                        style={{
                          background: "oklch(0.145 0.008 265)",
                          borderColor: "oklch(0.28 0.012 265)",
                        }}
                        data-ocid={`scan.result.item.${idx + 1}`}
                      >
                        <img
                          src={card.images.small}
                          alt={card.name}
                          className="w-full aspect-[245/342] object-contain"
                          loading="lazy"
                        />
                        <div className="p-1.5">
                          <div
                            className="text-xs font-semibold truncate"
                            style={{ color: "oklch(0.92 0.005 265)" }}
                          >
                            {card.name}
                          </div>
                          <div
                            className="text-xs truncate"
                            style={{ color: "oklch(0.42 0.01 265)" }}
                          >
                            {card.set.name}
                          </div>
                          <div
                            className="text-xs font-bold mt-0.5"
                            style={{ color: "oklch(0.72 0.18 250)" }}
                          >
                            {getCardPrice(card)
                              ? `$${getCardPrice(card).toFixed(2)}`
                              : "N/A"}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {!isSearching &&
                  results.length === 0 &&
                  searchQuery &&
                  !isOcrRunning && (
                    <div
                      className="text-center py-8"
                      style={{ color: "oklch(0.42 0.01 265)" }}
                      data-ocid="scan.search_empty_state"
                    >
                      <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">
                        No cards found. Try a different name.
                      </p>
                    </div>
                  )}

                <button
                  type="button"
                  onClick={() => setStep("camera")}
                  className="text-xs"
                  style={{ color: "oklch(0.42 0.01 265)" }}
                  data-ocid="scan.back_to_camera_button"
                >
                  ← Back to camera
                </button>
              </motion.div>
            )}

            {/* Step 3: Confirm */}
            {step === "confirm" && selectedResult && (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-5 space-y-5"
              >
                <div>
                  <h2 className="text-lg font-bold text-foreground mb-1">
                    Confirm Card
                  </h2>
                  <p
                    className="text-sm"
                    style={{ color: "oklch(0.52 0.01 265)" }}
                  >
                    Set quantity and condition before adding to your collection.
                  </p>
                </div>

                <div className="flex gap-5">
                  <div
                    className="flex-shrink-0 rounded-lg overflow-hidden"
                    style={{
                      background: "oklch(0.145 0.008 265)",
                      width: 120,
                    }}
                  >
                    <img
                      src={
                        selectedResult.images.large ??
                        selectedResult.images.small
                      }
                      alt={selectedResult.name}
                      className="w-full aspect-[245/342] object-contain"
                    />
                  </div>

                  <div className="flex-1 space-y-4">
                    <div>
                      <div
                        className="text-xl font-bold"
                        style={{ color: "oklch(0.92 0.005 265)" }}
                      >
                        {selectedResult.name}
                      </div>
                      <div
                        className="text-sm"
                        style={{ color: "oklch(0.52 0.01 265)" }}
                      >
                        {selectedResult.set.name} · #{selectedResult.number}
                      </div>
                      <div
                        className="text-sm mt-1"
                        style={{ color: "oklch(0.62 0.01 265)" }}
                      >
                        Market:{" "}
                        <span style={{ color: "oklch(0.72 0.18 250)" }}>
                          {getCardPrice(selectedResult)
                            ? `$${getCardPrice(selectedResult).toFixed(2)}`
                            : "N/A"}
                        </span>
                      </div>
                    </div>

                    {/* Quantity */}
                    <div>
                      <span
                        className="text-xs uppercase tracking-wider block mb-2"
                        style={{ color: "oklch(0.42 0.01 265)" }}
                      >
                        Quantity
                      </span>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                          className="w-8 h-8 rounded border flex items-center justify-center"
                          style={{
                            borderColor: "oklch(0.28 0.012 265)",
                            color: "oklch(0.62 0.01 265)",
                          }}
                          data-ocid="scan.quantity_decrease_button"
                        >
                          −
                        </button>
                        <span className="text-lg font-bold w-8 text-center">
                          {quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => setQuantity((q) => q + 1)}
                          className="w-8 h-8 rounded border flex items-center justify-center"
                          style={{
                            borderColor: "oklch(0.28 0.012 265)",
                            color: "oklch(0.62 0.01 265)",
                          }}
                          data-ocid="scan.quantity_increase_button"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Condition */}
                    <div>
                      <span
                        className="text-xs uppercase tracking-wider block mb-2"
                        style={{ color: "oklch(0.42 0.01 265)" }}
                      >
                        Condition
                      </span>
                      <Select
                        value={condition}
                        onValueChange={(v) => setCondition(v as Condition)}
                      >
                        <SelectTrigger
                          className="w-full text-sm border"
                          style={{
                            background: "oklch(0.145 0.01 265)",
                            borderColor: "oklch(0.28 0.012 265)",
                            color: "oklch(0.82 0.01 265)",
                          }}
                          data-ocid="scan.condition_select"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent
                          style={{
                            background: "oklch(0.2 0.01 265)",
                            borderColor: "oklch(0.28 0.012 265)",
                          }}
                        >
                          {CONDITIONS.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Your Value */}
                    <div>
                      <span
                        className="text-xs uppercase tracking-wider block mb-2"
                        style={{ color: "oklch(0.42 0.01 265)" }}
                      >
                        Your Value
                      </span>
                      <div className="relative">
                        <span
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-sm"
                          style={{ color: "oklch(0.52 0.01 265)" }}
                        >
                          $
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={customValueInput}
                          onChange={(e) => setCustomValueInput(e.target.value)}
                          placeholder={
                            getCardPrice(selectedResult)
                              ? getCardPrice(selectedResult).toFixed(2)
                              : "0.00"
                          }
                          className="w-full pl-7 pr-3 py-2 text-sm rounded-md border outline-none"
                          style={{
                            background: "oklch(0.145 0.01 265)",
                            borderColor: "oklch(0.28 0.012 265)",
                            color: "oklch(0.92 0.005 265)",
                          }}
                          data-ocid="scan.custom_value_input"
                        />
                      </div>
                      <p
                        className="text-xs mt-1"
                        style={{ color: "oklch(0.42 0.01 265)" }}
                      >
                        Override the market price with your own estimate
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setStep("search");
                      setCustomValueInput("");
                      setSelectedResult(null);
                    }}
                    className="px-4 py-2.5 text-sm font-medium rounded-md border transition-colors"
                    style={{
                      borderColor: "oklch(0.28 0.012 265)",
                      color: "oklch(0.62 0.01 265)",
                    }}
                    data-ocid="scan.back_to_search_button"
                  >
                    ← Back
                  </button>
                  <button
                    type="button"
                    onClick={handleAddToCollection}
                    className="flex-1 py-2.5 text-sm font-semibold rounded-md flex items-center justify-center gap-2 transition-colors"
                    style={{
                      background: "oklch(0.58 0.2 250)",
                      color: "white",
                    }}
                    data-ocid="scan.add_to_collection_button"
                  >
                    <Plus className="w-4 h-4" />
                    Add to Collection
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
