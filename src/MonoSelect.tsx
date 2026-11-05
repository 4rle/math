import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Check, ChevronDown } from "lucide-react";

/** Custom monochrome listbox with native keyboard conventions. */
export function MonoSelect({
  value,
  onValueChange,
  children,
  "aria-label": label,
  disabled,
}: {
  value: string | number;
  onValueChange: (value: string) => void;
  children: ReactNode;
  "aria-label": string;
  disabled?: boolean;
}) {
  const options = Children.toArray(children).flatMap((child) => {
    if (
      !isValidElement<{ value?: string | number; children: ReactNode }>(child)
    )
      return [];
    return [
      {
        value: String(child.props.value ?? child.props.children),
        label: child.props.children,
      },
    ];
  });
  const selected = Math.max(
    0,
    options.findIndex((o) => o.value === String(value)),
  );
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(selected);
  const root = useRef<HTMLDivElement>(null),
    button = useRef<HTMLButtonElement>(null);
  const id = useId();
  const pick = (index: number) => {
    if (options[index]) onValueChange(options[index].value);
    root.current?.dispatchEvent(new Event("input", { bubbles: true }));
    setOpen(false);
    button.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  useEffect(() => {
    if (open)
      document
        .getElementById(`${id}-${active}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [active, open, id]);
  return (
    <div className="mono-select" ref={root}>
      <button
        ref={button}
        type="button"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        aria-haspopup="listbox"
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        disabled={disabled}
        onClick={() => {
          setActive(selected);
          setOpen(!open);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
            return;
          }
          if (e.key === "Tab") {
            setOpen(false);
            return;
          }
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
            e.preventDefault();
            setOpen(true);
            setActive(
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? options.length - 1
                  : Math.max(
                      0,
                      Math.min(
                        options.length - 1,
                        (open ? active : selected) +
                          (e.key === "ArrowDown" ? 1 : -1),
                      ),
                    ),
            );
          } else if ((e.key === "Enter" || e.key === " ") && open) {
            e.preventDefault();
            pick(active);
          } else if (e.key.length === 1 && e.key !== " ") {
            const index = options.findIndex((o) =>
              String(o.label).toLowerCase().startsWith(e.key.toLowerCase()),
            );
            if (index >= 0) {
              e.preventDefault();
              setActive(index);
              setOpen(true);
            }
          }
        }}
      >
        <span>{options[selected]?.label}</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div id={id} className="mono-options" role="listbox" aria-label={label}>
          {options.map((o, i) => (
            <div
              key={o.value}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === selected}
              data-active={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                pick(i);
              }}
            >
              {o.label}
              {i === selected && <Check size={16} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
