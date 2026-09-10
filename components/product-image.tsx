"use client";

import { useState } from "react";

export function ProductImage({
  src,
  alt,
}: {
  src?: string | null;
  alt: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return <div className="product-image-fallback" role="img" aria-label={`${alt} image unavailable`}>
      <span className="product-image-fallback-mark" aria-hidden="true"/>
      <span>Image unavailable</span>
    </div>;
  }

  return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)}/>;
}
