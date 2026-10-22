import Image from "next/image";

import { initials } from "@/lib/format";
import { avatarUrl } from "@/lib/profile-layout";

/**
 * A claimed owner's uploaded photo, or their initials (§9.2: nothing else is ever stored).
 * Photos are already 512px WebP from the upload, so they skip image optimization.
 */
export function Avatar({ name, path, size }: { name: string; path: string | null | undefined; size: number }) {
  const url = avatarUrl(path);
  const box = "shrink-0 overflow-hidden rounded-[22%] border border-line bg-chrome";
  if (url) {
    return <Image src={url} alt={name} width={size} height={size} unoptimized className={`${box} object-cover`} style={{ width: size, height: size }} />;
  }
  return (
    <span
      aria-hidden="true"
      className={`${box} sys grid place-items-center font-semibold text-muted`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
    >
      {initials(name)}
    </span>
  );
}
