"use client";

import { useFormStatus } from "react-dom";

export default function SyncButton({ children, pendingLabel = "Synchronisation...", className }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingLabel : children}
    </button>
  );
}
