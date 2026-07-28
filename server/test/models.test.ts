import { describe, expect, it } from "vitest";
import { ProjectIdParamSchema } from "../src/lib/models.js";

describe("ProjectIdParamSchema", () => {
  it("accepts a real generated project id (UUID v4 shape)", () => {
    const result = ProjectIdParamSchema.safeParse({ id: "81025a1c-b04d-422c-8947-a1c302197d33" });
    expect(result.success).toBe(true);
  });

  it("rejects a plain traversal sequence", () => {
    const result = ProjectIdParamSchema.safeParse({ id: "../../etc/passwd" });
    expect(result.success).toBe(false);
  });

  it("rejects a URL-decoded traversal sequence (what `..%2F..%2Fetc%2Fpasswd` becomes once the router decodes it)", () => {
    const result = ProjectIdParamSchema.safeParse({ id: "..%2F..%2Fetc%2Fpasswd".replace(/%2F/gi, "/") });
    expect(result.success).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(ProjectIdParamSchema.safeParse({ id: "" }).success).toBe(false);
  });

  it("rejects a non-UUID plain identifier", () => {
    expect(ProjectIdParamSchema.safeParse({ id: "my-project" }).success).toBe(false);
  });
});
