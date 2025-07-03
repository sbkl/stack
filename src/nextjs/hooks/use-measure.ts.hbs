"use client";

import * as React from "react";

export function useMeasure<T extends HTMLElement>() {
  const [bounds, setBounds] = React.useState<DOMRect | undefined>(undefined);

  const [node, setNode] = React.useState<T | null>(null);
  const ref = React.useCallback((node: T) => {
    setNode(node);
    const measure = () => {
      setBounds(node.getBoundingClientRect());
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return { bounds, ref, node };
}
