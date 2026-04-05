import type { Principal } from "@icp-sdk/core/principal";
import { Eye, EyeOff, KeyRound, Loader2, Save, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { backendInterface } from "../backend";

interface AdminPageProps {
  actor: backendInterface | null;
}

function truncatePrincipal(principal: Principal): string {
  const str = principal.toString();
  if (str.length <= 20) return str;
  return `${str.slice(0, 10)}…${str.slice(-6)}`;
}

export default function AdminPage({ actor }: AdminPageProps) {
  const [apiKey, setApiKey] = useState("");
  const [newApiKey, setNewApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingKey, setIsLoadingKey] = useState(true);
  const [users, setUsers] = useState<Principal[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);

  useEffect(() => {
    if (!actor) return;

    // Load API key and users in parallel
    const loadKey = actor
      .getVisionApiKey()
      .then((key) => {
        setApiKey(key);
        setNewApiKey(key);
      })
      .catch((err) => {
        console.error("Failed to load API key:", err);
        toast.error("Failed to load API key");
      })
      .finally(() => setIsLoadingKey(false));

    const loadUsers = actor
      .getAllUsers()
      .then((u) => setUsers(u))
      .catch((err) => {
        console.error("Failed to load users:", err);
      })
      .finally(() => setIsLoadingUsers(false));

    void Promise.all([loadKey, loadUsers]);
  }, [actor]);

  const maskedKey =
    apiKey.length > 8
      ? `${apiKey.slice(0, 4)}${".".repeat(6)}${apiKey.slice(-2)}`
      : apiKey;

  const handleSaveKey = async () => {
    if (!actor || !newApiKey.trim()) return;
    setIsSaving(true);
    try {
      await actor.setVisionApiKey(newApiKey.trim());
      setApiKey(newApiKey.trim());
      toast.success("Vision API key saved successfully");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to save key: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1
          className="font-display font-extrabold text-3xl"
          style={{ color: "oklch(0.92 0.005 265)" }}
        >
          Admin Dashboard
        </h1>
        <p className="text-sm mt-1" style={{ color: "oklch(0.52 0.01 265)" }}>
          Manage app settings and users
        </p>
      </div>

      {/* Vision API Key section */}
      <div
        className="rounded-lg border p-5 space-y-4"
        style={{
          background: "oklch(0.18 0.008 265)",
          borderColor: "oklch(0.28 0.012 265)",
        }}
      >
        <div className="flex items-center gap-2 mb-1">
          <div
            className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
            style={{ background: "oklch(0.58 0.2 250 / 0.15)" }}
          >
            <KeyRound
              className="w-4 h-4"
              style={{ color: "oklch(0.72 0.18 250)" }}
            />
          </div>
          <div>
            <h2
              className="text-sm font-bold"
              style={{ color: "oklch(0.92 0.005 265)" }}
            >
              Google Cloud Vision API Key
            </h2>
            <p className="text-xs" style={{ color: "oklch(0.52 0.01 265)" }}>
              Used for automated card scanning and OCR
            </p>
          </div>
        </div>

        {isLoadingKey ? (
          <div
            className="flex items-center gap-2 text-sm"
            style={{ color: "oklch(0.62 0.01 265)" }}
            data-ocid="admin.api_key.loading_state"
          >
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading current key…
          </div>
        ) : (
          <div className="space-y-3">
            {/* Current key display */}
            <div>
              <span
                className="text-xs uppercase tracking-wider block mb-1.5"
                style={{ color: "oklch(0.42 0.01 265)" }}
              >
                Current Key
              </span>
              <div className="flex items-center gap-2">
                <code
                  className="flex-1 px-3 py-2 rounded-md text-sm font-mono border"
                  style={{
                    background: "oklch(0.145 0.01 265)",
                    borderColor: "oklch(0.28 0.012 265)",
                    color: "oklch(0.72 0.18 250)",
                  }}
                >
                  {showKey ? apiKey : maskedKey}
                </code>
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="p-2 rounded-md border transition-colors flex-shrink-0"
                  style={{
                    background: "oklch(0.155 0.01 265)",
                    borderColor: "oklch(0.28 0.012 265)",
                    color: "oklch(0.62 0.01 265)",
                  }}
                  title={showKey ? "Hide key" : "Reveal key"}
                  data-ocid="admin.api_key.toggle"
                >
                  {showKey ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Update key */}
            <div>
              <span
                className="text-xs uppercase tracking-wider block mb-1.5"
                style={{ color: "oklch(0.42 0.01 265)" }}
              >
                Update Key
              </span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  placeholder="Enter new Vision API key…"
                  className="flex-1 px-3 py-2 text-sm rounded-md border outline-none"
                  style={{
                    background: "oklch(0.145 0.01 265)",
                    borderColor: "oklch(0.28 0.012 265)",
                    color: "oklch(0.92 0.005 265)",
                  }}
                  data-ocid="admin.api_key.input"
                />
                <button
                  type="button"
                  onClick={handleSaveKey}
                  disabled={isSaving || !newApiKey.trim()}
                  className="px-4 py-2 text-sm font-semibold rounded-md flex items-center gap-2 transition-colors disabled:opacity-50"
                  style={{
                    background: "oklch(0.58 0.2 250)",
                    color: "white",
                  }}
                  data-ocid="admin.api_key.save_button"
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {isSaving ? "Saving…" : "Save Key"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Users section */}
      <div
        className="rounded-lg border"
        style={{
          background: "oklch(0.18 0.008 265)",
          borderColor: "oklch(0.28 0.012 265)",
        }}
      >
        <div
          className="flex items-center gap-2 px-5 py-4 border-b"
          style={{ borderColor: "oklch(0.28 0.012 265)" }}
        >
          <div
            className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
            style={{ background: "oklch(0.65 0.18 145 / 0.15)" }}
          >
            <Users
              className="w-4 h-4"
              style={{ color: "oklch(0.65 0.18 145)" }}
            />
          </div>
          <div>
            <h2
              className="text-sm font-bold"
              style={{ color: "oklch(0.92 0.005 265)" }}
            >
              Registered Users
            </h2>
            <p className="text-xs" style={{ color: "oklch(0.52 0.01 265)" }}>
              All principals that have authenticated with the app
            </p>
          </div>
          {!isLoadingUsers && (
            <span
              className="ml-auto text-xs font-semibold px-2 py-1 rounded"
              style={{
                background: "oklch(0.65 0.18 145 / 0.15)",
                color: "oklch(0.65 0.18 145)",
              }}
            >
              {users.length} users
            </span>
          )}
        </div>

        {isLoadingUsers ? (
          <div
            className="flex items-center justify-center gap-2 py-8 text-sm"
            style={{ color: "oklch(0.62 0.01 265)" }}
            data-ocid="admin.users.loading_state"
          >
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading users…
          </div>
        ) : users.length === 0 ? (
          <div
            className="py-10 text-center"
            style={{ color: "oklch(0.42 0.01 265)" }}
            data-ocid="admin.users.empty_state"
          >
            <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No registered users yet</p>
          </div>
        ) : (
          <div
            className="divide-y"
            style={{ borderColor: "oklch(0.28 0.012 265)" }}
          >
            {users.map((user, idx) => (
              <div
                key={user.toString()}
                className="flex items-center gap-3 px-5 py-3"
                data-ocid={`admin.users.item.${idx + 1}`}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{
                    background: "oklch(0.58 0.2 250 / 0.2)",
                    color: "oklch(0.72 0.18 250)",
                  }}
                >
                  {idx + 1}
                </div>
                <code
                  className="flex-1 text-xs font-mono truncate"
                  style={{ color: "oklch(0.72 0.01 265)" }}
                  title={user.toString()}
                >
                  {truncatePrincipal(user)}
                </code>
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded flex-shrink-0"
                  style={{
                    background:
                      idx === 0
                        ? "oklch(0.82 0.18 85 / 0.15)"
                        : "oklch(0.58 0.2 250 / 0.12)",
                    color:
                      idx === 0
                        ? "oklch(0.82 0.18 85)"
                        : "oklch(0.72 0.18 250)",
                  }}
                >
                  {idx === 0 ? "Admin" : "User"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
