import { Toaster } from "@/components/ui/sonner";
import {
  BarChart2,
  Camera,
  ChevronDown,
  HelpCircle,
  LayoutDashboard,
  Library,
  Loader2,
  LogIn,
  Search,
  Settings,
  Shield,
  Users,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { useActor } from "./hooks/useActor";
import { useCollection } from "./hooks/useCollection";
import { useInternetIdentity } from "./hooks/useInternetIdentity";
import AdminPage from "./pages/AdminPage";
import Collection from "./pages/Collection";
import Dashboard from "./pages/Dashboard";
import ScanCard from "./pages/ScanCard";

type Page = "dashboard" | "collection" | "admin";

const NAV_LINKS: {
  id: Page | "scan" | "market" | "community" | "faq" | "settings";
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "collection", label: "Collection", icon: Library },
  { id: "market", label: "Market", icon: BarChart2 },
  { id: "community", label: "Community", icon: Users },
  { id: "faq", label: "FAQ", icon: HelpCircle },
  { id: "settings", label: "Settings", icon: Settings },
];

function formatPrice(price: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(price);
}

// ─── Auth Wall ──────────────────────────────────────────────────────────────
function LoginScreen() {
  const { login, isLoggingIn } = useInternetIdentity();

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: "oklch(0.115 0.01 265)" }}
      data-ocid="login.page"
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col items-center text-center max-w-sm w-full"
      >
        {/* Logo */}
        <div className="mb-6 flex flex-col items-center gap-3">
          <motion.img
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            src="/assets/generated/pikachu-icon-transparent.dim_128x128.png"
            alt="⚡"
            className="w-20 h-20 object-contain drop-shadow-lg"
          />
          <span
            className="font-display font-bold text-3xl tracking-widest uppercase"
            style={{ color: "oklch(0.82 0.18 85)" }}
          >
            PokeCollector
          </span>
        </div>

        {/* Tagline */}
        <p
          className="text-sm mb-8 leading-relaxed"
          style={{ color: "oklch(0.55 0.01 265)" }}
        >
          Scan, track, and manage your Pokémon TCG collection.
          <br />
          Know your cards' value in real time.
        </p>

        {/* Login button */}
        <button
          type="button"
          onClick={login}
          disabled={isLoggingIn}
          className="w-full py-3 px-6 text-sm font-bold rounded-lg flex items-center justify-center gap-2.5 transition-all disabled:opacity-60"
          style={{
            background: "oklch(0.58 0.2 250)",
            color: "white",
            boxShadow: "0 0 24px oklch(0.58 0.2 250 / 0.35)",
          }}
          data-ocid="login.primary_button"
        >
          {isLoggingIn ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <LogIn className="w-4 h-4" />
          )}
          {isLoggingIn ? "Connecting…" : "Login with Internet Identity"}
        </button>

        <p className="text-xs mt-5" style={{ color: "oklch(0.38 0.01 265)" }}>
          Secured by the Internet Computer · No passwords required
        </p>
      </motion.div>

      {/* Footer */}
      <div
        className="absolute bottom-5 text-xs"
        style={{ color: "oklch(0.30 0.01 265)" }}
      >
        © {new Date().getFullYear()}.{" "}
        <a
          href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(typeof window !== "undefined" ? window.location.hostname : "")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors"
        >
          Built with ❤️ using caffeine.ai
        </a>
      </div>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const { identity, clear } = useInternetIdentity();
  const { actor, isFetching: actorFetching } = useActor();
  const [activePage, setActivePage] = useState<Page>("dashboard");
  const [scanOpen, setScanOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");

  const collection = useCollection();

  // 3-tap counter for hidden admin dashboard access.
  // All refs are declared unconditionally before any early return.
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep a ref to the latest actor so the handler closure is always fresh.
  const actorRef = useRef(actor);
  actorRef.current = actor;
  const setActivePageRef = useRef(setActivePage);
  setActivePageRef.current = setActivePage;

  // Auth wall: show login screen if not authenticated
  if (!identity) {
    return (
      <>
        <LoginScreen />
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "oklch(0.22 0.01 265)",
              border: "1px solid oklch(0.32 0.012 265)",
              color: "oklch(0.92 0.005 265)",
            },
          }}
        />
      </>
    );
  }

  const handleNavigate = (page: string) => {
    if (page === "scan") {
      setScanOpen(true);
    } else if (
      page === "dashboard" ||
      page === "collection" ||
      page === "admin"
    ) {
      setActivePage(page as Page);
    }
  };

  // Tap 3 times within 1.5 s to open the admin dashboard.
  const handleLogoClick = async () => {
    const currentActor = actorRef.current;
    if (!currentActor) return;

    tapCountRef.current += 1;

    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => {
      tapCountRef.current = 0;
    }, 1500);

    if (tapCountRef.current < 3) return;

    // Third tap reached — reset and check admin status
    tapCountRef.current = 0;
    if (tapTimerRef.current) {
      clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
    }

    try {
      const isAdmin = await currentActor.isCallerAdmin();
      setActivePageRef.current(isAdmin ? "admin" : "dashboard");
    } catch {
      setActivePageRef.current("dashboard");
    }
  };

  // Derive user display info
  const principalStr = identity.getPrincipal().toString();
  const principalShort = principalStr.slice(-4).toUpperCase();

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "oklch(0.115 0.01 265)" }}
    >
      {/* Navigation */}
      <header
        className="sticky top-0 z-40 border-b"
        style={{
          background: "oklch(0.155 0.01 265 / 0.95)",
          borderColor: "oklch(0.28 0.012 265)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
          <div className="flex items-center gap-4 h-14">
            {/* Brand / Logo — tap 3 times quickly to access admin */}
            <button
              type="button"
              className="flex items-center gap-2 flex-shrink-0 cursor-pointer bg-transparent border-0 p-0"
              onClick={handleLogoClick}
              title={actorFetching ? "Loading…" : "PokeCollector"}
              data-ocid="nav.brand_link"
            >
              <img
                src="/assets/generated/pikachu-icon-transparent.dim_128x128.png"
                alt="⚡"
                className="w-7 h-7 object-contain"
              />
              <span
                className="font-display font-bold text-sm tracking-widest uppercase"
                style={{ color: "oklch(0.82 0.18 85)" }}
              >
                PokeCollector
              </span>
            </button>

            {/* Nav links — hidden on mobile */}
            <nav className="hidden md:flex items-center gap-1 ml-2">
              {NAV_LINKS.map((link) => {
                const isActive =
                  link.id === activePage ||
                  (link.id === "dashboard" && activePage === "dashboard");
                const isClickable =
                  link.id === "dashboard" || link.id === "collection";
                return (
                  <button
                    key={link.id}
                    type="button"
                    onClick={() =>
                      isClickable ? setActivePage(link.id as Page) : undefined
                    }
                    className="px-3 py-4 text-xs font-medium transition-colors relative"
                    style={{
                      color: isActive
                        ? "oklch(0.92 0.005 265)"
                        : "oklch(0.52 0.01 265)",
                      cursor: isClickable ? "pointer" : "default",
                    }}
                    data-ocid={`nav.${link.id}_link`}
                  >
                    {link.label}
                    {isActive && (
                      <span
                        className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full"
                        style={{ background: "oklch(0.58 0.2 250)" }}
                      />
                    )}
                  </button>
                );
              })}
              {/* Admin tab — shown when on admin page */}
              {activePage === "admin" && (
                <button
                  type="button"
                  className="px-3 py-4 text-xs font-medium transition-colors relative flex items-center gap-1"
                  style={{ color: "oklch(0.82 0.18 85)" }}
                  data-ocid="nav.admin_link"
                >
                  <Shield className="w-3 h-3" />
                  Admin
                  <span
                    className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full"
                    style={{ background: "oklch(0.82 0.18 85)" }}
                  />
                </button>
              )}
            </nav>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Search */}
            <div className="relative hidden sm:block">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
                style={{ color: "oklch(0.38 0.01 265)" }}
              />
              <input
                type="text"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Search cards, sets…"
                className="pl-8 pr-3 py-1.5 text-xs rounded-md border outline-none w-44 lg:w-56"
                style={{
                  background: "oklch(0.145 0.01 265)",
                  borderColor: "oklch(0.28 0.012 265)",
                  color: "oklch(0.82 0.005 265)",
                }}
                data-ocid="nav.search_input"
              />
            </div>

            {/* Scan CTA */}
            <button
              type="button"
              onClick={() => setScanOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-colors flex-shrink-0"
              style={{
                background: "oklch(0.58 0.2 250)",
                color: "white",
              }}
              data-ocid="nav.scan_button"
            >
              <Camera className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">SCAN CARD</span>
            </button>

            {/* User avatar + logout */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                style={{
                  background: "oklch(0.58 0.2 250 / 0.25)",
                  color: "oklch(0.72 0.18 250)",
                }}
                title={principalStr}
              >
                {principalShort}
              </div>
              <button
                type="button"
                onClick={clear}
                className="hidden lg:flex items-center gap-1 text-xs font-medium transition-colors"
                style={{ color: "oklch(0.52 0.01 265)" }}
                title="Logout"
                data-ocid="nav.logout_button"
              >
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Sub-header: Collection summary bar (only on collection page) */}
      {activePage === "collection" && (
        <div
          className="border-b"
          style={{
            background: "oklch(0.155 0.01 265)",
            borderColor: "oklch(0.28 0.012 265)",
          }}
        >
          <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1
                className="font-display font-bold text-xl"
                style={{ color: "oklch(0.92 0.005 265)" }}
              >
                My Pokemon Card Collection
                <span
                  className="font-normal text-sm ml-2"
                  style={{ color: "oklch(0.52 0.01 265)" }}
                >
                  ({collection.totalCards} Cards)
                </span>
              </h1>
              <div
                className="text-xs mt-0.5 flex items-center gap-2"
                style={{ color: "oklch(0.52 0.01 265)" }}
              >
                <span>Collection Summary</span>
                <span>·</span>
                <span
                  className="font-semibold"
                  style={{ color: "oklch(0.92 0.005 265)" }}
                >
                  Total Value:{" "}
                  <span style={{ color: "oklch(0.72 0.18 250)" }}>
                    {formatPrice(collection.totalValue)}
                  </span>
                </span>
                <span
                  className="text-xs font-semibold"
                  style={{ color: "oklch(0.65 0.18 145)" }}
                >
                  (+5.1%)
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="text-xs px-3 py-1.5 rounded-md border transition-colors"
                style={{
                  borderColor: "oklch(0.28 0.012 265)",
                  color: "oklch(0.62 0.01 265)",
                }}
              >
                Recently Added
              </button>
              <button
                type="button"
                className="text-xs px-3 py-1.5 rounded-md border transition-colors"
                style={{
                  borderColor: "oklch(0.28 0.012 265)",
                  color: "oklch(0.62 0.01 265)",
                }}
              >
                Top Gains
              </button>
              <button
                type="button"
                onClick={() => setScanOpen(true)}
                className="text-xs px-3 py-1.5 rounded-md font-semibold transition-colors flex items-center gap-1"
                style={{
                  background: "oklch(0.58 0.2 250 / 0.15)",
                  color: "oklch(0.72 0.18 250)",
                  border: "1px solid oklch(0.58 0.2 250 / 0.3)",
                }}
                data-ocid="collection.scan_button"
              >
                <Camera className="w-3 h-3" /> Scan Card
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 max-w-[1200px] mx-auto w-full px-4 sm:px-6 py-6">
        {/* Dashboard page title */}
        {activePage === "dashboard" && (
          <div className="mb-6">
            <h1
              className="font-display font-extrabold text-3xl"
              style={{ color: "oklch(0.92 0.005 265)" }}
            >
              My Pokemon Collection
            </h1>
            <p
              className="text-sm mt-1"
              style={{ color: "oklch(0.52 0.01 265)" }}
            >
              Track, manage and grow your Pokémon TCG collection
            </p>
          </div>
        )}

        <AnimatePresence mode="wait">
          {activePage === "dashboard" && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Dashboard
                cards={collection.cards}
                totalValue={collection.totalValue}
                totalCards={collection.totalCards}
                mostValuable={collection.mostValuable}
                recentlyAdded={collection.recentlyAdded}
                onNavigate={handleNavigate}
              />
            </motion.div>
          )}

          {activePage === "collection" && (
            <motion.div
              key="collection"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Collection
                cards={collection.cards}
                uniqueSets={collection.uniqueSets}
                uniqueRarities={collection.uniqueRarities}
                uniqueTypes={collection.uniqueTypes}
                onUpdateCard={collection.updateCard}
                onRemoveCard={collection.removeCard}
                onScanCard={() => setScanOpen(true)}
              />
            </motion.div>
          )}

          {activePage === "admin" && (
            <motion.div
              key="admin"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <AdminPage actor={actor} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer
        className="border-t mt-auto"
        style={{
          background: "oklch(0.155 0.01 265)",
          borderColor: "oklch(0.28 0.012 265)",
        }}
      >
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div
            className="flex items-center gap-1.5 font-semibold"
            style={{ color: "oklch(0.82 0.18 85)" }}
          >
            <Zap className="w-3.5 h-3.5" />
            PokeCollector
          </div>
          <div
            className="flex items-center gap-4"
            style={{ color: "oklch(0.38 0.01 265)" }}
          >
            <span className="cursor-default">About</span>
            <span className="cursor-default">Terms</span>
            <span className="cursor-default">Privacy</span>
            <span className="cursor-default">Support</span>
            <span className="cursor-default">API</span>
          </div>
          <div style={{ color: "oklch(0.32 0.01 265)" }}>
            © {new Date().getFullYear()}.{" "}
            <a
              href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(typeof window !== "undefined" ? window.location.hostname : "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              Built with ❤️ using caffeine.ai
            </a>
          </div>
        </div>
      </footer>

      {/* Scan Card Modal */}
      <AnimatePresence>
        {scanOpen && (
          <ScanCard
            onClose={() => setScanOpen(false)}
            onAddCard={(card) => {
              collection.addCard(card);
            }}
          />
        )}
      </AnimatePresence>

      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "oklch(0.22 0.01 265)",
            border: "1px solid oklch(0.32 0.012 265)",
            color: "oklch(0.92 0.005 265)",
          },
        }}
      />
    </div>
  );
}
