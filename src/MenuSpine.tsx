import "./menu-spine.css";

/** A post-open decoration, independent of the flip's geometry and gestures. */
export function MenuSpine({ motion }: { motion: boolean }) {
  return (
    <div className="menu-spine" data-motion={motion} aria-hidden="true">
      <span className="menu-spine-title">Focusgold</span>
    </div>
  );
}
