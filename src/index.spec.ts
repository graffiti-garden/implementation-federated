import { it, expect } from "vitest";
import {
  randomString,
  randomLocation as randomGenericLocation,
  randomValue,
  solidLogin,
} from "./test-utils";
import GraffitiClient, { GraffitiObject, GraffitiPatch } from ".";

const { fetch, webId } = await solidLogin();

const homePod = "http://localhost:3000//";
const randomLocation = () => randomGenericLocation(webId, homePod);

it("Put, replace, delete", async () => {
  const value = {
    something: "hello, world~ c:",
  };
  const location = randomLocation();
  const graffiti = new GraffitiClient();
  const previous = await graffiti.put({ value, channels: [] }, location, {
    fetch,
  });
  expect(previous.value).toBeNull();
  expect(previous.name).toEqual(location.name);
  expect(previous.webId).toEqual(location.webId);
  expect(previous.pod).toEqual(location.pod);
  const gotten = await graffiti.get(location);
  expect(gotten.value).toEqual(value);
  expect(gotten.channels).toEqual([]);
  expect(gotten.acl).toBeUndefined();
  expect(gotten.name).toEqual(location.name);
  expect(gotten.webId).toEqual(location.webId);
  expect(gotten.pod).toEqual(location.pod);
  expect(gotten.lastModified.getTime()).toBe(previous.lastModified.getTime());

  // Replace it and get again
  const newValue = {
    something: "goodbye, world~ c:",
  };
  const beforeReplaced = await graffiti.put(
    { value: newValue, channels: [] },
    location,
    {
      fetch,
    },
  );
  expect(beforeReplaced.value).toEqual(value);
  expect(beforeReplaced.tombstone).toBe(true);
  expect(beforeReplaced).toMatchObject(location);
  const afterReplaced = await graffiti.get(location);
  expect(afterReplaced.value).toEqual(newValue);
  expect(afterReplaced.lastModified.getTime()).toEqual(
    beforeReplaced.lastModified.getTime(),
  );

  // Finally, delete
  const beforeDeleted = await graffiti.delete(location, { fetch });
  expect(beforeDeleted.value).toEqual(newValue);
  expect(beforeDeleted.tombstone).toBe(true);
  expect(beforeDeleted).toMatchObject(location);
  expect(beforeDeleted.lastModified.getTime()).toBeGreaterThan(
    afterReplaced.lastModified.getTime(),
  );
  await expect(graffiti.get(location)).rejects.toThrow();
});

it("put and get with access control", async () => {
  const graffiti = new GraffitiClient();
  const location = randomLocation();
  const value = {
    um: "hi",
  };
  await graffiti.put(
    {
      value,
      acl: [],
      channels: ["helloooo"],
    },
    location,
    { fetch },
  );

  // Get it with authenticated fetch
  const gotten = await graffiti.get(location, { fetch });
  expect(gotten.value).toEqual(value);

  // But not with plain fetch
  await expect(graffiti.get(location)).rejects.toThrow();
});

it("patch value", async () => {
  const graffiti = new GraffitiClient();
  const location = randomLocation();
  const value = {
    something: "hello, world~ c:",
  };
  await graffiti.put({ value, channels: [] }, location, { fetch });
  const put = await graffiti.get(location);

  const patch: GraffitiPatch = {
    value: [{ op: "replace", path: "/something", value: "goodbye, world~ c:" }],
  };
  const beforePatched = await graffiti.patch(patch, location, { fetch });
  expect(beforePatched.value).toEqual(put.value);
  expect(beforePatched.tombstone).toBe(true);
  const gotten = await graffiti.get(location);
  expect(gotten.value).toEqual({
    something: "goodbye, world~ c:",
  });
  expect(beforePatched.lastModified.getTime()).toBe(
    gotten.lastModified.getTime(),
  );
  await graffiti.delete(location, { fetch });
});

