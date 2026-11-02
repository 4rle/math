import { useEffect, useRef, type ReactNode } from "react";
/** One observer per field. Animate a card once; keep keyboard targets and drag transforms intact. */
export function CardReveal({
  children,
  enabled,
  book,
}: {
  children: ReactNode;
  enabled: boolean;
  book: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const grid = ref.current!;
    if (!enabled || !("IntersectionObserver" in window)) return;
    const field = grid.closest(".card-field");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const card = entry.target as HTMLElement;
          card.dataset.reveal = "shown";
          observer.unobserve(card);
        }
      },
      { root: field, threshold: 0.08 },
    );
    const prepare = (card: HTMLElement) => {
      if (card.dataset.reveal) return;
      const r = card.getBoundingClientRect(),
        f = field?.getBoundingClientRect();
      if (r.bottom > (f?.top || 0) && r.top < (f?.bottom || innerHeight)) {
        card.dataset.reveal = "shown";
        return;
      }
      card.dataset.reveal = "waiting";
      observer.observe(card);
    };
    const scan = () =>
      grid.querySelectorAll<HTMLElement>(".problem-card").forEach(prepare);
    scan();
    const mutations = new MutationObserver(scan);
    mutations.observe(grid, { childList: true });
    return () => {
      observer.disconnect();
      mutations.disconnect();
      grid.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
        delete el.dataset.reveal;
      });
    };
  }, [enabled, book]);
  return (
    <div ref={ref} className="card-grid">
      {children}
    </div>
  );
}
