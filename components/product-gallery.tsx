"use client";

import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import { useState } from "react";

export type ProductGalleryImage = {
  url: string;
  label: string | null;
};

export function ProductGallery({
  images,
  productName,
}: {
  images: ProductGalleryImage[];
  productName: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [failedIndexes, setFailedIndexes] = useState<number[]>([]);
  const active = images[activeIndex] || null;
  const failed = failedIndexes.includes(activeIndex);

  function markFailed(index: number) {
    setFailedIndexes((current) => current.includes(index) ? current : [...current, index]);
  }

  function move(direction: -1 | 1) {
    if (images.length < 2) return;
    setActiveIndex((current) => (current + direction + images.length) % images.length);
  }

  return <div className="pdp-gallery-shell">
    <div className="pdp-gallery-main" role="group" aria-label={`${productName} product images`}>
      {active && !failed ? <img
        src={active.url}
        alt={active.label || productName}
        onError={() => markFailed(activeIndex)}
      /> : <div className="pdp-gallery-fallback" role="img" aria-label={`${productName} image unavailable`}>
        <ImageOff size={42} strokeWidth={1.5}/>
        <span>Image unavailable</span>
      </div>}

      {images.length > 1 ? <>
        <button className="pdp-gallery-nav prev" type="button" onClick={() => move(-1)} aria-label="Previous product image">
          <ChevronLeft size={20}/>
        </button>
        <button className="pdp-gallery-nav next" type="button" onClick={() => move(1)} aria-label="Next product image">
          <ChevronRight size={20}/>
        </button>
        <span className="pdp-gallery-count" aria-live="polite">{activeIndex + 1} / {images.length}</span>
      </> : null}
    </div>

    {images.length > 1 ? <div className="pdp-thumbnails" aria-label="Choose product image">
      {images.map((image, index) => {
        const thumbFailed = failedIndexes.includes(index);
        return <button
          className={index === activeIndex ? "active" : ""}
          type="button"
          key={`${image.url}-${index}`}
          onClick={() => setActiveIndex(index)}
          aria-label={`View product image ${index + 1}`}
          aria-pressed={index === activeIndex}
        >
          {!thumbFailed ? <img src={image.url} alt="" onError={() => markFailed(index)}/> : <ImageOff size={20} aria-hidden="true"/>}
        </button>;
      })}
    </div> : null}
  </div>;
}
