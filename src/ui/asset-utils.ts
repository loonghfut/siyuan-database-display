import { AssetReference } from "@/core/types";

export function assetLabel(asset: AssetReference): string {
    return asset.name || asset.content || "";
}

export function assetThumbnailUrl(path: string): string {
    const encoded = encodeURI(path);
    const pathname = encoded.split("?")[0].toLowerCase();
    if (encoded.startsWith("assets/") && /\.(png|jpe?g)$/.test(pathname)) {
        return `${encoded}${encoded.includes("?") ? "&" : "?"}style=thumb`;
    }
    return encoded;
}
