import type { ComponentType, ReactNode } from "react";

export type RuntimeWrapper = ComponentType<{ children: ReactNode }>;

const runtimeWrappers = new Set<RuntimeWrapper>();

export function registerRuntimeWrapper(Wrapper: RuntimeWrapper) {
	runtimeWrappers.add(Wrapper);
}

export function RuntimeWrappers({ children }: { children: ReactNode }) {
	return [...runtimeWrappers].reduceRight<ReactNode>(
		(child, Wrapper) => <Wrapper>{child}</Wrapper>,
		children,
	);
}
