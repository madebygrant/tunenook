import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { plural } from "../lib/format";
import { editTracks, trackAlbumKey, useAlbums, type TagEdit } from "../lib/library";
import type { Album, Track } from "../lib/types";
import { Button, TextField } from "./ui";

// null for an empty field, undefined for one that isn't a whole number in range.
function parseNumber(text: string, max: number): number | null | undefined {
  const value = text.trim();
  if (!value) return null;
  if (!/^\d+$/.test(value)) return undefined;
  const n = Number(value);
  return n >= 1 && n <= max ? n : undefined;
}

const numberText = (n: number | null) => (n === null ? "" : String(n));

// A typo in album or album artist splits an album, so say where the songs will land before saving.
function useAlbumPreview(albumArtist: string, album: string, from: string, count: number): string | null {
  const albums = useAlbums();
  const key = trackAlbumKey({ albumArtist, artist: albumArtist, album });
  if (key === from || !albumArtist) return null;
  const target = albums.find((a) => a.key === key);
  const what = count === 1 ? "This song" : "These songs";
  if (!album) return `${what} won't be on an album.`;
  if (target) return `${what} will join ${target.title} by ${target.artist}, which has ${plural(target.tracks.length, "song")}.`;
  return `${what} will start a new album, ${album} by ${albumArtist}.`;
}

