"use client";

import { ReactNode } from "react";
import Link from "next/link";

interface FormTriggerProps {
  type: "medical" | "school" | "wedding";
  children: ReactNode;
}

export function FormTrigger({ type, children }: FormTriggerProps) {
  return (
    <Link href={`/dashboard?service=${type}`} className="block">
      {children}
    </Link>
  );
}
