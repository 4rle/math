import { useEffect, useRef, type ReactNode, type CSSProperties } from "react";
import { X, ArrowLeft } from "lucide-react";
export function Modal({
  children,
  title,
  onClose,
  className = "",
  style,
}: {
  children: ReactNode;
  title: string;
  onClose: () => void;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previous?.isConnected) previous.focus();
      else document.getElementById("menu-trigger")?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={className}
      aria-label={title}
      style={style}
      onCancel={(e) => {
        e.preventDefault();
        close.current();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            close.current();
        }
      }}
    >
      {children}
    </dialog>
  );
}
export function PanelTop({
  title,
  onBack,
  onClose,
}: {
  title: string;
  onBack?: () => void;
  onClose: () => void;
}) {
  return (
    <div className="panel-top">
      {onBack && (
        <button
          className="icon-button"
          aria-label="メニューに戻る"
          onClick={onBack}
        >
          <ArrowLeft size={20} />
        </button>
      )}
      <h1>{title}</h1>
      <button className="icon-button" aria-label="閉じる" onClick={onClose}>
        <X size={20} />
      </button>
    </div>
  );
}
export function ErrorMessage({ message }: { message: string }) {
  return message ? (
    <p className="error-message" role="alert">
      {message}
    </p>
  ) : null;
}
export function Hint({ children }: { children: ReactNode }) {
  return <p className="hint">{children}</p>;
}
