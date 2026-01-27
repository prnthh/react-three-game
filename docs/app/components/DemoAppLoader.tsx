"use client";

import dynamic from "next/dynamic";

const DemoApp = dynamic(() => import("./DemoApp"), {
  ssr: false,
});

export default function DemoAppLoader() {
  return <DemoApp />;
}