// The preview describes Save rather than being a live region, so it isn't read out on every keystroke.
function DetailsForm({
  preview,
  onSubmit,
  onCancel,
  saving,
  children,
}: {
  preview: string | null;
  onSubmit: () => void;
  onCancel: () => void;
  saving: boolean;
  children: ReactNode;
}) {
  const previewId = useId();
  return (
    <form
      className="details-form"
      noValidate
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {children}
      {preview && (
        <p className="details-preview" id={previewId}>
          {preview}
        </p>
      )}
      <div className="dialog-actions">
        <Button type="submit" disabled={saving} aria-describedby={preview ? previewId : undefined}>
          Save
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function useSave() {
  const [saving, setSaving] = useState(false);
  // State alone can't stop a second submit fired before React re-renders.
  const busy = useRef(false);
  async function save(edits: ReadonlyMap<string, TagEdit>): Promise<boolean> {
    if (busy.current) return false;
    busy.current = true;
    setSaving(true);
    const saved = await editTracks(edits);
    busy.current = false;
    setSaving(false);
    return saved;
  }
  return { saving, save };
}

// Only the library's copy changes; the file keeps its own tags.
export function TrackDetails({
  track,
  onSaved,
  onCancel,
}: {
  track: Track;
  onSaved: (message: string, edited: Track) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(track.title);
  const [artist, setArtist] = useState(track.artist);
  const [album, setAlbum] = useState(track.album);
  const [albumArtist, setAlbumArtist] = useState(track.albumArtist);
  // A song with no album is grouped by its album artist, so that follows the artist until it's edited.
  // On an album it stays put, so correcting one song's artist doesn't take it off the album.
  const [linked, setLinked] = useState(!track.album && track.albumArtist === track.artist);
  const [trackNo, setTrackNo] = useState(numberText(track.trackNo));
  const [discNo, setDiscNo] = useState(numberText(track.discNo));
  const [year, setYear] = useState(numberText(track.year));
  const [checked, setChecked] = useState(false);
  const { saving, save } = useSave();

  const edit = {
    title: title.trim(),
    artist: artist.trim(),
    album: album.trim(),
    albumArtist: albumArtist.trim() || artist.trim(),
    trackNo: parseNumber(trackNo, 999),
    discNo: parseNumber(discNo, 999),
    year: parseNumber(year, 9999),
  };
  const errors = {
    title: edit.title ? null : "Enter a title.",
    artist: edit.artist ? null : "Enter an artist.",
    trackNo: edit.trackNo === undefined ? "Use a number from 1 to 999." : null,
    discNo: edit.discNo === undefined ? "Use a number from 1 to 999." : null,
    year: edit.year === undefined ? "Use a year such as 1999." : null,
  };
  const shown = (error: string | null) => (checked ? error : null);

  async function submit() {
    setChecked(true);
    if (Object.values(errors).some(Boolean)) return;
    const changed = (Object.keys(edit) as (keyof typeof edit)[]).some((k) => edit[k] !== track[k]);
    if (!changed) return onCancel();
    if (await save(new Map([[track.id, edit as TagEdit]]))) onSaved(`Saved ${edit.title}.`, { ...track, ...(edit as TagEdit) });
  }
  const preview = useAlbumPreview(edit.albumArtist, edit.album, trackAlbumKey(track), 1);

  return (
    <DetailsForm preview={preview} onSubmit={() => void submit()} onCancel={onCancel} saving={saving}>
      <TextField label="Title" value={title} error={shown(errors.title)} autoFocus onChange={(e) => setTitle(e.target.value)} />
      <TextField label="Artist" value={artist} error={shown(errors.artist)} onChange={(e) => {
          setArtist(e.target.value);
          if (linked) setAlbumArtist(e.target.value);
        }}
      />
      <TextField label="Album" value={album} placeholder="No album" onChange={(e) => setAlbum(e.target.value)} />
      <TextField
        label="Album artist"
        value={albumArtist}
        placeholder="Same as artist"
        onChange={(e) => {
          setAlbumArtist(e.target.value);
          setLinked(false);
        }}
      />
      <div className="details-row">
        <TextField label="Track" inputMode="numeric" value={trackNo} error={shown(errors.trackNo)} onChange={(e) => setTrackNo(e.target.value)} />
        <TextField label="Disc" inputMode="numeric" value={discNo} error={shown(errors.discNo)} onChange={(e) => setDiscNo(e.target.value)} />
        <TextField label="Year" inputMode="numeric" value={year} error={shown(errors.year)} onChange={(e) => setYear(e.target.value)} />
      </div>
    </DetailsForm>
  );
}

export function AlbumDetails({
  album,
  onSaving,
  onSaved,
  onCancel,
}: {
  album: Album;
  onSaving: (saving: boolean) => void;
  onSaved: (message: string, key: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(album.tracks[0]?.album ?? "");
  const [albumArtist, setAlbumArtist] = useState(album.artist);
  const initialYear = numberText(album.year);
  const [year, setYear] = useState(initialYear);
  const [checked, setChecked] = useState(false);
  const { saving, save } = useSave();

  const edit = { album: title.trim(), albumArtist: albumArtist.trim(), year: parseNumber(year, 9999) };
  const errors = {
    album: edit.album ? null : "Enter an album name.",
    albumArtist: edit.albumArtist ? null : "Enter an album artist.",
    year: edit.year === undefined ? "Use a year such as 1999." : null,
  };
  const shown = (error: string | null) => (checked ? error : null);

  async function submit() {
    setChecked(true);
    if (Object.values(errors).some(Boolean)) return;
    // Songs can have their own years, as on a compilation, so the year is only written when it was changed.
    const patch: TagEdit = { album: edit.album, albumArtist: edit.albumArtist };
    if (year.trim() !== initialYear) patch.year = edit.year;
    const changed = album.tracks.filter((t) => (Object.keys(patch) as (keyof TagEdit)[]).some((k) => patch[k] !== t[k]));
    if (changed.length === 0) return onCancel();
    onSaving(true);
    if (await save(new Map(changed.map((t) => [t.id, patch])))) {
      onSaved(`Saved ${edit.album}.`, trackAlbumKey({ ...edit, artist: edit.albumArtist }));
    } else onSaving(false);
  }
  const preview = useAlbumPreview(edit.albumArtist, edit.album, album.key, album.tracks.length);

  return (
    <DetailsForm preview={preview} onSubmit={() => void submit()} onCancel={onCancel} saving={saving}>
      <p className="details-note">Changes every song on the album.</p>
      <TextField label="Album" value={title} error={shown(errors.album)} autoFocus onChange={(e) => setTitle(e.target.value)} />
      <TextField label="Album artist" value={albumArtist} error={shown(errors.albumArtist)} onChange={(e) => setAlbumArtist(e.target.value)} />
      <div className="details-row">
        <TextField label="Year" inputMode="numeric" value={year} error={shown(errors.year)} onChange={(e) => setYear(e.target.value)} />
      </div>
    </DetailsForm>
  );
}
