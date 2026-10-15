import { describe, expect, it } from "vitest";
import { describeDbError } from "./action-result";

describe("describeDbError", () => {
  it("explains common database errors", () => {
    expect(describeDbError({ code: "23505" }, "A player with that name")).toBe("A player with that name already exists.");
    expect(describeDbError({ code: "23503", message: "fk" }, "This player")).toMatch(/still used elsewhere/);
    expect(describeDbError({ code: "23503", message: "Gameweek 3 is in use" })).toBe("Gameweek 3 is in use");
    expect(describeDbError({ code: "22023", message: "Choose between 1 and 52 weeks" })).toBe("Choose between 1 and 52 weeks");
    expect(describeDbError({ code: "42501" })).toMatch(/admins/);
    expect(describeDbError(null)).toBe("Something went wrong. Please try again.");
    expect(describeDbError({ code: "21000", message: "UPDATE requires a WHERE clause" })).toBe(
      "Something went wrong: UPDATE requires a WHERE clause",
    );
    expect(describeDbError({ code: "PGRST202", message: "Could not find the function" })).toMatch(/missing an update/);
  });
});