it("patch channels", async () => {
  const graffiti = new GraffitiClient();
  const location = randomLocation();
  await graffiti.put({ value: {}, channels: ["helloooo"] }, location, {
    fetch,
  });

  const patch: GraffitiPatch = {
    channels: [{ op: "replace", path: "/0", value: "goodbye" }],
  };
  await graffiti.patch(patch, location, { fetch });
  const gotten = await graffiti.get(location, { fetch });
  expect(gotten.channels).toEqual(["goodbye"]);
  await graffiti.delete(location, { fetch });
});

it("query with no pods", async () => {
  const graffiti = new GraffitiClient();
  const location = randomLocation();
  const value = randomValue();
  const channels = [randomString(), randomString()];
  await graffiti.put({ value, channels }, location, { fetch });

  const iterator = graffiti.discover(channels, { fetch, pods: [] });
  const result = await iterator.next();
  expect(result.done).toBe(true);
});

it("query single", async () => {
  const graffiti = new GraffitiClient();
  const location = randomLocation();
  const value = randomValue();
  const channels = [randomString(), randomString()];

  await graffiti.put({ value, channels }, location, { fetch });

  const iterator = graffiti.discover(channels, { fetch, pods: [homePod] });
  const result = await iterator.next();
  expect(result.done).toBe(false);
  if (result.value?.error) throw new Error();
  expect(result.value?.value.value).toEqual(value);
  const result2 = await iterator.next();
  expect(result2.done).toBe(true);
});

it("query with good and bad pods", async () => {
  const graffiti = new GraffitiClient();
  const location = randomLocation();
  const value = randomValue();
  const channels = [randomString(), randomString()];
  await graffiti.put({ value, channels }, location, { fetch });

  const iterator = graffiti.discover(channels, {
    fetch,
    pods: [
      "https://google.com",
      "asldkfj",
      "https://alsdkfjkjdkfjdkjfk.askdfjkdjk",
      homePod,
    ],
  });
  const results: Awaited<ReturnType<typeof iterator.next>>[] = [];
  for (let i = 0; i < 4; i++) {
    results.push(await iterator.next());
  }
  results.forEach((result) => expect(result.done).toBe(false));
  const errors = results.filter((result) => result.value?.error);
  expect(errors.length).toBe(3);
  const notErrors = results.filter((result) => !result.value?.error);
  expect(notErrors.length).toBe(1);
  if (notErrors[0].value?.error) throw new Error();
  expect(notErrors[0].value?.value.value).toEqual(value);
  expect(await iterator.next()).toHaveProperty("done", true);
});

it("query multiple", async () => {
  const graffiti = new GraffitiClient();
  const channels = [randomString(), randomString()];
  const values = [randomValue(), randomValue()];
  await graffiti.put({ value: values[0], channels }, randomLocation(), {
    fetch,
  });
  await graffiti.put({ value: values[1], channels }, randomLocation(), {
    fetch,
  });
  const iterator = graffiti.discover(channels, { fetch, pods: [homePod] });
  const result1 = await iterator.next();
  if (result1.value?.error) throw new Error();
  expect(result1.value?.value.value).toEqual(values[1]);
  const result2 = await iterator.next();
  if (result2.value?.error) throw new Error();
  expect(result2.value?.value.value).toEqual(values[0]);
  const result3 = await iterator.next();
  expect(result3.done).toBe(true);
});

it("invalid query", async () => {
  const graffiti = new GraffitiClient();
  const iterator = graffiti.discover([], {
    pods: [homePod],
    fetch,
    schema: {
      asdf: {},
    },
  });
  const result = await iterator.next();
  expect(result.value?.error).toBe(true);
  expect(await iterator.next()).toHaveProperty("done", true);
});

it("query with actual query", async () => {
  const graffiti = new GraffitiClient();
  const channels = [randomString(), randomString()];
  const values = [randomValue(), randomValue()];
  for (const value of values) {
    await graffiti.put({ value, channels }, randomLocation(), { fetch });
  }
  // Query for the first value
  const iterator = graffiti.discover(channels, {
    pods: [homePod],
    fetch,
    schema: {
      properties: {
        value: {
          required: Object.keys(values[0]),
        },
      },
    },
  });
  const result1 = await iterator.next();
  if (result1.value?.error) throw new Error();
  expect(result1.value?.value.value).toEqual(values[0]);
  const result2 = await iterator.next();
  expect(result2.done).toBe(true);
});

