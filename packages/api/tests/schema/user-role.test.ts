import { describe, it, expect } from "vitest";
import { userRoleEnum } from "../../src/database/schema/users";

describe("userRoleEnum", () => {
  it("includes all six roles, with vendor appended last", () => {
    expect(userRoleEnum.enumValues).toEqual([
      "customer",
      "trade",
      "content-manager",
      "admin",
      "super-admin",
      "vendor",
    ]);
  });
});
