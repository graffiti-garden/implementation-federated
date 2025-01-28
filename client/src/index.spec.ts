import { describe } from "vitest";
import {
  graffitiDiscoverTests,
  graffitiCRUDTests,
  graffitiLocationTests,
  graffitiSynchronizeTests,
} from "@graffiti-garden/api/tests";
import { GraffitiFederatedPods } from "./index";
import * as secrets1 from "../../.secrets1.json";
import * as secrets2 from "../../.secrets2.json";
import { solidLogin } from "./test-utils";
import { randomBase64 } from "@graffiti-garden/implementation-pouchdb";

const session1 = await solidLogin(secrets1);
const session2 = await solidLogin(secrets2);

const source = "http://localhost:3000";
const options = { remote: { source } };

describe("Remote sessions", () => {
  graffitiDiscoverTests(
    () => new GraffitiFederatedPods(options),
    () => session1,
    () => session2,
  );
  graffitiCRUDTests(
    () => new GraffitiFederatedPods(options),
    () => session1,
    () => session2,
  );
  graffitiLocationTests(() => new GraffitiFederatedPods(options));
  graffitiSynchronizeTests(
    () => new GraffitiFederatedPods(options),
    () => session1,
    () => session2,
  );
});

// Local tests as well
describe("Local sessions", () => {
  graffitiDiscoverTests(
    () => new GraffitiFederatedPods(options),
    () => ({ actor: "local" + randomBase64() }),
    () => ({ actor: "local" + randomBase64() }),
  );
  graffitiCRUDTests(
    () => new GraffitiFederatedPods(options),
    () => ({ actor: "local" + randomBase64() }),
    () => ({ actor: "local" + randomBase64() }),
  );
  graffitiSynchronizeTests(
    () => new GraffitiFederatedPods(options),
    () => ({ actor: "local" + randomBase64() }),
    () => ({ actor: "local" + randomBase64() }),
  );
});