it("query with last modified", async () => {
  const graffiti = new GraffitiClient();
  const location = randomLocation();
  const channels = [randomString(), randomString()];
  await graffiti.put({ value: randomValue(), channels }, location, { fetch });
  const lastModified = (await graffiti.get(location)).lastModified;

  const value = randomValue();
  const location2 = randomLocation();
  await graffiti.put({ value, channels }, location2, { fetch });
  const lastModified2 = (await graffiti.get(location2)).lastModified;
  expect(lastModified.getTime()).toBeLessThan(lastModified2.getTime());

  const iterator = graffiti.discover(channels, {
    pods: [homePod],
    fetch,
    ifModifiedSince: new Date(lastModified.getTime() + 1),
  });
  const result1 = await iterator.next();
  if (result1.value?.error) throw new Error();
  expect(result1.value?.value.value).toEqual(value);
  const result2 = await iterator.next();
  expect(result2.done).toBe(true);
});

it("query with skip", async () => {
  const graffiti = new GraffitiClient();
  const channels = [randomString(), randomString()];
  for (let i = 9; i >= 0; i--) {
    await graffiti.put({ value: { index: i }, channels }, randomLocation(), {
      fetch,
    });
  }

  {
    const iterator = graffiti.discover(channels, {
      pods: [homePod],
      fetch,
      skip: 5,
    });
    for (let i = 0; i < 5; i++) {
      const result = await iterator.next();
      if (result.value?.error) throw new Error();
      expect(result.value?.value.value).toEqual({ index: i + 5 });
    }
    const result = await iterator.next();
    expect(result.done).toBe(true);
  }

  {
    const iterator = graffiti.discover(channels, {
      pods: [homePod],
      fetch,
      skip: 0,
    });
    for (let i = 0; i < 10; i++) {
      const result = await iterator.next();
      if (result.value?.error) throw new Error();
      expect(result.value?.value.value).toEqual({ index: i });
    }
    const result = await iterator.next();
    expect(result.done).toBe(true);
  }

  {
    const iterator = graffiti.discover(channels, {
      pods: [homePod],
      fetch,
      skip: 10,
    });
    const result = await iterator.next();
    expect(result.done).toBe(true);
  }
});

it("bad skip", async () => {
  const graffiti = new GraffitiClient();
  const iterator = graffiti.discover([], {
    pods: [homePod],
    fetch,
    skip: -10,
  });
  await expect(iterator.next()).rejects.toThrow();
});

it("bad limit", async () => {
  const graffiti = new GraffitiClient();
  const iterator = graffiti.discover([], {
    pods: [homePod],
    fetch,
    limit: -10,
  });
  await expect(iterator.next()).rejects.toThrow();
  const iterator2 = graffiti.discover([], {
    pods: [homePod],
    fetch,
    limit: 0,
  });
  await expect(iterator2.next()).rejects.toThrow();
});

it("query with limit", async () => {
  const graffiti = new GraffitiClient();
  const channels = [randomString(), randomString()];
  for (let i = 9; i >= 0; i--) {
    await graffiti.put({ value: { index: i }, channels }, randomLocation(), {
      fetch,
    });
  }

  const iterator = graffiti.discover(channels, {
    pods: [homePod],
    fetch,
    limit: 5,
  });
  for (let i = 0; i < 5; i++) {
    const result = await iterator.next();
    if (result.value?.error) throw new Error();
    expect(result.value?.value.value).toEqual({ index: i });
  }
  const result = await iterator.next();
  expect(result.done).toBe(true);
});

it("query with skip and limit", async () => {
  const graffiti = new GraffitiClient();
  const channels = [randomString(), randomString()];
  for (let i = 9; i >= 0; i--) {
    await graffiti.put({ value: { index: i }, channels }, randomLocation(), {
      fetch,
    });
  }

  const iterator = graffiti.discover(channels, {
    pods: [homePod],
    fetch,
    skip: 3,
    limit: 5,
  });
  for (let i = 0; i < 5; i++) {
    const result = await iterator.next();
    if (result.value?.error) throw new Error();
    expect(result.value?.value.value).toEqual({ index: i + 3 });
  }
  const result = await iterator.next();
  expect(result.done).toBe(true);
});

