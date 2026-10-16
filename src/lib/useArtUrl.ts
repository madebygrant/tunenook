import { useEffect, useState } from "react";
import { artUrl } from "./library";

export function useArtUrl(artId: string | null): string | null {
  const [loaded, setLoaded] = useState<{ artId: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!artId) return;
    let live = true;
    void artUrl(artId).then((url) => live && setLoaded({ artId, url }));
    return () => {
      live = false;
    };
  }, [artId]);
  return loaded?.artId === artId ? loaded.url : null;
}
