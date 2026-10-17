import type { SVGProps } from "react";

// 1.5px strokes with square caps and mitred joins, as in Podnook.
const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "square",
  strokeLinejoin: "miter",
  "aria-hidden": true,
} as const;

export const PlayIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg className="ic-play" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M4 2l10 6-10 6z" />
  </svg>
);

export const PauseIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M3 2h4v12H3zM9 2h4v12H9z" />
  </svg>
);

export const PrevIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M5 5h2v14H5zM19 5v14L8 12z" />
  </svg>
);

export const NextIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M17 5h2v14h-2zM5 5v14l11-7z" />
  </svg>
);

export const ShuffleIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" {...base} {...props}>
    <path d="M3 7h4l10 10h4M3 17h4l3-3M14 10l3-3h4M18 4l3 3-3 3M18 14l3 3-3 3" />
  </svg>
);

export const RepeatIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" {...base} {...props}>
    <path d="M4 11V7h15M16 4l3 3-3 3M20 13v4H5M8 20l-3-3 3-3" />
  </svg>
);

export const RepeatOneIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" {...base} {...props}>
    <path d="M4 11V7h15M16 4l3 3-3 3M20 13v4H5M8 20l-3-3 3-3M11.5 10.5l1-.5v4" />
  </svg>
);

export const MoreIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M2 7h2v2H2zM7 7h2v2H7zM12 7h2v2h-2z" />
  </svg>
);

export const SongsIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" {...base} {...props}>
    <path d="M6 12V3l7-1.5V10.5M6 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM13 10.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" />
  </svg>
);

export const AlbumIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" {...base} {...props}>
    <path d="M2 2h12v12H2zM10 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" />
  </svg>
);

export const ArtistIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" {...base} {...props}>
    <path d="M11 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM2.5 14.5c0-3 2.5-4.5 5.5-4.5s5.5 1.5 5.5 4.5" />
  </svg>
);

export const GripIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" {...base} {...props}>
    <path d="M3 5.5h10M3 10.5h10" />
  </svg>
);

export const HeartIcon = ({ filled, ...props }: SVGProps<SVGSVGElement> & { filled?: boolean }) => (
  <svg viewBox="0 0 16 16" {...base} fill={filled ? "currentColor" : "none"} {...props}>
    <path d="M8 13.5S1.75 9.75 1.75 5.75A3 3 0 0 1 8 4.5a3 3 0 0 1 6.25 1.25C14.25 9.75 8 13.5 8 13.5z" />
  </svg>
);

export const PlaylistIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" {...base} {...props}>
    <path d="M2 3h9M2 7h9M2 11h5M11 14V9l3-1" />
  </svg>
);

export const QueueIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" {...base} {...props}>
    <path d="M2 3h12M2 7h12M2 11h7M11 10l3 2-3 2z" />
  </svg>
);

export const AddMusicIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" {...base} {...props}>
    <path d="M8 2v8M4 6l4-4 4 4M2 10v4h12v-4" />
  </svg>
);

export const MenuIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 20 20" {...base} {...props}>
    <path d="M3 5h14M3 10h14M3 15h14" />
  </svg>
);

export const CloseIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 20 20" {...base} {...props}>
    <path d="M4 4l12 12M16 4L4 16" />
  </svg>
);

export const CheckIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 20 20" {...base} {...props}>
    <path d="M4 10.5l4 4 8-9" />
  </svg>
);

// The brand mark from brand/mark.svg, drawn in lamp and text so it matches the UI and public/favicon.svg.
export const BrandMark = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="-48 -48 96 96" aria-hidden="true" {...props}>
    <path
      className="brand-mark-left"
      fillRule="evenodd"
      transform="translate(-2 -3)"
      d="M0 -42 A42 42 0 0 0 0 42 ZM-12 -18 A2 2 0 0 1 -8 -18 L-8 18 A2 2 0 0 1 -12 18 ZM-24 -10 A2 2 0 0 1 -20 -10 L-20 10 A2 2 0 0 1 -24 10 ZM-35 -12 A2 2 0 0 1 -31 -12 L-31 12 A2 2 0 0 1 -35 12 Z"
    />
    <path
      className="brand-mark-right"
      fillRule="evenodd"
      transform="translate(2 3)"
      d="M0 -42 A42 42 0 0 1 0 42 ZM8 -18 A2 2 0 0 1 12 -18 L12 18 A2 2 0 0 1 8 18 ZM20 -10 A2 2 0 0 1 24 -10 L24 10 A2 2 0 0 1 20 10 ZM31 -12 A2 2 0 0 1 35 -12 L35 12 A2 2 0 0 1 31 12 Z"
    />
  </svg>
);

export const PlusIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg className="ic-plus" viewBox="0 0 16 16" {...base} {...props}>
    <path d="M8 3v10M3 8h10" />
  </svg>
);

export const TrashIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg className="ic-trash" viewBox="0 0 16 16" {...base} {...props}>
    <path className="lid" d="M2.5 4.5h11M6 4.5V2.5h4v2" />
    <path d="M4 4.5l.5 9h7l.5-9M7 7v4M9 7v4" />
  </svg>
);

export const RefreshIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg className="ic-refresh" viewBox="0 0 16 16" {...base} {...props}>
    <path d="M13.5 8A5.5 5.5 0 1 1 11.9 4.1M13.5 2v3h-3" />
  </svg>
);

export const PencilIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg className="ic-pencil" viewBox="0 0 16 16" {...base} {...props}>
    <path d="M3 13l.5-3L10.5 3 13 5.5 6 12.5zM9 4.5L11.5 7" />
  </svg>
);

export const UploadIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg className="ic-upload" viewBox="0 0 16 16" {...base} {...props}>
    <path className="arrow" d="M8 11V2.5M4.5 6L8 2.5 11.5 6" />
    <path d="M3 13.5h10" />
  </svg>
);

export const DownloadIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" {...base} {...props}>
    <path d="M8 2.5V11M4.5 7.5L8 11l3.5-3.5M3 13.5h10" />
  </svg>
);

export const FolderIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" {...base} {...props}>
    <path d="M1.5 3h5l1.5 2h6.5v8h-13z" />
  </svg>
);

export const ChevronDownIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg className="ic-chevron" viewBox="0 0 16 16" {...base} {...props}>
    <path d="M3.5 6l4.5 4.5L12.5 6" />
  </svg>
);

export const ArrowLeftIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg className="ic-back" viewBox="0 0 16 16" {...base} {...props}>
    <path d="M13 8H3M7 4L3 8l4 4" />
  </svg>
);

export const UndoIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg className="ic-undo" viewBox="0 0 16 16" {...base} {...props}>
    <path d="M3 6h6.5a3.5 3.5 0 0 1 0 7H6M5.5 3L3 6l2.5 3" />
  </svg>
);
