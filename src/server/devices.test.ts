import { describe, expect, it } from "vitest";
import { deviceHash, resolveDeviceId } from "./devices";

describe("resolveDeviceId", () => {
  it("mints a new well-formed id when there is no cookie", () => {
    const r = resolveDeviceId(undefined);
    expect(r.isNew).toBe(true);
    expect(r.id).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });
  it("keeps an existing well-formed id", () => {
    const first = resolveDeviceId(undefined).id;
    expect(resolveDeviceId(first)).toEqual({ id: first, isNew: false });
  });
  it("replaces a malformed or tampered cookie instead of trusting it", () => {
    for (const bad of ["", "short", "x".repeat(33), "<script>alert(1)</script>".padEnd(32, "a")]) {
      expect(resolveDeviceId(bad).isNew).toBe(true);
    }
  });
  it("never repeats", () => {
    expect(resolveDeviceId(null).id).not.toBe(resolveDeviceId(null).id);
  });
});

describe("deviceHash", () => {
  it("is stable, does not contain the raw id, and differs per id", () => {
    const id = resolveDeviceId(undefined).id;
    expect(deviceHash(id)).toBe(deviceHash(id));
    expect(deviceHash(id)).not.toContain(id);
    expect(deviceHash(id)).not.toBe(deviceHash(resolveDeviceId(undefined).id));
  });
});
