import "./menu-spine.css";
import type { Book } from "./model";

const SUBJECTS: Record<Book, string> = {
  "1A": "数学Ⅰ+A",
  "2B": "数学Ⅱ+B+C",
  "3C": "数学Ⅲ+C",
};

/** A post-open decoration, independent of the flip's geometry and gestures. */
export function MenuSpine({ motion, book }: { motion: boolean; book: Book }) {
  return (
    <div className="menu-spine" data-motion={motion} aria-hidden="true">
      <div className="menu-spine-print">
        <span className="menu-spine-brand">
          <span className="menu-spine-brand-text">Focus Gold</span>
        </span>
        <span className="menu-spine-subject">{SUBJECTS[book]}</span>
      </div>
    </div>
  );
}
