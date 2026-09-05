"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

export default function SeasonSelect({ seasons, value }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onChange(e) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("season", e.target.value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <select
      value={value}
      onChange={onChange}
      className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-navy shadow-sm"
    >
      {seasons.map((s) => (
        <option key={s} value={s}>
          Saison {s}
        </option>
      ))}
    </select>
  );
}
