import { z } from "zod";
import {
  INTERNAL_STRING_FORMATS,
  type JsonObject,
  type Node,
  type StringFormat,
} from "./types.js";
import { cloneJson } from "./helpers.js";

/**
 * Validates an untrusted JSON definition and returns the canonical `Node` form.
 *
 * The input is cloned first: callers can therefore safely keep or mutate their
 * original payload after it has been accepted.
 */
export function parseDefinition(value: unknown): Node {
  const json = cloneJson(value, "definition");
  return definitionSchema.parse(json) as Node;
}

const jsonValue: z.ZodType = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValue),
    z.record(z.string(), jsonValue),
  ]),
);

const jsonObject = z.record(z.string(), jsonValue);
const message = { message: z.string().optional() };
const nodeMetadata = { ...message, meta: jsonObject.optional() };

function strictObject<T extends z.ZodRawShape>(shape: T) {
  return z.object({ ...shape, ...nodeMetadata }).strict();
}

function strictCheck<T extends z.ZodRawShape>(shape: T) {
  return z.object({ ...shape, ...message }).strict();
}

const ref = z.string().regex(/^#:.+$/, "Invalid reference");
const numberValue = z.union([z.number(), ref]);

const regexValue = z
  .object({ source: z.string(), flags: z.string().optional() })
  .strict()
  .superRefine(({ source, flags }, ctx) => {
    try {
      new RegExp(source, flags);
    } catch {
      ctx.addIssue({ code: "custom", message: "Invalid regular expression" });
    }
  });

const stringFormat = z
  .string()
  .refine(
    (value): value is StringFormat =>
      value === "json" ||
      (INTERNAL_STRING_FORMATS as readonly string[]).includes(value),
    "Unsupported string format",
  );

const stringCheck = z.union([
  strictCheck({
    check: z.enum(["min", "max", "length"]),
    value: numberValue,
  }),
  strictCheck({ check: z.literal("regex"), value: z.union([regexValue, ref]) }),
  strictCheck({
    check: z.literal("format"),
    value: z
      .object({ format: stringFormat, options: jsonObject.optional() })
      .strict(),
  }),
  strictCheck({
    check: z.literal("includes"),
    value: z
      .object({ text: z.string(), position: z.number().optional() })
      .strict(),
  }),
  strictCheck({
    check: z.enum(["starts_with", "ends_with"]),
    value: z.string(),
  }),
]);

const numberCheck = z.union([
  strictCheck({
    check: z.enum(["min", "max", "gt", "lt", "multiple_of"]),
    value: numberValue,
  }),
  strictCheck({
    check: z.enum(["int", "int32", "uint32", "float32", "float64"]),
  }),
]);

const bigintValue = z.union([
  z.string().regex(/^-?\d+$/, "Invalid bigint string"),
  ref,
]);

const bigintCheck = z.union([
  strictCheck({
    check: z.enum(["min", "max", "gt", "lt", "multiple_of"]),
    value: bigintValue,
  }),
  strictCheck({ check: z.enum(["int64", "uint64"]) }),
]);

const dateCheck = strictCheck({
  check: z.enum(["min", "max"]),
  value: z.union([z.iso.datetime(), ref]),
});

const fileCheck = z.union([
  strictCheck({ check: z.enum(["min", "max"]), value: numberValue }),
  strictCheck({
    check: z.literal("mime"),
    value: z.union([z.array(z.string()).min(1), ref]),
  }),
]);

const sizeCheck = strictCheck({
  check: z.enum(["min", "max", "length"]),
  value: numberValue,
});

const jsonPrimitive = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const definitionSchema: z.ZodType = z.lazy(() =>
  z.discriminatedUnion("type", [
    strictObject({
      type: z.literal("string"),
      checks: z.array(stringCheck),
      coerce: z.literal(true).optional(),
    }),
    strictObject({
      type: z.literal("number"),
      checks: z.array(numberCheck),
      coerce: z.literal(true).optional(),
    }),
    strictObject({
      type: z.literal("boolean"),
      coerce: z.literal(true).optional(),
    }),
    strictObject({ type: z.literal("any") }),
    strictObject({ type: z.literal("unknown") }),
    strictObject({ type: z.literal("never") }),
    strictObject({ type: z.literal("void") }),
    strictObject({ type: z.literal("null") }),
    strictObject({ type: z.literal("undefined") }),
    strictObject({ type: z.literal("nan") }),
    strictObject({ type: z.literal("symbol") }),
    strictObject({
      type: z.literal("bigint"),
      checks: z.array(bigintCheck),
      coerce: z.literal(true).optional(),
    }),
    strictObject({
      type: z.literal("date"),
      checks: z.array(dateCheck),
      coerce: z.literal(true).optional(),
    }),
    strictObject({ type: z.literal("file"), checks: z.array(fileCheck) }),
    strictObject({
      type: z.literal("transform"),
      transform: ref,
      inner: definitionSchema.optional(),
    }),
    strictObject({
      type: z.literal("pipe"),
      in: definitionSchema,
      out: definitionSchema,
    }),
    strictObject({ type: z.literal("optional"), inner: definitionSchema }),
    strictObject({ type: z.literal("nullable"), inner: definitionSchema }),
    strictObject({ type: z.literal("readonly"), inner: definitionSchema }),
    strictObject({
      type: z.literal("default"),
      inner: definitionSchema,
      defaultValue: jsonValue,
    }),
    strictObject({
      type: z.literal("catch"),
      inner: definitionSchema,
      catchValue: jsonValue,
    }),
    strictObject({
      type: z.literal("array"),
      element: definitionSchema,
      checks: z.array(sizeCheck),
    }),
    strictObject({
      type: z.literal("object"),
      shape: z.record(z.string(), definitionSchema),
    }),
    strictObject({
      type: z.literal("enum"),
      values: z.array(jsonPrimitive).min(1),
    }),
    strictObject({
      type: z.literal("literal"),
      values: z.array(jsonPrimitive).min(1),
    }),
    strictObject({
      type: z.literal("union"),
      options: z.array(definitionSchema).min(1),
    }),
    strictObject({
      type: z.literal("record"),
      key: definitionSchema,
      value: definitionSchema,
    }),
    strictObject({
      type: z.literal("intersection"),
      left: definitionSchema,
      right: definitionSchema,
    }),
    strictObject({
      type: z.literal("map"),
      key: definitionSchema,
      value: definitionSchema,
    }),
    strictObject({
      type: z.literal("function"),
      input: definitionSchema.optional(),
      output: definitionSchema.optional(),
    }),
    strictObject({
      type: z.literal("tuple"),
      items: z.array(definitionSchema),
      rest: definitionSchema.optional(),
    }),
  ]),
);

/** Returns `true` instead of throwing when a value is not a valid definition. */
export function isDefinition(value: unknown): value is Node {
  try {
    parseDefinition(value);
    return true;
  } catch {
    return false;
  }
}

/** The JSON-object type makes this export convenient for schema consumers. */
export type DefinitionMetadata = JsonObject;
