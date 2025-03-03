import type { GraffitiSession } from "@graffiti-garden/api";
import type { GraffitiLocation } from "@graffiti-garden/api";
import type { Graffiti } from "@graffiti-garden/api";
import { unpackLocationOrUri } from "@graffiti-garden/implementation-local/utilities";

type GraffitiBase = Pick<
  Graffiti,
  | "get"
  | "put"
  | "patch"
  | "delete"
  | "discover"
  | "recoverOrphans"
  | "channelStats"
>;

export class GraffitiRemoteAndLocal implements GraffitiBase {
  protected readonly localGraffiti: GraffitiBase;
  protected readonly remoteGraffiti: GraffitiBase;
  constructor(localGraffiti: GraffitiBase, remoteGraffiti: GraffitiBase) {
    this.localGraffiti = localGraffiti;
    this.remoteGraffiti = remoteGraffiti;
  }

  protected isRemoteSession(session?: GraffitiSession | null) {
    return session && session.actor.startsWith("http") && "fetch" in session;
  }
  protected isRemoteLocation(locationOrUri: string | GraffitiLocation) {
    const { location, uri } = unpackLocationOrUri(locationOrUri);
    return location.source.startsWith("http");
  }

  get: Graffiti["get"] = async (...args) => {
    const [locationOrUri, schema, session] = args;
    if (this.isRemoteLocation(locationOrUri)) {
      return this.remoteGraffiti.get<typeof schema>(
        locationOrUri,
        schema,
        this.isRemoteSession(session) ? session : undefined,
      );
    } else {
      return this.localGraffiti.get<typeof schema>(...args);
    }
  };

  put: Graffiti["put"] = (...args) => {
    const [_, session] = args;
    if (this.isRemoteSession(session)) {
      return this.remoteGraffiti.put<{}>(...args);
    } else {
      return this.localGraffiti.put<{}>(...args);
    }
  };

  delete: Graffiti["delete"] = (...args) => {
    const [_, session] = args;
    if (this.isRemoteSession(session)) {
      return this.remoteGraffiti.delete(...args);
    } else {
      return this.localGraffiti.delete(...args);
    }
  };

  patch: Graffiti["patch"] = (...args) => {
    const [_, __, session] = args;
    if (this.isRemoteSession(session)) {
      return this.remoteGraffiti.patch(...args);
    } else {
      return this.localGraffiti.patch(...args);
    }
  };

  discover: Graffiti["discover"] = (...args) => {
    const [channels, schema, session] = args;
    const localIterator = this.localGraffiti.discover(...args);
    const remoteIterator = this.remoteGraffiti.discover(
      channels,
      schema,
      this.isRemoteSession(session) ? session : undefined,
    );

    return {
      next: async () => {
        const localResult = await localIterator.next();
        if (localResult.done) {
          return remoteIterator.next();
        } else {
          return localResult;
        }
      },
      return: remoteIterator.return,
      throw: remoteIterator.throw,
      [Symbol.asyncIterator]() {
        return this;
      },
      async [Symbol.asyncDispose]() {
        return;
      },
    };
  };

  recoverOrphans: Graffiti["recoverOrphans"] = (...args) => {
    if (this.isRemoteSession(args[1])) {
      return this.remoteGraffiti.recoverOrphans<(typeof args)[0]>(...args);
    } else {
      return this.localGraffiti.recoverOrphans<(typeof args)[0]>(...args);
    }
  };

  channelStats: Graffiti["channelStats"] = (...args) => {
    if (this.isRemoteSession(args[0])) {
      return this.remoteGraffiti.channelStats(...args);
    } else {
      return this.localGraffiti.channelStats(...args);
    }
  };
}
