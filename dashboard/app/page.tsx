"use client";

import { useEffect, useState, useCallback } from "react";
import type { QueueItem, ItemStatus } from "@/types/queue";
import QueueCard from "@/components/QueueCard";
import ItemDetail from "@/components/ItemDetail";
import Header from "@/components/Header";
import Toast from "@/components/Toast";

interface Counts {
  pending: number;
  approved: number;
  rejected: number;
}

interface ToastMsg {
  id: number;
  msg: string;
  type: "success" | "error";
}

export default function HomePage() {
  const [items, setItems]         = useState<QueueItem[]>([]);
  const [counts, setCounts]       = useState<Counts>({ pending: 0, approved: 0, rejected: 0 });
  const [filter, setFilter]       = useState<ItemStatus | "all">("all");
  const [selected, setSelected]   = useState<QueueItem | null>(null);
  const [loading, setLoading]     = useState(true);
  const [acting, setActing]       = useState<string | null>(null);
  const [toasts, setToasts]       = useState<ToastMsg[]>([]);

  const addToast = useCallback((msg: string, type: "success" | "error") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  const fetchItems = useCallback(async () => {
    try {
      const res  = await fetch("/api/items");
      const data = await res.json();
      setItems(data.items  ?? []);
      setCounts(data.counts ?? { pending: 0, approved: 0, rejected: 0 });
    } catch {
      addToast("Failed to load queue items", "error");
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleReview = useCallback(
    async (item: QueueItem, action: "approve" | "reject") => {
      setActing(item.id);
      try {
        const res = await fetch(`/api/items/${item.id}/review`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ action }),
        });
        const data = await res.json();
        if (data.ok) {
          addToast(
            action === "approve"
              ? `✓ Approved: ${item.gallery_metadata.gallery_title}`
              : `✗ Rejected: ${item.gallery_metadata.gallery_title}`,
            action === "approve" ? "success" : "error"
          );
          if (selected?.id === item.id) setSelected(null);
          await fetchItems();
        } else {
          addToast(`Error: ${data.error}`, "error");
        }
      } catch {
        addToast("Network error", "error");
      } finally {
        setActing(null);
      }
    },
    [addToast, fetchItems, selected]
  );

  const filtered = items.filter(
    (i) => filter === "all" || i.status === filter
  );

  return (
    <div style={{ minHeight: "100vh" }}>
      <Header counts={counts} filter={filter} onFilterChange={setFilter} />

      <main className="container" style={{ paddingTop: 24, paddingBottom: 48 }}>
        {loading ? (
          <div className="empty-state">
            <div className="spinner" />
            <p>Loading queue…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state animate-in">
            <div className="icon">📭</div>
            <h3 style={{ color: "var(--text-secondary)" }}>
              {filter === "pending"
                ? "No items pending review"
                : filter === "approved"
                ? "No approved items yet"
                : filter === "rejected"
                ? "No rejected items"
                : "Queue is empty"}
            </h3>
            <p style={{ fontSize: "0.8rem", maxWidth: 320 }}>
              <a href="/generate" style={{ color: "var(--cyan)", textDecoration: "none", fontWeight: 600 }}>
                Generate diagrams in the Generate page →
              </a>
            </p>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: selected
                ? "1fr"
                : "repeat(auto-fill, minmax(420px, 1fr))",
              gap: 20,
            }}
          >
            {selected ? (
              <ItemDetail
                item={selected}
                acting={acting}
                onReview={handleReview}
                onClose={() => setSelected(null)}
              />
            ) : (
              filtered.map((item) => (
                <QueueCard
                  key={item.id}
                  item={item}
                  acting={acting}
                  onSelect={() => setSelected(item)}
                  onReview={handleReview}
                />
              ))
            )}
          </div>
        )}
      </main>

      {/* Toast notifications */}
      <div className="toast-container">
        {toasts.map((t) => (
          <Toast key={t.id} msg={t.msg} type={t.type} />
        ))}
      </div>
    </div>
  );
}
