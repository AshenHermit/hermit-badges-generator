import { Injectable, Optional } from '@nestjs/common';
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
  private readonly disabled: boolean;

  constructor(@Optional() ttlMs?: number, @Optional() maxEntries?: number) {
    this.ttlMs = ttlMs ?? parseInt(process.env.CACHE_TTL_MS ?? '3600000', 10);
    this.maxEntries = maxEntries ?? parseInt(process.env.CACHE_MAX_ENTRIES ?? '1000', 10);
    this.disabled = ['1', 'true', 'yes'].includes(
      (process.env.CACHE_DISABLED ?? '').trim().toLowerCase(),
    );
  }

  get size(): number {
    return this.entries.size;
  }

  async set(key: string, value: Buffer): Promise<void> {
    if (this.disabled) {
      return;
    }
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

  async get(key: string): Promise<Buffer | undefined> {
    if (this.disabled) {
      return undefined;
    }
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
