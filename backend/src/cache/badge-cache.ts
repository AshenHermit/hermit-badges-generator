export const BADGE_CACHE: symbol = Symbol('BADGE_CACHE');

export interface BadgeCache {
  get(key: string): Promise<Buffer | undefined>;
  set(key: string, value: Buffer): Promise<void>;
}