it("list orphans", async () => {
  const graffiti = new GraffitiClient();
  const existingOrphans: string[] = [];
  const orphanIterator1 = graffiti.listOrphans({
    fetch,
    webId,
    pods: [homePod],
  });
  for await (const orphan of orphanIterator1) {
    if (orphan.error) continue;
    existingOrphans.push(orphan.value.name);
  }
  const location = randomLocation();
  await graffiti.put({ value: randomValue(), channels: [] }, location, {
    fetch,
  });
  const orphanIterator2 = graffiti.listOrphans({
    fetch,
    webId,
    pods: [homePod],
  });
  let newOrphans: string[] = [];
  for await (const orphan of orphanIterator2) {
    if (orphan.error) continue;
    newOrphans.push(orphan.value.name);
    if (orphan.value.name === location.name) {
      expect(orphan.value.tombstone).toBe(false);
    }
  }
  newOrphans = newOrphans.filter((orphan) => !existingOrphans.includes(orphan));
  expect(newOrphans).toEqual([location.name]);
});

it("list orphans with ifModifiedSince", async () => {
  const graffiti = new GraffitiClient();
  const location = randomLocation();
  await graffiti.put({ value: randomValue(), channels: [] }, location, {
    fetch,
  });
  const gotten = await graffiti.get(location, { fetch });
  const now = gotten.lastModified;
  const orphanIterator = graffiti.listOrphans({
    fetch,
    webId,
    ifModifiedSince: new Date(now.getTime() - 1),
    pods: [homePod],
  });
  const result = await orphanIterator.next();
  if (result.value?.error) throw new Error();
  expect(result.value?.value.name).toEqual(location.name);
  expect(result.value?.value.lastModified.getTime()).toEqual(now.getTime());
  await expect(orphanIterator.next()).resolves.toHaveProperty("done", true);
});

it("deleted orphan", async () => {
  const now = new Date();
  const graffiti = new GraffitiClient();
  const location = randomLocation();
  // Put it, then add a channel to make it no longer an orphan
  await graffiti.put({ value: randomValue(), channels: [] }, location, {
    fetch,
  });
  await graffiti.put(
    { value: randomValue(), channels: ["an actual channel"] },
    location,
    {
      fetch,
    },
  );
  const orphanIterator = graffiti.listOrphans({
    fetch,
    webId,
    ifModifiedSince: now,
    pods: [homePod],
  });
  const result = await orphanIterator.next();
  if (result.value?.error) throw new Error();
  expect(result.value?.value.name).toEqual(location.name);
  expect(result.value?.value.tombstone).toBe(true);
  expect(result.value?.value.lastModified.getTime()).toBeGreaterThan(
    now.getTime(),
  );
  await expect(orphanIterator.next()).resolves.toHaveProperty("done", true);
});

it("list channels", async () => {
  const graffiti = new GraffitiClient();
  const existingChannels: Map<string, number> = new Map();
  const channelIterator1 = graffiti.listChannels({
    fetch,
    webId,
    pods: [homePod],
  });
  for await (const channel of channelIterator1) {
    if (channel.error) continue;
    existingChannels.set(channel.value.channel, channel.value.count);
  }

  const channels = [randomString(), randomString(), randomString()];

  // Add one value to channels[0],
  // two values to both channels[0] and channels[1],
  // three values to all channels
  // one value to channels[2]
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < i + 1; j++) {
      await graffiti.put(
        { value: { index: j }, channels: channels.slice(0, i + 1) },
        randomLocation(),
        { fetch },
      );
    }
  }
  await graffiti.put(
    { value: { index: 3 }, channels: [channels[2]] },
    randomLocation(),
    { fetch },
  );

  const channelIterator2 = graffiti.listChannels({
    fetch,
    webId,
    pods: [homePod],
  });
  let newChannels: Map<string, number> = new Map();
  for await (const channel of channelIterator2) {
    if (channel.error) continue;
    newChannels.set(channel.value.channel, channel.value.count);
  }
  // Filter out existing channels
  newChannels = new Map(
    Array.from(newChannels).filter(
      ([channel, count]) => !existingChannels.has(channel),
    ),
  );
  expect(newChannels.size).toBe(3);
  expect(newChannels.get(channels[0])).toBe(6);
  expect(newChannels.get(channels[1])).toBe(5);
  expect(newChannels.get(channels[2])).toBe(4);
});

