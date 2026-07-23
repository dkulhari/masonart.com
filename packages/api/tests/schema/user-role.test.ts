import { describe, it, expect } from "vitest";
import { userRoleEnum } from "../../src/database/schema/users";

describe("userRoleEnum", () => {
  it("includes all five roles in hierarchy order", () => {
    expect(userRoleEnum.enumValues).toEqual([
      "customer",
      "trade",
      "content-manager",
      "admin",
      "super-admin",
    ]);
  });
});
