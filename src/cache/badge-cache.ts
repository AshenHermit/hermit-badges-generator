export interface BadgeCache {
  get(key: string): Buffer | undefined;
  set(key: string, value: Buffer): void;
}