it("list channels with ifModifiedSince", async () => {
  const graffiti = new GraffitiClient();
  const channels = [randomString(), randomString(), randomString()];
  let firstPutted: GraffitiObject;
  for (let i = 0; i < 3; i++) {
    const putted = await graffiti.put(
      { value: { index: i }, channels },
      randomLocation(),
      {
        fetch,
      },
    );
    if (i === 0) firstPutted = putted;
  }
  const gotten = await graffiti.get(firstPutted!, { fetch });
  const now = gotten.lastModified;
  const channelIterator = graffiti.listChannels({
    webId,
    fetch,
    ifModifiedSince: now,
  });
  let newChannels: Map<string, number> = new Map();
  for await (const channel of channelIterator) {
    if (channel.error) continue;
    newChannels.set(channel.value.channel, channel.value.count);
  }
  expect(newChannels.size).toBe(3);
  expect(newChannels.get(channels[0])).toBe(3);
  expect(newChannels.get(channels[1])).toBe(3);
  expect(newChannels.get(channels[2])).toBe(3);
});

it("list channels with deleted channel", async () => {
  const graffiti = new GraffitiClient();
  const channels = [randomString(), randomString(), randomString()];
  const location = randomLocation();
  const first = await graffiti.put(
    { value: { index: 0 }, channels },
    location,
    {
      fetch,
    },
  );
  const gotten = await graffiti.get(first, { fetch });
  const now = gotten.lastModified;
  await graffiti.put(
    { value: { index: 1 }, channels: channels.slice(1) },
    location,
    {
      fetch,
    },
  );

  const channelIterator = graffiti.listChannels({
    webId,
    fetch,
    ifModifiedSince: now,
  });
  let newChannels: Map<string, number> = new Map();
  for await (const channel of channelIterator) {
    if (channel.error) continue;
    newChannels.set(channel.value.channel, channel.value.count);
  }
  expect(newChannels.size).toBe(3);
  expect(newChannels.get(channels[0])).toBe(0);
  expect(newChannels.get(channels[1])).toBe(1);
  expect(newChannels.get(channels[2])).toBe(1);
});

it("list with good and bad pods", async () => {
  const graffiti = new GraffitiClient();

  const badPods = [
    "https://google.com",
    "asldkfj",
    "https://alsdkfjkjdkfjdkjfk.askdfjkdjk",
  ];

  const putted = await graffiti.put(
    { value: randomValue(), channels: [] },
    randomLocation(),
    { fetch },
  );
  const deleted = await graffiti.delete(putted, { fetch });
  const now = deleted.lastModified;

  const channelIterator = graffiti.listChannels({
    pods: [...badPods, homePod],
    fetch,
    ifModifiedSince: now,
  });

  const results: Awaited<ReturnType<typeof channelIterator.next>>[] = [];
  for (let i = 0; i < 3; i++) {
    results.push(await channelIterator.next());
  }

  results.forEach((result) => expect(result.value?.error).toBe(true));
  // @ts-ignore
  const pods = results.map((result) => result.value?.pod);
  expect(pods.sort()).toEqual(badPods.sort());

  expect(await channelIterator.next()).toHaveProperty("done", true);
});

it("put with random name", async () => {
  const graffiti = new GraffitiClient();
  const value = randomValue();

  graffiti.setWebId(webId);
  graffiti.setFetch(fetch);
  graffiti.setHomePod(homePod);

  const putted = await graffiti.put({ value, channels: [], acl: [] });
  expect(putted.webId).toBe(webId);
  expect(putted.pod).toBe(homePod);
  expect(putted.name).toHaveLength(32);

  const gotten = await graffiti.get(putted);
  expect(gotten.value).toEqual(value);
});
