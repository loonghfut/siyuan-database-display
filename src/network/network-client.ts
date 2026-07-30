export interface NetworkRequestOptions {
    method: string;
    path: string;
    body?: string;
    headers?: Record<string, string>;
    timeout?: number;
    contentType?: string;
}

export interface NetworkClientOptions {
    serverUrl: string;
    proxyApiUrl?: string;
    defaultHeaders?: Record<string, string>;
    useProxy?: boolean;
}

interface ProxyHeader {
    [key: string]: string;
}

interface ProxyResponse {
    code?: number;
    msg?: string;
    data?: {
        status?: number;
        statusText?: string;
        body?: string;
        headers?: Record<string, string>;
    };
}

export class NetworkClient {
    private readonly serverUrl: string;
    private readonly proxyApiUrl: string;
    private readonly defaultHeaders: Record<string, string>;
    private readonly useProxy: boolean;

    constructor(options: NetworkClientOptions) {
        const {
            serverUrl,
            proxyApiUrl = "/api/network/forwardProxy",
            defaultHeaders = {},
            useProxy = true,
        } = options;

        this.serverUrl = serverUrl;
        this.proxyApiUrl = proxyApiUrl;
        this.defaultHeaders = defaultHeaders;
        this.useProxy = useProxy;
    }

    private getStatusText(status: number, fallback?: string): string {
        const statusTexts: Record<number, string> = {
            200: "OK",
            201: "Created",
            207: "Multi-Status",
            400: "Bad Request",
            401: "Unauthorized",
            403: "Forbidden",
            404: "Not Found",
            500: "Internal Server Error",
            503: "Service Unavailable",
        };
        return statusTexts[status] || fallback || "";
    }

    async request(options: NetworkRequestOptions): Promise<Response> {
        const { method, path, body, headers = {}, timeout = 15000, contentType } = options;
        const url = path.startsWith("http") ? path : `${this.serverUrl}${path}`;
        const requestHeaders = { ...this.defaultHeaders, ...headers };
        if (contentType) requestHeaders["Content-Type"] = contentType;

        if (!this.useProxy) {
            return this.fetchWithTimeout(url, {
                method,
                headers: requestHeaders,
                body,
            }, timeout);
        }

        const proxyHeaders: ProxyHeader[] = Object.keys(requestHeaders).map(key => ({ [key]: requestHeaders[key] }));
        const proxyPayload: Record<string, unknown> = {
            url,
            method,
            headers: proxyHeaders,
            timeout,
            contentType: requestHeaders["Content-Type"] || "application/json",
        };
        if (body !== undefined) proxyPayload.payload = body;

        const proxyApiResponse = await this.fetchWithTimeout(this.proxyApiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(proxyPayload),
        }, timeout);

        if (!proxyApiResponse.ok) {
            const errorText = await proxyApiResponse.text();
            throw new Error(`代理请求失败: ${proxyApiResponse.status} ${proxyApiResponse.statusText} - ${errorText}`);
        }

        const proxyResult = await proxyApiResponse.json() as ProxyResponse;
        if (proxyResult.code !== 0 && proxyResult.code !== undefined) {
            const errorStatus = proxyResult.data?.status || 503;
            const errorStatusText = proxyResult.msg || "Proxy forwarding error";
            const errorBody = proxyResult.data?.body || proxyResult.msg || `Proxy error: ${errorStatusText}`;
            return new Response(errorBody, {
                status: errorStatus,
                statusText: this.getStatusText(errorStatus, errorStatusText),
                headers: new Headers(proxyResult.data?.headers || {}),
            });
        }

        if (proxyResult.data?.status !== undefined) {
            const actualStatus = proxyResult.data.status;
            return new Response(proxyResult.data.body, {
                status: actualStatus,
                statusText: this.getStatusText(actualStatus, proxyResult.data.statusText),
                headers: new Headers(proxyResult.data.headers || {}),
            });
        }

        throw new Error(`未预期的代理响应结构。代理返回: ${JSON.stringify(proxyResult)}`);
    }

    private async fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeout: number): Promise<Response> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        try {
            return await fetch(input, { ...init, signal: controller.signal });
        } finally {
            clearTimeout(timer);
        }
    }
}
