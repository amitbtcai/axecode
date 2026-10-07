import type { Env } from "./env";

// axecode: blob persistence without an R2 subscription. The BLOBS binding is
// optional — when present (upstream layouts, paid accounts) it is used
// unchanged; otherwise every blob op goes over HTTPS to the Axe AI VPS blob
// endpoint (/api/edge-blobs/*, see axeai src/api/edge-blob-routes.ts) so the
// worker deploys on the Workers Free plan.
//
// RemoteBlobs mirrors the R2Bucket members the codebase actually uses:
// put/get/head with httpMetadata write-back. Keep it that narrow — list,
// delete and multipart stay R2-only until something needs them.

export interface RemoteBlobHead {
  size: number;
  httpEtag: string;
  writeHttpMetadata(headers: Headers): void;
}

export interface RemoteBlobBody extends RemoteBlobHead {
  body: ReadableStream;
}

export interface RemoteBlobs {
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | ReadableStream | string,
    options?: { httpMetadata?: { contentType?: string } }
  ): Promise<unknown>;
  get(key: string): Promise<RemoteBlobBody | null>;
  head(key: string): Promise<RemoteBlobHead | null>;
}

const wrapHead = (response: Response): RemoteBlobHead => ({
  size: Number(response.headers.get("content-length") ?? 0),
  httpEtag: response.headers.get("etag") ?? "",
  writeHttpMetadata: (headers: Headers) => {
    const contentType = response.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);
  }
});

export class VpsBlobStore implements RemoteBlobs {
  constructor(
    private readonly baseUrl: string | undefined,
    private readonly token: string | undefined
  ) {}

  private url(key: string): string {
    if (!this.baseUrl) {
      throw new Error("no BLOBS binding and AXEAI_BLOB_URL is unset");
    }
    return `${this.baseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }

  private headers(contentType?: string): Record<string, string> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.token ?? ""}`
    };
    if (contentType) headers["content-type"] = contentType;
    return headers;
  }

  async put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | ReadableStream | string,
    options?: { httpMetadata?: { contentType?: string } }
  ): Promise<void> {
    const response = await fetch(this.url(key), {
      method: "PUT",
      headers: this.headers(options?.httpMetadata?.contentType),
      body: value
    });
    if (!response.ok) throw new Error(`blob put ${key} failed: ${response.status}`);
  }

  async get(key: string): Promise<RemoteBlobBody | null> {
    const response = await fetch(this.url(key), { headers: this.headers() });
    if (response.status === 404) return null;
    if (!response.ok || response.body === null) {
      throw new Error(`blob get ${key} failed: ${response.status}`);
    }
    return { ...wrapHead(response), body: response.body };
  }

  async head(key: string): Promise<RemoteBlobHead | null> {
    const response = await fetch(this.url(key), {
      method: "HEAD",
      headers: this.headers()
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`blob head ${key} failed: ${response.status}`);
    return wrapHead(response);
  }
}

/** The blob backend for this deployment: the R2 BLOBS binding when bound,
 * otherwise the VPS blob endpoint (AXEAI_BLOB_URL + AXEAI_BLOB_TOKEN). */
export const remoteBlobs = (env: Env): RemoteBlobs =>
  env.BLOBS ?? new VpsBlobStore(env.AXEAI_BLOB_URL, env.AXEAI_BLOB_TOKEN);
