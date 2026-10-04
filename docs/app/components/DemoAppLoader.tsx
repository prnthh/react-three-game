"use client";

import dynamic from "next/dynamic";

const DemoApp = dynamic(() => import("./DemoApp"), {
  ssr: false,
});

export default function DemoAppLoader() {
  return (
    <div className="absolute inset-0 -z-1 h-full w-full">
      <DemoApp />
    </div>
  );
}
