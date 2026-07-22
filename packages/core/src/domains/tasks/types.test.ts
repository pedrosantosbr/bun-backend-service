import { describe, expect, it } from "bun:test";
import { canTransition } from "./types";

describe("task state machine", () => {
  it("allows the documented transitions", () => {
    expect(canTransition("pending", "processing")).toBe(true);
    expect(canTransition("processing", "completed")).toBe(true);
    expect(canTransition("processing", "failed")).toBe(true);
    expect(canTransition("pending", "cancelled")).toBe(true);
    expect(canTransition("failed", "pending")).toBe(true);
    expect(canTransition("processing", "pending")).toBe(true);
  });

  it("rejects illegal transitions", () => {
    expect(canTransition("completed", "processing")).toBe(false);
    expect(canTransition("cancelled", "processing")).toBe(false);
    expect(canTransition("completed", "failed")).toBe(false);
    expect(canTransition("pending", "completed")).toBe(false);
    expect(canTransition("cancelled", "pending")).toBe(false);
  });
});
