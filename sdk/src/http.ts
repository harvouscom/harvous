import type { HarvousClientConfig } from './types/common.js';
import {
  HarvousError,
  HarvousAuthError,
  HarvousNotFoundError,
  HarvousRateLimitError,
  HarvousValidationError,
  HarvousNetworkError,
} from './errors.js';

export class HttpClient {
  private baseUrl: string;
  private token: string | undefined;
  private getToken: (() => Promise<string | null>) | undefined;
  private timeout: number;
  private retries: number;

  constructor(config: HarvousClientConfig) {
    this.baseUrl = (config.baseUrl || 'https://harvous.com').replace(/\/$/, '');
    this.token = config.token;
    this.getToken = config.getToken;
    this.timeout = config.timeout ?? 10000;
    this.retries = config.retries ?? 2;
  }

  setToken(token: string): void {
    this.token = token;
  }

  private async resolveToken(): Promise<string | null> {
    if (this.getToken) {
      return this.getToken();
    }
    return this.token ?? null;
  }

  private buildUrl(
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): string {
    const url = new URL(path, this.baseUrl);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  private async request<T>(
    method: string,
    path: string,
    options?: {
      body?: unknown;
      formData?: FormData;
      params?: Record<string, string | number | boolean | undefined>;
    },
  ): Promise<T> {
    const token = await this.resolveToken();
    const url = this.buildUrl(path, options?.params);

    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let body: BodyInit | undefined;
    if (options?.formData) {
      body = options.formData;
    } else if (options?.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }

    let lastError: unknown;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      if (attempt > 0) {
        // Exponential backoff: 200ms, 400ms, 800ms...
        await new Promise((r) => setTimeout(r, 200 * Math.pow(2, attempt - 1)));
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch(url, {
          method,
          headers,
          body,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const text = await response.text();
          if (!text) return undefined as T;
          return JSON.parse(text) as T;
        }

        // Parse error response
        let errorBody: { error?: string; code?: string; message?: string } = {};
        try {
          errorBody = await response.json();
        } catch {
          // Response body not JSON
        }

        const errorMessage =
          errorBody.error || errorBody.message || response.statusText;

        // Don't retry client errors (4xx)
        if (response.status < 500) {
          throw this.mapError(response.status, errorMessage, errorBody.code, errorBody, response.headers);
        }

        // Retry on 5xx
        lastError = new HarvousError(
          errorMessage,
          response.status,
          errorBody.code,
          errorBody,
        );
      } catch (err) {
        clearTimeout(timeoutId);

        // Re-throw SDK errors (already mapped)
        if (err instanceof HarvousError) {
          // For server errors being retried, store and continue
          if (err.status >= 500 && attempt < this.retries) {
            lastError = err;
            continue;
          }
          throw err;
        }

        // AbortError = timeout
        if (err instanceof DOMException && err.name === 'AbortError') {
          lastError = new HarvousNetworkError(
            `Request timed out after ${this.timeout}ms`,
            err,
          );
          if (attempt < this.retries) continue;
          throw lastError;
        }

        // Network error
        lastError = new HarvousNetworkError(
          err instanceof Error ? err.message : 'Network error',
          err,
        );
        if (attempt < this.retries) continue;
        throw lastError;
      }
    }

    // Exhausted retries
    throw lastError;
  }

  private mapError(
    status: number,
    message: string,
    code: string | undefined,
    response: unknown,
    headers: Headers,
  ): HarvousError {
    switch (status) {
      case 401:
        return new HarvousAuthError(message);
      case 403:
        return new HarvousError(message, 403, code || 'FORBIDDEN', response);
      case 404:
        return new HarvousNotFoundError(message);
      case 429: {
        const resetHeader = headers.get('x-ratelimit-reset');
        const resetTime = resetHeader ? parseInt(resetHeader, 10) : undefined;
        return new HarvousRateLimitError(message, resetTime);
      }
      default:
        if (status >= 400 && status < 500) {
          return new HarvousValidationError(message, code);
        }
        return new HarvousError(message, status, code, response);
    }
  }

  async get<T>(
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    return this.request<T>('GET', path, { params });
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, { body });
  }

  async postFormData<T>(
    path: string,
    fields: Record<string, string | undefined>,
  ): Promise<T> {
    const formData = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        formData.append(key, value);
      }
    }
    return this.request<T>('POST', path, { formData });
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', path, { body });
  }

  async del<T>(
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    return this.request<T>('DELETE', path, { params });
  }
}
