import Image from "next/image";
import { useState } from "react";

interface ProductImageProps {
  src?: string;
  alt: string;
  className?: string;
  imageClassName?: string;
  sizes?: string;
  priority?: boolean;
}

const FALLBACK_SRC = "/placeholder.svg";

export default function ProductImage({
  src,
  alt,
  className = "aspect-square",
  imageClassName = "",
  sizes = "(max-width: 768px) 100vw, 33vw",
  priority = false,
}: ProductImageProps) {
  const normalizedSrc = src?.trim() || FALLBACK_SRC;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const currentSrc = failedSrc === normalizedSrc ? FALLBACK_SRC : normalizedSrc;
  const shouldUseFallback = currentSrc === FALLBACK_SRC;
  const isSvg = currentSrc.toLowerCase().endsWith(".svg");

  if (shouldUseFallback) {
    return (
      <div
        className={`relative grid place-items-center overflow-hidden bg-neutral-950 ${className}`}
        role="img"
        aria-label={alt}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_25%,rgba(245,158,11,0.22),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.07),transparent_42%)]" />
        <div className="relative grid h-16 w-16 place-items-center rounded-full border border-amber-300/30 bg-amber-300/12 shadow-[0_0_40px_rgba(245,158,11,0.16)]">
          <div className="h-8 w-8 rounded-full border-[10px] border-neutral-950 bg-amber-300/80" />
        </div>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-neutral-950 ${className}`}>
      <Image
        src={currentSrc}
        alt={alt}
        fill
        sizes={sizes}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        unoptimized={isSvg}
        className={`object-cover ${imageClassName}`}
        onError={() => {
          if (currentSrc !== FALLBACK_SRC) {
            setFailedSrc(normalizedSrc);
          }
        }}
      />
    </div>
  );
}
