import {
  Fragment,
  useId,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { initials } from "../lib/format";
import { useArtUrl } from "../lib/useArtUrl";

type Variant = "primary" | "secondary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  small?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = "primary", small, icon, className, children, ...props }: ButtonProps) {
  const iconOnly = icon && !children;
  const classes = ["xh-btn", `xh-btn--${variant}`, small && "xh-btn--sm", iconOnly && "xh-btn--icon", className];
  return (
    <button type="button" {...props} className={classes.filter(Boolean).join(" ")}>
      {icon}
      {children}
    </button>
  );
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | null;
  mono?: boolean;
  suffix?: ReactNode;
}

export function TextField({ label, error, mono, suffix, id, ...props }: TextFieldProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const errorId = `${inputId}-error`;
  return (
    <div className="xh-field">
      <label htmlFor={inputId}>{label}</label>
      <div className={`xh-input-row${mono ? " mono" : ""}${error ? " is-error" : ""}`}>
        <input
          id={inputId}
          className="xh-input"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          {...props}
        />
        {suffix}
      </div>
      {error && (
        <div className="xh-help err" id={errorId} role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

interface ArtProps {
  title: string;
  imageUrl: string | null;
  size?: number | "fluid";
}

// Placeholder tiles shift between a few tones of the surface so neighbours differ.
function tone(title: string): number {
  let h = 0;
  for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) % 4;
  return h;
}

// Artwork is always a plain square. Without an image it falls back to initials on a flat tile.
export function Art({ title, imageUrl, size }: ArtProps) {
  const [failed, setFailed] = useState<string | null>(null);
  const style: CSSProperties | undefined =
    size === undefined
      ? undefined
      : size === "fluid"
        ? ({ "--s": "100%" } as CSSProperties)
        : ({ "--s": `${size}px`, fontSize: Math.round(size * 0.3) } as CSSProperties);

  return (
    <div className="xh-art" style={style} data-tone={tone(title)} aria-hidden="true">
      {imageUrl && failed !== imageUrl ? (
        <img src={imageUrl} alt="" width={256} height={256} loading="lazy" decoding="async" onError={() => setFailed(imageUrl)} />
      ) : (
        <span>{initials(title)}</span>
      )}
    </div>
  );
}

// A setting with a few fixed positions, set like a radio's AM/FM switch. Radios underneath, so arrow keys move it.
export function BandSwitch<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <div className="band" role="radiogroup" aria-labelledby={`${id}-label`}>
      <span id={`${id}-label`} className="band-label">
        {label}
      </span>
      <div className="band-track" style={{ "--at": options.findIndex((o) => o.value === value) } as CSSProperties}>
        {options.map((o) => (
          <Fragment key={o.value}>
            <input type="radio" name={id} id={`${id}-${o.value}`} checked={o.value === value} onChange={() => onChange(o.value)} />
            <label htmlFor={`${id}-${o.value}`}>{o.label}</label>
          </Fragment>
        ))}
        <span className="band-thumb" aria-hidden="true" />
      </div>
    </div>
  );
}

export function Panel({ children }: { children: ReactNode }) {
  return <div className="xh-panel">{children}</div>;
}

export function CoverArt({ artId, title, size }: { artId: string | null; title: string; size?: number | "fluid" }) {
  return <Art title={title} imageUrl={useArtUrl(artId)} size={size} />;
}
