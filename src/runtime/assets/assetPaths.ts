export function isExternalPath(path: string) {
	return /^(?:data:|https?:\/\/)/i.test(path);
}

export function withBasePath(basePath: string | undefined, path: string) {
	if (!path) return (basePath ?? "").replace(/\/$/, "");
	if (isExternalPath(path)) return path;

	const normalizedBasePath = (basePath ?? "").replace(/\/$/, "");
	return path.startsWith("/") ? `${normalizedBasePath}${path}` : `${normalizedBasePath}/${path}`;
}

