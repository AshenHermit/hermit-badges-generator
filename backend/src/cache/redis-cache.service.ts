import { Inject, Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import Redis from 'ioredis';
import { BadgeCache } from './badge-cache';

export const REDIS_CLIENT: symbol = Symbol('REDIS_CLIENT');

export interface RedisClientLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  quit(): Promise<unknown>;
}

@Injectable()
export class RedisCacheService implements BadgeCache, OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);
  private client?: RedisClientLike;

  constructor(@Optional() @Inject(REDIS_CLIENT) client?: RedisClientLike) {
    this.client = client;
  }

  async get(key: string): Promise<Buffer | undefined> {
    if (this.isDisabled()) {
      return undefined;
    }
    try {
      const raw = await this.getClient().get(`badge:${key}`);
      return raw === null ? undefined : Buffer.from(raw, 'base64');
    } catch (error) {
      this.logger.error(`Redis cache get failed: ${String(error)}`);
      return undefined;
    }
  }

  async set(key: string, value: Buffer): Promise<void> {
    if (this.isDisabled()) {
      return;
    }
    try {
      const ttlMs = parseInt(process.env.CACHE_TTL_MS ?? '3600000', 10);
      await this.getClient().set(
        `badge:${key}`,
        value.toString('base64'),
        'EX',
        Math.ceil(ttlMs / 1000),
      );
    } catch (error) {
      this.logger.error(`Redis cache set failed: ${String(error)}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.client) {
      return;
    }
    try {
      await this.client.quit();
    } catch (error) {
      this.logger.error(`Redis cache quit failed: ${String(error)}`);
    }
  }

  private getClient(): RedisClientLike {
    if (!this.client) {
      this.client = new Redis({
        host: process.env.REDIS_HOST ?? '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
        db: parseInt(process.env.REDIS_DB ?? '0', 10),
      });
    }
    return this.client;
  }

  private isDisabled(): boolean {
    return ['1', 'true', 'yes'].includes(
      (process.env.CACHE_DISABLED ?? '').trim().toLowerCase(),
    );
  }
}
