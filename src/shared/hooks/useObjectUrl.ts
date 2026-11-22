/** A `blob:` URL for `url` while it is given (WebKit shows a PDF from one in a frame, never from a `data:` URL), revoked
 *  once it isn't; a file that can't be read goes to `onError`. A lifecycle (the URL holds the bytes until revoked), not cached data, so it is an effect, not a query. */

import { useEffect, useRef, useState } from 'react';

export function useObjectUrl(url: string | null, onError: (error: unknown) => void): string | null {
  const reportRef = useRef(onError);
  reportRef.current = onError;
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!url) return;
    let made: string | null = null;
    let gone = false;
    fetch(url)
      .then((response) => response.blob())
      .then((blob) => {
        if (gone) return;
        made = URL.createObjectURL(blob);
        setObjectUrl(made);
      })
      .catch((error: unknown) => {
        if (!gone) reportRef.current(error);
      });
    return () => {
      gone = true;
      if (made) URL.revokeObjectURL(made);
      setObjectUrl(null);
    };
  }, [url]);
  return objectUrl;
}
