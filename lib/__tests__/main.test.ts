import { atom } from "nanostores";
import { nanoquery } from "../main";
import { noop, delay } from "./setup";

beforeAll(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("fetcher tests", () => {
  test("fetches once for multiple subscriptions", async () => {
    const fetcher = vi.fn().mockImplementation(async () => true);

    const keys = ["/api", "/key"];

    const [makeFetcher] = nanoquery();
    const store = makeFetcher(keys, { fetcher });
    store.listen(noop);
    store.listen(noop);
    store.listen(noop);

    await advance();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(...keys);
  });

  test("works with numerical keys", async () => {
    const fetcher = vi.fn().mockImplementation(async () => true);

    const keys = ["/api", "/page/", 5];

    const [makeFetcher] = nanoquery();
    const store = makeFetcher(keys, { fetcher });
    store.listen(noop);
    store.listen(noop);
    store.listen(noop);

    await advance();
    expect(store.key).toBe(keys.join(""));
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(...keys);
  });

  test("works with boolean keys", async () => {
    const fetcher = vi.fn().mockImplementation(async () => true);
    const $conditional = atom(false);

    const keys = ["/api", $conditional];

    const [makeFetcher] = nanoquery();
    const store = makeFetcher(keys, { fetcher });
    store.listen(noop);

    await advance();
    expect(store.value?.loading).toBe(false);

    $conditional.set(true);
    await advance();
    expect(store.value?.data).toBe(true);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith("/api", true);
  });

  test("works for string-based keys", async () => {
    const fetcher = vi.fn().mockImplementation(async () => true);

    const [makeFetcher] = nanoquery();
    const store = makeFetcher("/api/key", { fetcher });
    store.listen(noop);
    store.listen(noop);
    store.listen(noop);

    await advance();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith("/api/key");
  });

  test("values are shared between stores with same keys", async () => {
    const fetcher = vi.fn().mockImplementation(async () => true);

    const keys = ["/api", "/key"];

    const [makeFetcher] = nanoquery({ fetcher });
    const store1 = makeFetcher(keys, { fetcher }),
      store2 = makeFetcher(keys);

    store1.listen(noop);
    store2.listen(noop);

    await advance();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(...keys);

    expect(store1.get().data).toBe(true);
    expect(store2.get().data).toBe(true);
  });

  test("propagates loading state", async () => {
    const keys = ["/api", "/key"];
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => new Promise((r) => setTimeout(r, 10)));

    const [makeFetcher] = nanoquery();
    const store = makeFetcher(keys, { fetcher });
    store.listen(noop);

    expect(store.get()).toMatchObject({ loading: true });
    await advance(20);
    expect(store.get()).toEqual({ loading: false, data: undefined });
  });

  test("propagates error state", async () => {
    const keys = ["/api", "/key"];
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => new Promise((_, r) => r("err")));

    const [makeFetcher] = nanoquery();
    const store = makeFetcher(keys, { fetcher });
    store.listen(noop);

    await advance();

    expect(store.get()).toMatchObject({ error: "err", loading: false });
  });

  test("provides a promise as part of the lib", async () => {
    const res = {};
    const originalPromise = new Promise((r) => r(res));

    const fetcher = vi.fn().mockImplementationOnce(() => originalPromise);

    const [makeFetcher] = nanoquery();
    const store = makeFetcher("", { fetcher });
    store.listen(noop);

    const { promise } = store.get();
    expect(promise).toBeInstanceOf(Promise);
    expect(promise).toStrictEqual(originalPromise);

    await advance();

    expect(store.get().data).toStrictEqual(res);
  });

  test("transitions through states correctly", async () => {
    const keys = ["/api", "/key"];
    const fetcher = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise((r) => setTimeout(() => r("yo"), 10))
      );

    const [makeFetcher] = nanoquery();
    const store = makeFetcher(keys, { fetcher });
    store.listen(noop);

    await advance(20);

    expect(store.get()).toEqual({ data: "yo", loading: false });
  });

  test("accepts stores as keys", async () => {
    const $id = atom<string>("id1");
    const res: Record<string, string> = {
      id1: "id1Value",
      id2: "id2Value",
    };

    const keys = ["/api", "/key/", $id];
    const fetcher = vi
      .fn()
      .mockImplementation(
        (...keys: string[]) =>
          new Promise((r) => setTimeout(() => r(res[keys[2]]), 10))
      );

    const [makeFetcher] = nanoquery();
    const store = makeFetcher(keys, { fetcher });

    store.listen(noop);
    expect(store.key).toBe("/api/key/id1");

    await advance();
    expect(store.get()).toMatchObject({ loading: true });
    await advance(20);
    expect(store.get()).toEqual({ data: "id1Value", loading: false });

    $id.set("id2");
    await advance();
    expect(store.key).toBe("/api/key/id2");
    await advance();
    expect(store.get()).toMatchObject({ loading: true });
    await advance(20);

    expect(store.get()).toEqual({ data: "id2Value", loading: false });
    $id.set("id1");
    await advance();
    expect(store.key).toBe("/api/key/id1");
    await advance();
    expect(store.get()).toEqual({ data: "id1Value", loading: false });
  });

  test("accepts fetcher stores as keys", async () => {
    const $cond = atom(true);

    const fetcher = vi.fn().mockImplementation(async (...keys: any[]) => {
      await delay(100);
      // explicitly returning undefined
    });

    const [makeFetcher] = nanoquery({ fetcher });

    const $store1 = makeFetcher(["store1", $cond]),
      $store2 = makeFetcher(["store2", $store1]);

    $store2.listen(noop);
    await advance();

    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith("store1", true);
    expect($store1.value).toMatchObject({ loading: true });
    expect($store2.value).toEqual({ loading: false });

    await advance(150);
    await advance();

    expect($store1.value).toMatchObject({ loading: false });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenCalledWith("store2", "store1true");
    expect($store2.value).toMatchObject({ loading: true });

    await advance(150);
    await advance();

    expect($store2.value).toMatchObject({ loading: false });

    $cond.set(false);
    await advance();
    await advance();

    expect($store1.value).toEqual({ loading: false });
    expect($store2.value).toEqual({ loading: false });
  });

  test("do not send request if it was sent before dedupe time", async () => {
    const keys = ["/api", "/key"];

    const fetcher = vi.fn().mockImplementation(async () => "data");

    const [makeFetcher] = nanoquery();
    const store = makeFetcher(keys, { fetcher, dedupeTime: 200 });
    {
      const unsub = store.listen(noop);
      await advance();
      expect(store.get()).toEqual({ data: "data", loading: false });
      unsub();
    }
    await advance(10);
    {
      const unsub = store.listen(noop);
      await advance();
      expect(store.get()).toEqual({ data: "data", loading: false });
      unsub();
      expect(fetcher).toHaveBeenCalledOnce();
    }

    await advance(300);
    store.listen(noop);
    await advance();
    expect(store.get()).toEqual({ data: "data", loading: false });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test("do not send request if it was sent before dedupe time", async () => {
    let callNum = 0;

    const fetcher = vi.fn().mockImplementation(
      () =>
        new Promise((r) => {
          r(`data${callNum++}`);
        })
    );

    const [makeFetcher] = nanoquery({ dedupeTime: 1000 });
    const $store1 = makeFetcher([1], { fetcher });
    const unsub1 = $store1.listen(noop);
    await advance();
    expect($store1.value).toMatchObject({ data: "data0", loading: false });
    await advance(5000);
    unsub1();
    const $store2 = makeFetcher([3], { fetcher });
    $store2.listen(noop);
    await advance();
    expect($store2.value).toMatchObject({ data: "data1", loading: false });

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test("changing multiple atom-based keys results in a single fetch call", async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(
        (...keys: unknown[]) => new Promise((r) => r(keys.join("")))
      );

    const [makeFetcher] = nanoquery();

    const $key1 = atom<string | null>(null),
      $key2 = atom<string | null>(null),
      $key3 = atom<string | null>(null);

    const $store = makeFetcher([$key1, $key2, $key3], { fetcher });

    $store.listen(noop);
    await advance();
    expect($store.value).toMatchObject({ loading: false });

    $key1.set("key1");
    $key2.set("key2");
    $key3.set("key3");
    await advance();

    expect($store.value).toMatchObject({
      loading: false,
      data: "key1key2key3",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test("nullable keys disable network fetching and unset store value, but enable once are set", async () => {
    const $id = atom<string | null>(null);

    const keys = ["/api", "/key/", $id];
    const fetcher = vi.fn().mockImplementation(async () => {
      await delay(100);
      return "data";
    });

    const [makeFetcher] = nanoquery();
    const store = makeFetcher(keys, { fetcher });
    store.listen(noop);

    expect(store.get()).toEqual({ loading: false });
    $id.set("id2");
    await advance();
    expect(store.get()).toMatchObject({ loading: true });
    await advance(100);
    await advance();
    expect(store.get()).toEqual({ data: "data", loading: false });

    $id.set(null);
    await advance();
    expect(store.get()).toEqual({ loading: false });
    $id.set("id2");
    await advance();
    expect(store.get()).toEqual({ data: "data", loading: false });
  });

  test("__unsafeOverruleSettings overrides everything", async () => {
    const keys = ["/api", "/key"];
    const fetcher1 = vi
      .fn()
      .mockImplementation(() => new Promise((r) => r(null)));
    const fetcher2 = vi
      .fn()
      .mockImplementation(() => new Promise((r) => r(null)));

    const [makeFetcher, , { __unsafeOverruleSettings }] = nanoquery();
    const store = makeFetcher(keys, { fetcher: fetcher1 });
    __unsafeOverruleSettings({ fetcher: fetcher2 });
    store.listen(noop);

    await advance();
    expect(store.get()).toEqual({ data: null, loading: false });
    expect(fetcher1).toBeCalledTimes(0);
    expect(fetcher2).toBeCalledTimes(1);
  });

  test("uses stale cache with setting loading state", async () => {
    const $id = atom("id1");
    const res: Record<string, string> = {
      id1: "id1Value",
      id2: "id2Value",
    };

    const keys = ["/api", "/key/", $id];
    let counter = 0;
    const fetcher = vi.fn().mockImplementation(
      (...keys: string[]) =>
        new Promise((r) =>
          setTimeout(() => {
            r(res[keys[2]] + counter);
            counter++;
          }, 10)
        )
    );

    const [makeFetcher] = nanoquery();
    const store = makeFetcher(keys, { fetcher, dedupeTime: 0 });
    store.listen(noop);

    expect(store.get()).toMatchObject({ loading: true });
    await advance(20);
    expect(store.get()).toEqual({ data: "id1Value0", loading: false });

    $id.set("id2");
    await advance();
    expect(store.get()).toMatchObject({ loading: true });

    await advance(20);
    expect(store.get()).toEqual({ data: "id2Value1", loading: false });

    $id.set("id1");
    await advance();
    expect(store.get()).toMatchObject({ data: "id1Value0", loading: true });

    await advance(20);
    expect(store.get()).toEqual({ data: "id1Value2", loading: false });
  });

  test("invalidator drops cache for inactive stores", async () => {
    let counter = 0;
    const fetcher = async () => {
      await delay(10);
      counter++;
      return counter;
    };

    const [makeFetcher] = nanoquery();
    const store = makeFetcher("/api", { fetcher });

    const unsub = store.listen(noop);
    await advance(20);
    expect(store.get()).toEqual({ loading: false, data: 1 });

    unsub();
    store.invalidate();
    await advance();

    store.listen(noop);
    const storeValue = store.get();
    expect(storeValue.loading).toBe(true);
    expect(storeValue.data).toBeUndefined();

    await advance(20);
    expect(store.get().data).toBe(2);
  });

  test("internal nanostores cache is dropped between key changes", async () => {
    const fetcher = async (...keys: (string | number | boolean)[]) => keys[0];

    const $key = atom<string | void>("1");

    const [makeFetcher] = nanoquery();
    const store = makeFetcher([$key, "/api"], { fetcher });

    const unbind = store.listen(noop);
    await advance();

    expect(store.get().data).toBe("1");
    unbind();

    $key.set();

    const events: any[] = [];
    store.listen((v) => events.push(v));

    $key.set("2");
    await advance();

    expect(events[0]).toMatchObject({ loading: false });
    expect(events[1]).toMatchObject({ loading: true });
    expect(events[1].data).toBeUndefined();
    expect(events[2]).toMatchObject({ data: "2" });
  });

  test("creates interval fetching; disables it once we change key", async () => {
    const $id = atom<string | null>(null);
    const keys = ["/api", "/key/", $id];
    const fetcher = vi
      .fn()
      .mockImplementation(() => new Promise((r) => r(null)));

    const [makeFetcher] = nanoquery();
    const store = makeFetcher(keys, {
      fetcher,
      dedupeTime: 0,
      revalidateInterval: 5,
    });
    const unsub = store.listen(() => null);
    $id.set("");
    await advance();
    expect(fetcher).toHaveBeenCalledOnce();
    await advance(5);
    await advance(5);
    await advance(5);
    await advance(5);
    expect(fetcher).toHaveBeenCalledTimes(5);
    $id.set(null);
    await advance(5);
    await advance(5);
    await advance(5);
    await advance(5);
    expect(fetcher).toHaveBeenCalledTimes(5);
    unsub();
  });

  test("do not set store state for delayed request if current key has already changed", async () => {
    const $id = atom<string | null>("one");

    const keys = ["/api", "/key", $id];

    // Fetcher executes 500ms the first time and 100ms the second time it's invoked
    let i = 0;
    const fetcher = vi.fn().mockImplementation(async () => {
      await delay(i === 0 ? 500 : 100);
      i++;
      return { counter: i };
    });

    const [makeFetcher] = nanoquery();
    const store = makeFetcher(keys, { fetcher });
    store.listen(noop);

    expect(store.get()).toMatchObject({ loading: true });
    await advance(100);
    $id.set("two");
    for (let i = 0; i < 5; i++) {
      await advance();
    }
    expect(store.get()).toMatchObject({ loading: true });
    await advance(600);
    await advance(600);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(store.get()).toEqual({ data: { counter: 2 }, loading: false });
    $id.set("one");

    await advance();
    expect(store.get()).toEqual({ data: { counter: 1 }, loading: false });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test("onError handler is called whenever error happens", async () => {
    const keys = ["/api", "/key"];

    const errInstance = new Error();

    const fetcher = vi.fn().mockImplementation(async () => {
      throw errInstance;
    });

    const onErrorContext = vi.fn();

    const [makeFetcher] = nanoquery({ onError: onErrorContext });
    {
      const store = makeFetcher(keys, { fetcher, dedupeTime: 0 });
      store.listen(noop);

      await advance();
      expect(onErrorContext).toBeCalledTimes(1);
      expect(onErrorContext.mock.lastCall?.[0]).toBe(errInstance);
    }
    {
      const onError = vi.fn();
      const store = makeFetcher(keys, { fetcher, dedupeTime: 0, onError });
      store.listen(noop);

      await advance();
      expect(onErrorContext).toBeCalledTimes(1);
      expect(onError).toBeCalledTimes(1);
      expect(onError.mock.lastCall?.[0]).toBe(errInstance);
    }
  });

  test("uses pre-set cache when fetching from a completely new context", async () => {
    const keys = ["/api", "/key"];
    const fetcher = vi.fn();

    const now = new Date().getTime();
    const cache = new Map(),
      initial = { data: "old data", created: now, expires: now + 1000 };
    cache.set(keys.join(""), initial);

    const [makeFetcher] = nanoquery({ fetcher, cache });
    const $store = makeFetcher(keys);
    $store.subscribe(noop);
    await advance();

    expect($store.value).toMatchObject({ loading: false, data: initial.data });
    expect(fetcher).toHaveBeenCalledTimes(0);
  });

  test("`cacheLifetime` higher than `dedupeTime` leads to stale cache showing despite running fetcher function", async () => {
    let callCount = 0;

    const fetcher = vi.fn().mockImplementation(async (key) => {
      await delay(10);
      return key + callCount++;
    });
    const [makeFetcher] = nanoquery({
      fetcher,
      cacheLifetime: 2000,
      dedupeTime: 100,
    });

    const $key = atom("a");
    const $fetcher = makeFetcher([$key]);
    $fetcher.listen(noop);

    await advance();
    await advance(10);
    await advance(10);
    expect($fetcher.value).toMatchObject({ loading: false, data: "a0" });

    $key.set("b");
    await advance();
    await advance(10);
    await advance(10);
    expect($fetcher.value).toMatchObject({ loading: false, data: "b1" });
    await advance(100);
    await advance(100);

    // Dedupe time has passed, but cache lifetime is still ok!
    $key.set("a");
    await advance();
    expect($fetcher.value).toMatchObject({ loading: true, data: "a0" });
    await advance(100);
    await advance(100);
    expect($fetcher.value).toMatchObject({ loading: false, data: "a2" });

    // Both dedupe time and cache lifetime are way past
    await advance(50000);
    $key.set("b");
    await advance();
    expect($fetcher.value!.loading).toBe(true);
    expect($fetcher.value!.data).toBeUndefined();
    await advance(100);
    await advance(100);
    expect($fetcher.value).toMatchObject({ loading: false, data: "b3" });
  });

  test("error responses are deduplicated just like data ones", async () => {
    const err = new Error();

    const fetcher = vi.fn().mockImplementation(async () => {
      await delay(10);
      throw err;
    });

    const onErrorRetry = vi
      .fn()
      .mockImplementation(({ retryCount }) => retryCount * 1000);

    const [makeFetcher] = nanoquery({
      fetcher,
      onErrorRetry,
      dedupeTime: 100,
    });
    const $key = atom("a");
    const $fetcher = makeFetcher([$key]);
    let unsub = $fetcher.listen(noop);
    await advance();

    expect($fetcher.value).toMatchObject({ loading: true });
    await advance(10);
    await advance(10);
    await advance(10);

    expect($fetcher.value).toEqual({ loading: false, error: err });
    unsub();
    await advance(10);
    await advance(10);

    unsub = $fetcher.listen(noop);
    await advance();
    // Cached!
    expect($fetcher.value).toEqual({ loading: false, error: err });
    unsub();
  });

  test("`onErrorRetry` works", async () => {
    const error = new Error();
    let throwError = true;

    const fetcher = vi.fn().mockImplementation(async (key) => {
      await delay(10);
      if (throwError) throw error;

      return key;
    });

    const onErrorRetry = vi
      .fn()
      .mockImplementation(({ retryCount }) => retryCount * 1000);

    const [makeFetcher] = nanoquery({ fetcher, onErrorRetry, dedupeTime: 0 });
    const $fetcher = makeFetcher("/key");
    $fetcher.listen(noop);

    await advance();
    expect($fetcher.value?.loading).toBe(true);
    await advance(10);
    await advance(10);
    await advance(10);
    expect(onErrorRetry).toBeCalledTimes(1);
    expect(onErrorRetry).toHaveBeenLastCalledWith(expect.objectContaining({ retryCount: 1 }));
    expect($fetcher.value).toEqual({ loading: false, error });
    await advance(980);
    expect($fetcher.value?.loading).toBe(true);
    expect($fetcher.value?.error).toBeUndefined();
    await advance(10);
    await advance(10);
    expect(onErrorRetry).toBeCalledTimes(2);
    expect(onErrorRetry).toHaveBeenLastCalledWith(expect.objectContaining({ retryCount: 2 }));
    expect($fetcher.value).toEqual({ loading: false, error });

    onErrorRetry.mockClear();
    throwError = false;
    await advance(2000);
    await advance();
    await advance();
    expect($fetcher.value).toEqual({ loading: false, data: "/key" });

    throwError = true;
    $fetcher.revalidate();
    await advance();
    await advance(20);
    await advance(20);
    expect(onErrorRetry).toBeCalledTimes(1);
    expect(onErrorRetry).toHaveBeenLastCalledWith(expect.objectContaining({ retryCount: 1 }));
    expect($fetcher.value).toEqual({ loading: false, error, data: "/key" });
    throwError = false;

    // Notice that retryCount was reset!
    await advance(980);
    await advance(100);
    await advance(100);
    expect($fetcher.value).toEqual({ loading: false, data: "/key" });
  });
});

describe("refetch logic", () => {
  test("refetches on focus and reconnect", async () => {
    const keys = ["/api", "/key"];
    let count = 0;
    const fetcher = vi.fn().mockImplementation(async () => count++);

    const [makeFetcher] = nanoquery();
    const store = makeFetcher(keys, {
      fetcher,
      revalidateOnReconnect: true,
      revalidateOnFocus: true,
      dedupeTime: 0,
    });
    store.listen(noop);
    await advance();
    dispatchEvent(new Event("online"));
    await advance();
    dispatchEvent(new Event("online"));
    await advance();
    Object.defineProperty(document, "hidden", {
      value: false,
      writable: true,
    });
    dispatchEvent(new Event("visibilitychange"));
    await advance();
    dispatchEvent(new Event("visibilitychange"));
    await advance();

    expect(fetcher).toHaveBeenCalledTimes(5);
  });

  test(`interval doesn't fire when we're out of focus`, async () => {
    const keys = ["/api", "/key"];
    let count = 0;
    const fetcher = vi.fn().mockImplementation(async () => count++);

    const [makeFetcher] = nanoquery();
    const store = makeFetcher(keys, {
      fetcher,
      revalidateInterval: 5,
      dedupeTime: 0,
    });

    store.listen(noop);

    await advance(5);
    await advance(5);
    await advance(5);
    expect(fetcher).toHaveBeenCalledTimes(3);
    Object.defineProperty(document, "hidden", {
      value: true,
      writable: true,
    });
    dispatchEvent(new Event("visibilitychange"));
    await advance(5);
    await advance(5);
    await advance(5);
    (document as any).hidden = false;
    expect(fetcher).toHaveBeenCalledTimes(3);
    dispatchEvent(new Event("visibilitychange"));
    await advance(5);
    await advance(5);
    await advance(5);
    expect(fetcher).toHaveBeenCalledTimes(6);
  });

  test("store isn't updated if data has a stable identity", async () => {
    const keys = ["/api", "/key"];

    let data = {};
    const fetcher = vi.fn().mockImplementation(async () => data);

    const [makeFetcher] = nanoquery();
    const store = makeFetcher(keys, {
      fetcher,
      revalidateOnFocus: true,
      revalidateInterval: 100,
      dedupeTime: 2e200,
    });

    const listener = vi.fn();
    store.listen(listener);

    await advance();
    expect(store.get()).toEqual({ data: {}, loading: false });
    expect(listener).toHaveBeenCalledTimes(2);
    // Forcing lots of events
    for (let i = 0; i < 10; i++) {
      dispatchEvent(new Event("focus"));
      await advance(200);
    }
    expect(listener).toHaveBeenCalledTimes(2);
  });

  test("store doesn't reset its value after getting a revalidate/invalidate trigger if it has an active subscriber", async () => {
    let count = 0;
    const fetcher = vi.fn().mockImplementation(async () => {
      await delay(10);
      return count++;
    });
    const [makeFetcher] = nanoquery({
      fetcher,
      dedupeTime: 100,
      cacheLifetime: 100,
    });

    const $store = makeFetcher("/key");
    $store.listen(noop);
    await advance(10);
    await advance(10);
    await advance(10);
    expect($store.value).toMatchObject({ data: 0, loading: false });
    $store.revalidate();
    await advance(0);
    expect($store.value).toMatchObject({ loading: true, data: 0 });
    await advance(10);
    await advance(10);
    expect($store.value).toMatchObject({ loading: false, data: 1 });
    $store.invalidate();
    expect($store.value?.loading).toBe(true);
    expect($store.value?.data).toBeUndefined();
    await advance(10);
    await advance(10);
    expect($store.value).toMatchObject({ loading: false, data: 2 });
  });

  test("", async () => {
    //
  });
});

describe("mutator tests", () => {
  describe("mutator", () => {
    test("correct transitions", async () => {
      const [, makeMutator] = nanoquery();
      const $mutate = makeMutator<void, string>(async () => "hey");
      $mutate.listen(noop);

      const { mutate } = $mutate.get();
      expect($mutate.get().loading).toBeFalsy();
      const pr = mutate();
      expect($mutate.get().loading).toBeTruthy();
      await advance();
      expect($mutate.get().loading).toBeFalsy();
      expect($mutate.get().data).toBe("hey");

      return pr;
    });

    test("mutator unsets its value after last subscriber stops listening", async () => {
      const [, makeMutator] = nanoquery();
      const $mutate = makeMutator<void, string>(async () => "hey");
      const unsub = $mutate.listen(noop);
      await $mutate.mutate();
      expect($mutate.value?.loading).toBeFalsy();
      expect($mutate.value?.data).toBe("hey");

      unsub();
      expect($mutate.value?.data).toBeUndefined();
    });

    test("client-side idempotency of mutation calls", async () => {
      const [, makeMutator] = nanoquery();
      const mock = vi.fn().mockImplementation(async () => {
        await delay(100);
        return "ok";
      });

      const $mutate = makeMutator<void, string>(mock);
      $mutate.listen(noop);

      expect($mutate.value!.loading).toBeFalsy();
      for (let i = 0; i < 5; i++) {
        $mutate.mutate();
        expect($mutate.value!.loading).toBeTruthy();
        await advance(20);
      }

      await advance(200);
      expect($mutate.value!.loading).toBeFalsy();
      expect($mutate.value!.data).toBe("ok");

      expect(mock).toHaveBeenCalledOnce();
    });

    test("client-side idempotency of mutation calls can be toggled off", async () => {
      const [, makeMutator] = nanoquery();
      const mock = vi.fn().mockImplementation(async () => {
        await delay(100);
        return "ok";
      });

      const $mutate = makeMutator<void, string>(mock, { throttleCalls: false });
      $mutate.listen(noop);

      expect($mutate.value!.loading).toBeFalsy();
      for (let i = 0; i < 5; i++) {
        $mutate.mutate();
        expect($mutate.value!.loading).toBeTruthy();
        await advance(20);
      }

      await advance(200);
      expect($mutate.value!.loading).toBeFalsy();
      expect($mutate.value!.data).toBe("ok");

      expect(mock).toHaveBeenCalledTimes(5);
    });

    test(`transitions work if you're not subscribed to the store`, async () => {
      const [, makeMutator] = nanoquery();
      const $mutate = makeMutator<void, string>(async () => "hey");
      $mutate.listen(noop);

      const pr = $mutate.mutate();
      await advance();
      const res = $mutate.get();
      expect(res.loading).toBeFalsy();
      expect(res.data).toBe("hey");

      return pr;
    });

    test("invalidates keys; invalidation ignores dedupe; invalidation ignores cache; always invalidates after running mutation", async () => {
      let counter = 0,
        counter2 = 0;
      const fetcher = vi.fn().mockImplementation(async () => counter++);
      const fetcher2 = vi.fn().mockImplementation(async () => counter2++);

      const keyParts = ["/api", "/key"],
        keyParts2 = ["/api", "/key2"];

      const [makeFetcher, makeMutator] = nanoquery();
      const $data = makeFetcher(keyParts, { fetcher, dedupeTime: 2e20 });
      const $data2 = makeFetcher(keyParts2, {
        fetcher: fetcher2,
        dedupeTime: 2e20,
      });
      $data.listen(noop);
      $data2.listen(noop);

      let fetcherCallCountAfterInvalidation = -1,
        fetcher2CallCountAfterInvalidation = -1;
      const mutator = vi.fn().mockImplementation(({ invalidate }) => {
        invalidate((key: string) => key === keyParts.join(""));
        invalidate(keyParts2.join(""));

        fetcherCallCountAfterInvalidation = fetcher.mock.calls.length;
        fetcher2CallCountAfterInvalidation = fetcher2.mock.calls.length;
      });

      const $mutate = makeMutator<string>(mutator);
      $mutate.listen(noop);

      await advance();
      const { mutate } = $mutate.get();
      await mutate("hey");
      expect(fetcherCallCountAfterInvalidation).toBe(1);
      expect(fetcher2CallCountAfterInvalidation).toBe(1);
      await advance();

      expect(mutator.mock.calls[0][0].data).toBe("hey");

      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(fetcher2).toHaveBeenCalledTimes(2);
    });

    test("local mutation; invalidation afterwards", async () => {
      let counter = 0;
      const fetcher = vi.fn().mockImplementation(async () => counter++);

      const keyParts = ["/api", "/key"];

      const [makeFetcher, makeMutator] = nanoquery();
      const store = makeFetcher(keyParts, { fetcher, dedupeTime: 2e20 });
      store.listen(noop);

      const $mutate = makeMutator<string>(async ({ getCacheUpdater, data }) => {
        try {
          const [mutateCache, prevData] = getCacheUpdater(keyParts.join(""));
          expect(prevData).toBe(0);
          mutateCache(data);
        } catch (error) {
          console.error(error);
        }
      });
      $mutate.listen(noop);

      await advance(10);
      expect(store.get()).toEqual({ loading: false, data: 0 });

      await $mutate.mutate("hey");
      expect(store.value).toMatchObject({
        loading: true,
        data: "hey",
      });

      await advance();
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(store.get()).toEqual({ loading: false, data: 1 });
    });

    test("global onError handler is called whenever error happens", async () => {
      const errInstance = new Error();

      const fetcher = vi.fn().mockImplementation(async () => {
        throw errInstance;
      });

      const onErrorContext = vi.fn();

      const [, makeMutator] = nanoquery({ onError: onErrorContext });
      const store = makeMutator(fetcher);
      store.listen(noop);

      const { mutate } = store.get();
      await mutate();

      await advance();
      expect(onErrorContext).toBeCalledTimes(1);
      expect(onErrorContext.mock.lastCall?.[0]).toBe(errInstance);
    });

    test("global onError handler is not called when local onError is set", async () => {
      const errInstance = new Error();
      const fetcher = vi.fn().mockImplementation(async () => {
        throw errInstance;
      });
      const globalOnErrorContext = vi.fn(),
        localOnErrorContext = vi.fn();

      const [, makeMutator] = nanoquery({ onError: globalOnErrorContext });
      const store = makeMutator(fetcher, { onError: localOnErrorContext });
      await store.mutate();
      await advance();
      expect(globalOnErrorContext).toHaveBeenCalledTimes(0);
      expect(localOnErrorContext).toHaveBeenCalledOnce();
      expect(localOnErrorContext.mock.lastCall?.[0]).toBe(errInstance);
    });
  });

  test("local mutation; invalidation disabled", async () => {
    let counter = 0;
    const fetcher = vi.fn().mockImplementation(async () => counter++);

    const keyParts = ["/api", "/key"];

    const [makeFetcher, makeMutator] = nanoquery();
    const store = makeFetcher(keyParts, { fetcher, dedupeTime: 2e20 });
    store.listen(noop);

    const $mutate = makeMutator<string>(async ({ getCacheUpdater, data }) => {
      try {
        expect(data).toBe("hey");
        const [mutateCache, prevData] = getCacheUpdater(
          keyParts.join(""),
          false
        );
        expect(prevData).toBe(0);
        mutateCache("mutated manually");
      } catch (error) {
        console.error(error);
      }
    });
    $mutate.listen(noop);

    await advance(10);
    expect(store.get()).toEqual({ loading: false, data: 0 });

    const { mutate } = $mutate.get();
    await mutate("hey");
    expect(store.get()).toEqual({ loading: false, data: "mutated manually" });

    await advance();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(store.get()).toEqual({ loading: false, data: "mutated manually" });
  });

  test("settings override works for mutators", async () => {
    const fetcher1 = vi.fn().mockImplementation(async () => null);
    const fetcher2 = vi.fn().mockImplementation(async () => null);

    const [, makeMutator, { __unsafeOverruleSettings }] = nanoquery();
    const $mutate = makeMutator(fetcher1);
    __unsafeOverruleSettings({ fetcher: fetcher2 });

    $mutate.listen(noop);
    await advance();
    const { mutate } = $mutate.get();
    await mutate();
    await advance();
    expect(fetcher1).toBeCalledTimes(0);
    expect(fetcher2).toBeCalledTimes(1);
  });
});

describe("global invalidator and mutator", () => {
  test("global invalidator works", async () => {
    const fetcher = vi.fn().mockImplementation(async () => true);

    const keys = ["/api", "/key"];

    const [makeFetcher, , { invalidateKeys }] = nanoquery();
    const store = makeFetcher(keys, { fetcher });
    store.listen(noop);

    await advance();
    expect(fetcher).toBeCalledTimes(1);
    invalidateKeys(keys.join(""));
    await advance();
    expect(fetcher).toBeCalledTimes(2);
    invalidateKeys([keys.join("")]);
    await advance();
    expect(fetcher).toBeCalledTimes(3);
    invalidateKeys((key) => key === "/api/key");
    await advance();
    expect(fetcher).toBeCalledTimes(4);
    invalidateKeys("incorrect");
    invalidateKeys(["incorrect"]);
    invalidateKeys(() => false);
    await advance();
    expect(fetcher).toBeCalledTimes(4);
  });

  test("global mutation works", async () => {
    const fetcher = vi.fn().mockImplementation(async () => true);

    const keys = ["/api", "/key"];

    const [makeFetcher, , { mutateCache }] = nanoquery();
    const store = makeFetcher(keys, { fetcher });
    store.listen(noop);

    await advance();
    expect(store.get().data).toBe(true);

    mutateCache(keys.join(""), 1);
    await advance();
    expect(store.get().data).toBe(1);

    mutateCache([keys.join("")], 2);
    await advance();
    expect(store.get().data).toBe(2);

    mutateCache((key) => key === "/api/key", 3);
    await advance();
    expect(store.get().data).toBe(3);

    mutateCache("incorrect", 123);
    mutateCache(["incorrect"], 123);
    mutateCache(() => false, 123);
    await advance();
    expect(store.get().data).toBe(3);
    expect(fetcher).toBeCalledTimes(1);
  });

  test("global mutation treats undefined as an instruction to wipe key", async () => {
    const fetcher = vi.fn().mockImplementation(async () => true);

    const keys = ["/api", "/key"];

    const [makeFetcher, , { mutateCache }] = nanoquery({ dedupeTime: 2e20 });
    const store = makeFetcher(keys, { fetcher });
    store.listen(noop);

    await advance();
    expect(store.get().data).toBe(true);

    mutateCache(keys.join(""));
    await advance();
    expect(store.get().data).toBe(void 0);
    store.listen(noop);

    await advance();
    expect(store.get().data).toBe(true);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

/**
 * We use advance wrapped with promises, because we heavily rely on ticks
 * in the library itself to propagate cached values, set initial values
 * reliably, etc.
 */
async function advance(ms = 0) {
  // I don't know what I'm doing ¯\_(ツ)_/¯
  await new Promise<void>((r) => r());
  await new Promise<void>((r) => r());
  vi.advanceTimersByTime(ms);
  await new Promise<void>((r) => r());
  await new Promise<void>((r) => r());
}
