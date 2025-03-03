import type {
  GraffitiStream,
  GraffitiLocation,
  GraffitiObjectBase,
} from "@graffiti-garden/api";
import {
  GraffitiErrorForbidden,
  GraffitiErrorInvalidSchema,
  GraffitiErrorNotFound,
  GraffitiErrorPatchError,
  GraffitiErrorPatchTestFailed,
  GraffitiErrorSchemaMismatch,
  GraffitiErrorUnauthorized,
} from "@graffiti-garden/api";

export async function catchResponseErrors(response: Response) {
  if (response.ok) return;
  if (response.status === 410) return;
  let text = await response.text();
  try {
    const error = JSON.parse(text);
    if ("message" in error) {
      text = error.message;
    }
  } catch {}
  const status = response.status;
  if (status === 404) {
    throw new GraffitiErrorNotFound(text);
  } else if (status === 403) {
    throw new GraffitiErrorForbidden(text);
  } else if (status === 401) {
    throw new GraffitiErrorUnauthorized(text);
  } else if (status === 422) {
    if (text.startsWith("PatchError")) {
      throw new GraffitiErrorPatchError(text);
    } else if (text.startsWith("InvalidSchema")) {
      throw new GraffitiErrorInvalidSchema(text);
    }
  } else if (status === 412) {
    if (text.startsWith("PatchTestFailed")) {
      throw new GraffitiErrorPatchTestFailed(text);
    } else if (text.startsWith("SchemaMismatch")) {
      throw new GraffitiErrorSchemaMismatch(text);
    }
  }

  throw new Error(text);
}

export function parseEncodedStringArrayHeader<T>(
  header: string | null | undefined,
  nullValue: T,
): string[] | T {
  if (typeof header !== "string") return nullValue;
  return header
    .split(",")
    .filter((s) => s)
    .map(decodeURIComponent);
}

export async function parseGraffitiObjectResponse(
  response: Response,
  location: GraffitiLocation,
  isGet: boolean = false,
): Promise<GraffitiObjectBase> {
  await catchResponseErrors(response);

  let value: {};
  const text = await response.text();
  try {
    value = JSON.parse(text);
  } catch (e) {
    throw new Error("Received invalid JSON response from server");
  }
  const lastModifiedGMT = response.headers.get("last-modified");
  if (!lastModifiedGMT) {
    throw new Error(
      "Received response from server without Last-Modified header",
    );
  }
  const lastModifiedMs = response.headers.get("last-modified-ms");
  if (!lastModifiedMs) {
    throw new Error(
      "Received response from server without Last-Modified-Ms header",
    );
  }

  const lastModifiedDate = new Date(lastModifiedGMT);
  lastModifiedDate.setUTCMilliseconds(parseInt(lastModifiedMs));
  const lastModified = lastModifiedDate.getTime();
  if (Number.isNaN(lastModified)) {
    throw new Error(
      "Received response from server with invalid Last-Modified header",
    );
  }

  return {
    actor: location.actor,
    source: location.source,
    name: location.name,
    tombstone: !isGet || response.status === 410,
    value,
    channels: parseEncodedStringArrayHeader(
      response.headers.get("channels"),
      [],
    ),
    allowed: parseEncodedStringArrayHeader(
      response.headers.get("allowed"),
      undefined,
    ),
    lastModified,
  };
}

async function parseJSONLine<T>(
  line: string,
  lineParser: (json: {}) => T | Promise<T>,
  source: string,
): Promise<Awaited<ReturnType<GraffitiStream<T, void>["next"]>>["value"]> {
  try {
    const json = JSON.parse(line);
    return {
      value: await lineParser(json),
    };
  } catch (e) {
    return {
      error: e instanceof Error ? e : new Error(),
      source,
    };
  }
}

const decoder = new TextDecoder();
const newLineUint8 = "\n".charCodeAt(0);
export async function* parseJSONLinesResponse<T>(
  response_: Response | Promise<Response>,
  source: string,
  lineParser: (json: {}) => T | Promise<T>,
): GraffitiStream<T, void> {
  const response = await response_;
  await catchResponseErrors(response);
  if (response.status === 204) {
    return;
  }
  if (response.status !== 200) {
    throw new Error(`Unexpected status code from server: ${response.status}`);
  }
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Failed to get a reader from the server's response body");
  }

  let buffer = new Uint8Array();
  while (true) {
    const { value, done } = await reader.read();

    if (value) {
      const concatenated = new Uint8Array(buffer.length + value.length);
      concatenated.set(buffer);
      concatenated.set(value, buffer.length);

      let start = 0;
      let end: number;
      while (start < concatenated.length) {
        end = concatenated.indexOf(newLineUint8, start);
        if (end === -1) break;
        const lineBuffer = concatenated.slice(start, end);
        const line = decoder.decode(lineBuffer);
        yield (await parseJSONLine(line, lineParser, source))!;
        start = end + 1;
      }

      buffer = concatenated.slice(start);
    }

    if (done) break;
  }

  // Clear the buffer
  if (buffer.length) {
    yield (await parseJSONLine(decoder.decode(buffer), lineParser, source))!;
  }
}
