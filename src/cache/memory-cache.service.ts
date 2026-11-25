import { Injectable } from '@nestjs/common';
import { BadgeCache } from './badge-cache';

interface Entry {
  value: Buffer;
  expiresAt: number;
}

@Injectable()
export class MemoryCacheService implements BadgeCache {
  private readonly entries = new Map<string, Entry>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(ttlMs?: number, maxEntries?: number) {
    this.ttlMs = ttlMs ?? parseInt(process.env.CACHE_TTL_MS ?? '3600000', 10);
    this.maxEntries = maxEntries ?? parseInt(process.env.CACHE_MAX_ENTRIES ?? '1000', 10);
  }

  get size(): number {
    return this.entries.size;
  }

  set(key: string, value: Buffer): void {
    if (this.entries.has(key)) {
      this.entries.delete(key);
    } else if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) {
        this.entries.delete(oldest);
      }
    }
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  get(key: string): Buffer | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }
}
