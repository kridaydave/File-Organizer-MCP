import { describe, it, expect } from "@jest/globals";
import {
  ok,
  err,
  isOk,
  isErr,
  unwrap,
  unwrapOr,
  map,
  mapErr,
  flatMap,
  Result,
} from "../result.js";

describe("Result<T, E>", () => {
  describe("ok()", () => {
    it("should create a success result", () => {
      const result = ok("test");
      expect(isOk(result)).toBe(true);
      expect(isErr(result)).toBe(false);
      expect(result.value).toBe("test");
    });

    it("should create ok result with different types", () => {
      expect(ok(42).value).toBe(42);
      expect(ok({ key: "value" }).value).toEqual({ key: "value" });
      expect(ok(null).value).toBeNull();
      expect(ok(undefined).value).toBeUndefined();
    });

    it("should preserve reference types", () => {
      const obj = { nested: { deep: true } };
      const result = ok(obj);
      expect(result.value).toBe(obj);
      expect(result.value.nested.deep).toBe(true);
    });
  });

  describe("err()", () => {
    it("should create an error result", () => {
      const error = new Error("fail");
      const result = err(error);
      expect(isErr(result)).toBe(true);
      expect(isOk(result)).toBe(false);
      expect(result.error).toBe(error);
    });

    it("should create err result with different error types", () => {
      expect(err("string error").error).toBe("string error");
      expect(err(404).error).toBe(404);
      expect(err({ code: "FAIL" }).error).toEqual({ code: "FAIL" });
    });
  });

  describe("isOk()", () => {
    it("should return true for ok results", () => {
      expect(isOk(ok(1))).toBe(true);
      expect(isOk(ok("string"))).toBe(true);
      expect(isOk(ok({}))).toBe(true);
    });

    it("should return false for err results", () => {
      expect(isOk(err(new Error()))).toBe(false);
      expect(isOk(err("error"))).toBe(false);
    });
  });

  describe("isErr()", () => {
    it("should return true for error results", () => {
      expect(isErr(err(new Error()))).toBe(true);
      expect(isErr(err("error"))).toBe(true);
    });

    it("should return false for ok results", () => {
      expect(isErr(ok(1))).toBe(false);
      expect(isErr(ok("string"))).toBe(false);
    });
  });

  describe("unwrap()", () => {
    it("should return value for ok result", () => {
      expect(unwrap(ok(42))).toBe(42);
      expect(unwrap(ok("hello"))).toBe("hello");
    });

    it("should throw for error result", () => {
      const error = new Error("fail");
      expect(() => unwrap(err(error))).toThrow("fail");
    });

    it("should throw the exact error object", () => {
      const error = new Error("specific error");
      expect(() => unwrap(err(error))).toThrow(error);
    });

    it("should throw non-Error values as-is", () => {
      expect(() => unwrap(err("string error"))).toThrow("string error");
      let caught = false;
      try {
        unwrap(err(404));
      } catch (e) {
        caught = true;
        expect(e).toBe(404);
      }
      expect(caught).toBe(true);
    });
  });

  describe("unwrapOr()", () => {
    it("should return value for ok result", () => {
      expect(unwrapOr(ok(42), 0)).toBe(42);
      expect(unwrapOr(ok("hello"), "default")).toBe("hello");
    });

    it("should return default for error result", () => {
      expect(unwrapOr(err(new Error("fail")), 0)).toBe(0);
      expect(unwrapOr(err("error"), "default")).toBe("default");
    });

    it("should return null/undefined defaults appropriately", () => {
      expect(unwrapOr(err("error"), null)).toBeNull();
      expect(unwrapOr(err("error"), undefined)).toBeUndefined();
    });
  });

  describe("map()", () => {
    it("should transform ok result value", () => {
      const result = map(ok(5), (n: number) => n * 2);
      if (isOk(result)) {
        expect(result.value).toBe(10);
      }
    });

    it("should transform string result", () => {
      const result = map(ok("hello"), (s: string) => s.length);
      if (isOk(result)) {
        expect(result.value).toBe(5);
      }
    });

    it("should return same error for err result", () => {
      const error = new Error("fail");
      const mappedResult = map(err(error), (n: number) => n * 2);
      expect(isErr(mappedResult)).toBe(true);
      if (isErr(mappedResult)) {
        expect(mappedResult.error).toBe(error);
      }
    });

    it("should work with type changes", () => {
      const result = map(ok(42), (n: number) => n.toString());
      if (isOk(result)) {
        expect(result.value).toBe("42");
      }
    });
  });

  describe("mapErr()", () => {
    it("should return same value for ok result", () => {
      const result = mapErr(ok(42), (e: Error) => new Error("mapped"));
      if (isOk(result)) {
        expect(result.value).toBe(42);
      }
    });

    it("should transform error for err result", () => {
      const result = mapErr(err("original"), (e: string) => new Error(e));
      if (isErr(result)) {
        expect(result.error.message).toBe("original");
      }
    });
  });

  describe("flatMap()", () => {
    it("should chain successful operations", () => {
      const step1 = flatMap(
        ok(5),
        (n: number) => ok(n * 2) as Result<number, Error>,
      );
      const step2 = flatMap(
        step1,
        (n: number) => ok(n + 1) as Result<number, Error>,
      );
      if (isOk(step2)) {
        expect(step2.value).toBe(11);
      }
    });

    it("should chain multiple operations", () => {
      const chained = flatMap(
        ok(2),
        (n: number) => ok(Math.pow(n, 2)) as Result<number, Error>,
      );
      const final = flatMap(
        chained,
        (n: number) => ok(Math.pow(n, 2)) as Result<number, Error>,
      );
      if (isOk(final)) {
        expect(final.value).toBe(16);
      }
    });

    it("should short-circuit on error", () => {
      const result = flatMap(
        ok(5),
        () => err(new Error("fail")) as Result<number, Error>,
      );
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toBe("fail");
      }
    });

    it("should short-circuit when first is error", () => {
      const result = flatMap(
        err(new Error("first")),
        (n: number) => ok(n * 2) as Result<number, Error>,
      );
      expect(isErr(result)).toBe(true);
    });

    it("should handle nested flatMaps with type changes", () => {
      const step1 = flatMap(
        ok(2),
        (n: number) => ok(Math.pow(n, 2)) as Result<number, Error>,
      );
      const step2 = flatMap(
        step1,
        (n: number) => ok(n.toString()) as Result<string, Error>,
      );
      if (isOk(step2)) {
        expect(step2.value).toBe("4");
      }
    });
  });

  describe("Result type narrowing", () => {
    it("should narrow correctly with isOk guard", () => {
      const testOk = ok(10);
      if (isOk(testOk)) {
        expect(testOk.value * 2).toBe(20);
      }

      const testErr = err(new Error("test"));
      expect(isOk(testErr)).toBe(false);
    });

    it("should narrow correctly with isErr guard", () => {
      const testErr = err(new Error("test"));
      if (isErr(testErr)) {
        expect(testErr.error.message).toBe("test");
      }

      const testOk = ok(10);
      expect(isErr(testOk)).toBe(false);
    });
  });
});
