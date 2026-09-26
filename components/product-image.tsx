"use client";

import { ImageOff } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

export function ProductImage({
  src,
  alt,
  sizes = "(max-width: 560px) 100vw, (max-width: 1100px) 50vw, 320px",
}: {
  src?: string | null;
  alt: string;
  sizes?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return <div className="product-image-fallback" role="img" aria-label={`${alt} image unavailable`}>
      <ImageOff size={38} strokeWidth={1.6} aria-hidden="true"/>
      <span>Image unavailable</span>
    </div>;
  }

  return <Image
    src={src}
    alt={alt}
    width={720}
    height={720}
    sizes={sizes}
    quality={76}
    onError={() => setFailed(true)}
  />;
}
