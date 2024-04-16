import { Test, TestingModule } from "@nestjs/testing";
import { StoreController } from "./store.controller";
import { RootMongooseModule } from "../app.module";
import { GraffitiObjectMongooseModule } from "../schemas/object.schema";
import { StoreService } from "./store.service";

describe("StoreController", () => {
  let controller: StoreController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [RootMongooseModule, GraffitiObjectMongooseModule],
      controllers: [StoreController],
      providers: [StoreService],
    }).compile();

    controller = module.get<StoreController>(StoreController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });
});
