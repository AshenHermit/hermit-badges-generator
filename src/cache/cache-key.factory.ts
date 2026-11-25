import { createHash } from 'node:crypto';

export class CacheKeyFactory {
  static create(endpoint: string, query: Record<string, string>): string {
    const canonical = Object.keys(query)
      .sort()
      .map((key) => `${key}=${encodeURIComponent(query[key])}`)
      .join('&');
    return createHash('sha256').update(`${endpoint}?${canonical}`).digest('hex');
  }
}
