import { CloseIcon } from "./icons";

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  className?: string;
}

// The native clear button is hidden for the design, so this one gives touch screens a way to clear.
export function SearchField({ label, value, onChange, onSubmit, className }: Props) {
  return (
    <div className={`xh-search${className ? ` ${className}` : ""}`}>
      <input
        type="search"
        aria-label={label}
        placeholder={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit?.();
          if (e.key !== "Escape") return;
          if (value) onChange("");
          else e.currentTarget.blur();
        }}
      />
      {value && (
        <button type="button" className="clear" aria-label="Clear search" onClick={() => onChange("")}>
          <CloseIcon />
        </button>
      )}
    </div>
  );
}
