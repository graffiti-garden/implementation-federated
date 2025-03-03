import type Ajv from "ajv";
import type { Graffiti } from "@graffiti-garden/api";
import { GraffitiRemoteCrud } from "./crud";
import { GraffitiRemoteStreamers } from "./streamers";
import type { GraffitiRemoteOptions } from "./types";

export class GraffitiRemoteDatabase
  implements
    Pick<
      Graffiti,
      | "put"
      | "get"
      | "patch"
      | "delete"
      | "discover"
      | "recoverOrphans"
      | "channelStats"
    >
{
  protected readonly crud: GraffitiRemoteCrud;
  protected readonly streamers: GraffitiRemoteStreamers;
  protected readonly options: GraffitiRemoteOptions;
  protected ajv_: Promise<Ajv> | undefined;

  put: Graffiti["put"];
  get: Graffiti["get"];
  patch: Graffiti["patch"];
  delete: Graffiti["delete"];
  discover: Graffiti["discover"];
  recoverOrphans: Graffiti["recoverOrphans"];
  channelStats: Graffiti["channelStats"];

  get ajv() {
    if (!this.ajv_) {
      this.ajv_ = this.options.ajv
        ? Promise.resolve(this.options.ajv)
        : (async () => {
            const { default: Ajv } = await import("ajv");
            return new Ajv({ strict: false });
          })();
    }
    return this.ajv_;
  }

  constructor(options: GraffitiRemoteOptions) {
    this.options = options;
    this.crud = new GraffitiRemoteCrud(options.source, () => this.ajv);
    this.streamers = new GraffitiRemoteStreamers(
      options.source,
      () => this.ajv,
    );

    this.put = this.crud.put.bind(this.crud);
    this.get = this.crud.get.bind(this.crud);
    this.patch = this.crud.patch.bind(this.crud);
    this.delete = this.crud.delete.bind(this.crud);
    this.discover = this.streamers.discover.bind(this.streamers);
    this.recoverOrphans = this.streamers.recoverOrphans.bind(this.streamers);
    this.channelStats = this.streamers.channelStats.bind(this.streamers);
  }
}
