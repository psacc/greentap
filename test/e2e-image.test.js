import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  captureImageBaseline,
  findAppendedTailImageId,
  stageImage,
} from "../lib/e2e.js";

describe("E2E image correlation", () => {
  it("rejects an unchanged stale tail image", () => {
    const id = findAppendedTailImageId(["same-id"], [
      { kind: "image", imageId: "same-id" },
    ]);

    assert.equal(id, null);
  });

  it("accepts a repeated ID only when its occurrence count increases", () => {
    const id = findAppendedTailImageId(["same-id"], [
      { kind: "image", imageId: "same-id" },
      { kind: "image", imageId: "same-id" },
    ]);

    assert.equal(id, "same-id");
  });

  it("accepts a unique appended tail image", () => {
    const id = findAppendedTailImageId(["old-id"], [
      { kind: "image", imageId: "old-id" },
      { kind: "image", imageId: "new-id" },
    ]);

    assert.equal(id, "new-id");
  });

  it("rejects a tail that is not an image", () => {
    const id = findAppendedTailImageId([], [
      { kind: "text", text: "Synthetic marker" },
    ]);

    assert.equal(id, null);
  });

  it("fails when the pre-send image baseline cannot be captured", async () => {
    const page = {
      locator() {
        return {
          async ariaSnapshot() {
            throw new Error("synthetic snapshot failure");
          },
        };
      },
    };

    await assert.rejects(
      () => captureImageBaseline(page),
      /synthetic snapshot failure/,
    );
  });

  it("fails when the pre-send snapshot has no parseable messages", async () => {
    const page = {
      locator() {
        return {
          async ariaSnapshot() {
            return '- document:\n  - banner "Synthetic empty chat"';
          },
        };
      },
    };

    await assert.rejects(
      () => captureImageBaseline(page),
      /no parseable messages/i,
    );
  });

  it("stops the image stage before submission when baseline capture fails", async () => {
    let submissionAttempted = false;
    const result = await stageImage({}, undefined, "greentap-sandbox", {
      captureBaseline: async () => {
        throw new Error("synthetic baseline failure");
      },
      sendImage: async () => {
        submissionAttempted = true;
      },
    });

    assert.equal(result.pass, false);
    assert.match(result.error, /pre-send image baseline/);
    assert.equal(submissionAttempted, false);
  });

});
