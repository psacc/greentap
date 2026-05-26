import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { slugifyChat, imageFilename, clampImageLimit } from "../lib/commands.js";

describe("clampImageLimit (Bug 4 — --limit guard)", () => {
  it("passes through a valid positive integer", () => {
    assert.equal(clampImageLimit(5), 5);
    assert.equal(clampImageLimit(1), 1);
  });

  it("falls back to default (20) for undefined", () => {
    assert.equal(clampImageLimit(undefined), 20);
  });

  it("falls back for 0 — the slice(-0) === slice(0) full-array trap", () => {
    assert.equal(clampImageLimit(0), 20);
  });

  it("falls back for negative values", () => {
    assert.equal(clampImageLimit(-5), 20);
  });

  it("falls back for NaN / non-integer", () => {
    assert.equal(clampImageLimit(NaN), 20);
    assert.equal(clampImageLimit(2.5), 20);
    assert.equal(clampImageLimit("abc"), 20);
  });

  it("honours a custom fallback", () => {
    assert.equal(clampImageLimit(0, 10), 10);
  });
});

describe("slugifyChat", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    assert.equal(slugifyChat("Famiglia Rossi"), "famiglia-rossi");
  });

  it("replaces non-alphanumeric runs with a single hyphen", () => {
    assert.equal(slugifyChat("Work / Team"), "work-team");
  });

  it("trims leading/trailing whitespace and hyphens", () => {
    assert.equal(slugifyChat("  Spaces  "), "spaces");
    assert.equal(slugifyChat("--dashes--"), "dashes");
  });

  it("collapses runs of special characters", () => {
    assert.equal(slugifyChat("A!!!B???C"), "a-b-c");
  });

  it("drops emoji and produces a safe ASCII slug", () => {
    const slug = slugifyChat("Famiglia Rossi 🎉");
    assert.ok(/^[a-z0-9-]+$/.test(slug), `slug should be ascii-safe, got: ${slug}`);
    assert.ok(slug.includes("famiglia-rossi"));
  });

  it("returns empty string for all-special input", () => {
    assert.equal(slugifyChat("///"), "");
  });
});

describe("imageFilename", () => {
  it("uses the imageId with jpg for image/jpeg", () => {
    assert.equal(imageFilename({ imageId: "abc12345" }, "image/jpeg"), "abc12345.jpg");
  });

  it("uses the imageId with png for image/png", () => {
    assert.equal(imageFilename({ imageId: "abc12345" }, "image/png"), "abc12345.png");
  });

  it("uses webp extension for image/webp", () => {
    assert.equal(imageFilename({ imageId: "abc12345" }, "image/webp"), "abc12345.webp");
  });

  it("uses gif extension for image/gif", () => {
    assert.equal(imageFilename({ imageId: "abc12345" }, "image/gif"), "abc12345.gif");
  });

  it("falls back to .bin for unknown mime types", () => {
    assert.equal(imageFilename({ imageId: "abc12345" }, "application/octet-stream"), "abc12345.bin");
  });

  it("falls back to .bin when mime is undefined", () => {
    assert.equal(imageFilename({ imageId: "abc12345" }, undefined), "abc12345.bin");
  });
});
