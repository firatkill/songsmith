export interface SecureStorage {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
}
// 400 Unicode code points use at most 1600 UTF-8 bytes, below the 2048-byte native limit.
// Two slots keep the previous session intact until the new manifest is committed.
export function chunkedStorage(store: SecureStorage) {
  let queue: Promise<unknown> = Promise.resolve();
  function serial<T>(work: () => Promise<T>): Promise<T> {
    const result = queue.then(work);
    queue = result.catch(() => undefined);
    return result;
  }
  async function manifest(key: string) {
    const raw = await store.getItemAsync(key);
    const match = /^([ab]):(\d+)$/.exec(raw ?? '');
    if (!match) return null;
    const count = Number(match[2]);
    if (!Number.isSafeInteger(count) || count < 1 || count > 1000) return null;
    return { slot: match[1] === 'a' ? 'a' : 'b', count };
  }
  async function clear(
    key: string,
    value: { slot: string; count: number } | null,
  ) {
    if (value)
      for (let i = 0; i < value.count; i++)
        await store.deleteItemAsync(`${key}.${value.slot}.${String(i)}`);
  }
  return {
    getItem: (key: string) =>
      serial(async () => {
        const value = await manifest(key);
        if (!value) return null;
        const parts: string[] = [];
        for (let i = 0; i < value.count; i++) {
          const part = await store.getItemAsync(
            `${key}.${value.slot}.${String(i)}`,
          );
          if (part === null) return null;
          parts.push(part);
        }
        return parts.join('');
      }),
    setItem: (key: string, text: string) =>
      serial(async () => {
        const old = await manifest(key);
        const slot = old?.slot === 'a' ? 'b' : 'a';
        const characters = Array.from(text);
        const count = Math.max(1, Math.ceil(characters.length / 400));
        if (count > 1000) throw new Error('Session storage limit exceeded');
        try {
          for (let i = 0; i < count; i++)
            await store.setItemAsync(
              `${key}.${slot}.${String(i)}`,
              characters.slice(i * 400, (i + 1) * 400).join(''),
            );
          await store.setItemAsync(key, `${slot}:${String(count)}`);
        } catch (error) {
          await clear(key, { slot, count });
          throw error;
        }
        await clear(key, old);
      }),
    removeItem: (key: string) =>
      serial(async () => {
        const old = await manifest(key);
        await store.deleteItemAsync(key);
        await clear(key, old);
      }),
  };
}
