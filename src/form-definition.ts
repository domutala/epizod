import { z } from "zod";
import { isRef } from "./types.js";
import type {
  BigIntCheck,
  DateCheck,
  FileCheck,
  JsonObject,
  JsonValue,
  Node,
  NumberCheck,
  Ref,
  Refs,
  RegexValue,
  SizeCheck,
  StringCheck,
  StringFormatValue,
} from "./types.js";

type NodeOf<Type extends Node["type"]> = Extract<Node, { type: Type }>;
type Params = { error?: string };
type MutableErrorDef = {
  error?: ((issue: unknown) => unknown) | undefined;
};
type HashAlgorithm = "md5" | "sha1" | "sha256" | "sha384" | "sha512";
type HashEncoding = "hex" | "base64" | "base64url";
type StringSchema = z.ZodString | z.ZodCoercedString;
type NumberSchema = z.ZodNumber | z.ZodCoercedNumber;
type BigIntSchema = z.ZodBigInt | z.ZodCoercedBigInt;
type DateSchema = z.ZodDate | z.ZodCoercedDate;
type TransformFn = (value: unknown, ctx: z.core.ParsePayload) => unknown;

export function fromDefinition(node: Node, refs: Refs = {}): z.ZodType {
  switch (node.type) {
    case "string":
      return fromString(node, refs);

    case "number":
      return fromNumber(node, refs);

    case "boolean":
      return withNode(node.coerce ? z.coerce.boolean() : z.boolean(), node);

    case "transform": {
      const transform = z.transform(
        resolveAs(node.transform, refs, "a function", isFunction),
      );

      return withNode(
        node.inner === undefined
          ? transform
          : z.pipe(fromDefinition(node.inner, refs), transform),
        node,
      );
    }

    case "pipe":
      return withNode(
        z.pipe(fromDefinition(node.in, refs), fromDefinition(node.out, refs)),
        node,
      );

    case "any":
      return withNode(z.any(), node);

    case "unknown":
      return withNode(z.unknown(), node);

    case "never":
      return withNode(z.never(), node);

    case "void":
      return withNode(z.void(), node);

    case "null":
      return withNode(z.null(), node);

    case "undefined":
      return withNode(z.undefined(), node);

    case "nan":
      return withNode(z.nan(), node);

    case "symbol":
      return withNode(z.symbol(), node);

    case "bigint":
      return fromBigInt(node, refs);

    case "date":
      return fromDate(node, refs);

    case "file":
      return fromFile(node, refs);

    case "optional":
      return withNode(z.optional(fromDefinition(node.inner, refs)), node);

    case "nullable":
      return withNode(z.nullable(fromDefinition(node.inner, refs)), node);

    case "readonly":
      return withNode(z.readonly(fromDefinition(node.inner, refs)), node);

    case "default":
      return withNode(
        fromDefinition(node.inner, refs).default(
          resolveValue(node.defaultValue, refs),
        ),
        node,
      );

    case "catch":
      return withNode(
        fromDefinition(node.inner, refs).catch(
          resolveValue(node.catchValue, refs),
        ),
        node,
      );

    case "array":
      return fromArray(node, refs);

    case "object": {
      const shape: Record<string, z.ZodType> = {};

      for (const [key, child] of Object.entries(node.shape)) {
        shape[key] = fromDefinition(child, refs);
      }

      return withNode(z.object(shape), node);
    }

    case "enum": {
      if (node.values.length === 0) invalid("empty enum");

      const values = node.values.map((value, index) => {
        if (typeof value !== "string" && typeof value !== "number") {
          invalid(`enum value at index ${index} must be a string or number`);
        }
        return value;
      });

      return withNode(z.enum(values as unknown as z.util.EnumLike), node);
    }

    case "literal": {
      if (node.values.length === 0) invalid("empty literal");

      return withNode(
        z.literal(node.values as [z.util.Literal, ...z.util.Literal[]]),
        node,
      );
    }

    case "union": {
      if (node.options.length === 0) invalid("empty union");

      return withNode(
        z.union(node.options.map((option) => fromDefinition(option, refs))),
        node,
      );
    }

    case "record": {
      const key = fromDefinition(node.key, refs) as z.ZodType<
        string | number | symbol,
        unknown
      >;

      return withNode(z.record(key, fromDefinition(node.value, refs)), node);
    }

    case "intersection":
      return withNode(
        z.intersection(
          fromDefinition(node.left, refs),
          fromDefinition(node.right, refs),
        ),
        node,
      );

    case "map":
      return withNode(
        z.map(fromDefinition(node.key, refs), fromDefinition(node.value, refs)),
        node,
      );

    case "function": {
      const params: {
        input?: z.core.$ZodFunctionIn;
        output?: z.core.$ZodFunctionOut;
      } = {};

      if (node.input !== undefined) {
        params.input = fromDefinition(
          node.input,
          refs,
        ) as z.core.$ZodFunctionIn;
      }
      if (node.output !== undefined) {
        params.output = fromDefinition(
          node.output,
          refs,
        ) as z.core.$ZodFunctionOut;
      }

      return withNode(z.function(params as any), node);
    }

    case "tuple": {
      const items = node.items.map((item) => fromDefinition(item, refs)) as [
        z.ZodType,
        ...z.ZodType[],
      ];

      const schema = node.rest
        ? z.tuple(items, fromDefinition(node.rest, refs))
        : z.tuple(items);

      return withNode(schema, node);
    }

    default:
      return assertNever(node);
  }
}

function fromString(node: NodeOf<"string">, refs: Refs): z.ZodType {
  let schema = node.coerce ? z.coerce.string() : z.string();

  for (const check of node.checks) {
    schema = applyStringCheck(schema, check, refs);
  }

  return withNode(schema, node);
}

function applyStringCheck(
  schema: StringSchema,
  check: StringCheck,
  refs: Refs,
): StringSchema {
  const params = errorParams(check.message);

  switch (check.check) {
    case "min":
      return schema.min(resolveNumber(check.value, refs), params);

    case "max":
      return schema.max(resolveNumber(check.value, refs), params);

    case "length":
      return schema.length(resolveNumber(check.value, refs), params);

    case "regex":
      return schema.regex(resolveRegex(check.value, refs), params);

    case "includes": {
      const value = check.value;

      return schema.includes(value.text, {
        ...params,
        ...(value.position === undefined ? {} : { position: value.position }),
      });
    }

    case "starts_with":
      return schema.startsWith(resolveString(check.value, refs), params);

    case "ends_with":
      return schema.endsWith(resolveString(check.value, refs), params);

    case "format":
      if (check.value.format === "lowercase") {
        assertFormatOptions(check.value, []);
        return schema.lowercase(params);
      }

      if (check.value.format === "uppercase") {
        assertFormatOptions(check.value, []);
        return schema.uppercase(params);
      }

      return schema.check(fromStringFormat(check.value, check.message));

    default:
      return assertNever(check);
  }
}

function fromStringFormat(
  value: StringFormatValue,
  message: string | undefined,
): z.core.$ZodCheck<string> {
  const params = errorParams(message);
  const format = value.format;

  switch (format) {
    case "email":
      assertFormatOptions(value, []);
      return z.email(params);

    case "url": {
      const options = assertFormatOptions(value, [
        "hostname",
        "protocol",
        "normalize",
      ]);

      return z.url({
        ...params,
        ...defined({
          hostname: regexOption(options, "hostname"),
          protocol: regexOption(options, "protocol"),
          normalize: booleanOption(options, "normalize"),
        }),
      });
    }

    case "emoji":
      assertFormatOptions(value, []);
      return z.emoji(params);

    case "uuid": {
      const options = assertFormatOptions(value, ["version"]);

      return z.uuid({
        ...params,
        ...defined({ version: uuidVersion(options) }),
      });
    }

    case "guid":
      assertFormatOptions(value, []);
      return z.guid(params);

    case "nanoid": {
      const options = assertFormatOptions(value, ["length"]);

      return z.nanoid({
        ...params,
        ...defined({ length: numberOption(options, "length") }),
      });
    }

    case "cuid":
      assertFormatOptions(value, []);
      return z.cuid(params);

    case "cuid2":
      assertFormatOptions(value, []);
      return z.cuid2(params);

    case "ulid":
      assertFormatOptions(value, []);
      return z.ulid(params);

    case "xid":
      assertFormatOptions(value, []);
      return z.xid(params);

    case "ksuid":
      assertFormatOptions(value, []);
      return z.ksuid(params);

    case "datetime": {
      const options = assertFormatOptions(value, [
        "precision",
        "offset",
        "local",
      ]);

      return z.iso.datetime({
        ...params,
        ...defined({
          precision: precisionOption(options),
          offset: booleanOption(options, "offset"),
          local: booleanOption(options, "local"),
        }),
      });
    }

    case "date":
      assertFormatOptions(value, []);
      return z.iso.date(params);

    case "time": {
      const options = assertFormatOptions(value, ["precision"]);

      return z.iso.time({
        ...params,
        ...defined({ precision: precisionOption(options) }),
      });
    }

    case "duration":
      assertFormatOptions(value, []);
      return z.iso.duration(params);

    case "ipv4":
      assertFormatOptions(value, []);
      return z.ipv4(params);

    case "ipv6":
      assertFormatOptions(value, []);
      return z.ipv6(params);

    case "mac": {
      const options = assertFormatOptions(value, ["delimiter"]);

      return z.mac({
        ...params,
        ...defined({
          delimiter: stringOption(options, "delimiter"),
        }),
      });
    }

    case "cidrv4":
      assertFormatOptions(value, []);
      return z.cidrv4(params);

    case "cidrv6":
      assertFormatOptions(value, []);
      return z.cidrv6(params);

    case "base64":
      assertFormatOptions(value, []);
      return z.base64(params);

    case "base64url":
      assertFormatOptions(value, []);
      return z.base64url(params);

    case "json":
      assertFormatOptions(value, []);
      return z.stringFormat("json_string", isJsonString, params);

    case "e164":
      assertFormatOptions(value, []);
      return z.e164(params);

    case "credit_card":
      assertFormatOptions(value, []);
      return z.creditCard(params);

    case "iban":
      assertFormatOptions(value, []);
      return z.iban(params);

    case "jwt": {
      const options = assertFormatOptions(value, ["alg"]);

      return z.jwt({
        ...params,
        ...defined({ alg: stringOption(options, "alg") }),
      });
    }

    case "hex":
      assertFormatOptions(value, []);
      return z.hex(params);

    case "hostname":
      assertFormatOptions(value, []);
      return z.hostname(params);

    case "currency_code":
      assertFormatOptions(value, []);
      return z.currencyCode(params);

    case "md5_hex":
    case "md5_base64":
    case "md5_base64url":
    case "sha1_hex":
    case "sha1_base64":
    case "sha1_base64url":
    case "sha256_hex":
    case "sha256_base64":
    case "sha256_base64url":
    case "sha384_hex":
    case "sha384_base64":
    case "sha384_base64url":
    case "sha512_hex":
    case "sha512_base64":
    case "sha512_base64url": {
      assertFormatOptions(value, []);

      const match =
        /^(md5|sha1|sha256|sha384|sha512)_(hex|base64|base64url)$/.exec(format);

      if (match === null) invalid(`hash format "${format}"`);

      return z.hash(match[1] as HashAlgorithm, {
        ...params,
        enc: match[2] as HashEncoding,
      });
    }

    case "lowercase":
    case "uppercase":
      return invalid(`standalone string format "${format}"`);

    default:
      return assertNever(format);
  }
}

function fromNumber(node: NodeOf<"number">, refs: Refs): z.ZodType {
  let schema = node.coerce ? z.coerce.number() : z.number();

  for (const check of node.checks) {
    schema = applyNumberCheck(schema, check, refs);
  }

  return withNode(schema, node);
}

function applyNumberCheck(
  schema: NumberSchema,
  check: NumberCheck,
  refs: Refs,
): NumberSchema {
  const params = errorParams(check.message);

  switch (check.check) {
    case "min":
      return schema.min(resolveNumber(check.value, refs), params);

    case "max":
      return schema.max(resolveNumber(check.value, refs), params);

    case "gt":
      return schema.gt(resolveNumber(check.value, refs), params);

    case "lt":
      return schema.lt(resolveNumber(check.value, refs), params);

    case "multiple_of":
      return schema.multipleOf(resolveNumber(check.value, refs), params);

    case "int":
      return schema.int(params);

    case "int32":
      return schema.check(z.int32(params));

    case "uint32":
      return schema.check(z.uint32(params));

    case "float32":
      return schema.check(z.float32(params));

    case "float64":
      return schema.check(z.float64(params));

    default:
      return assertNever(check);
  }
}

function fromBigInt(node: NodeOf<"bigint">, refs: Refs): z.ZodType {
  let schema = node.coerce ? z.coerce.bigint() : z.bigint();

  for (const check of node.checks) {
    schema = applyBigIntCheck(schema, check, refs);
  }

  return withNode(schema, node);
}

function applyBigIntCheck(
  schema: BigIntSchema,
  check: BigIntCheck,
  refs: Refs,
): BigIntSchema {
  const params = errorParams(check.message);

  switch (check.check) {
    case "min":
      return schema.min(resolveBigInt(check.value, refs), params);

    case "max":
      return schema.max(resolveBigInt(check.value, refs), params);

    case "gt":
      return schema.gt(resolveBigInt(check.value, refs), params);

    case "lt":
      return schema.lt(resolveBigInt(check.value, refs), params);

    case "multiple_of":
      return schema.multipleOf(resolveBigInt(check.value, refs), params);

    case "int64":
      return schema.check(z.int64(params));

    case "uint64":
      return schema.check(z.uint64(params));

    default:
      return assertNever(check);
  }
}

function fromDate(node: NodeOf<"date">, refs: Refs): z.ZodType {
  let schema = node.coerce ? z.coerce.date() : z.date();

  for (const check of node.checks) {
    schema = applyDateCheck(schema, check, refs);
  }

  return withNode(schema, node);
}

function applyDateCheck(
  schema: DateSchema,
  check: DateCheck,
  refs: Refs,
): DateSchema {
  const params = errorParams(check.message);

  switch (check.check) {
    case "min":
      return schema.min(resolveDate(check.value, refs), params);

    case "max":
      return schema.max(resolveDate(check.value, refs), params);

    default:
      return assertNever(check);
  }
}

function fromFile(node: NodeOf<"file">, refs: Refs): z.ZodType {
  let schema = z.file();

  for (const check of node.checks) {
    schema = applyFileCheck(schema, check, refs);
  }

  return withNode(schema, node);
}

function applyFileCheck(
  schema: z.ZodFile,
  check: FileCheck,
  refs: Refs,
): z.ZodFile {
  const params = errorParams(check.message);

  switch (check.check) {
    case "min":
      return schema.min(resolveNumber(check.value, refs), params);

    case "max":
      return schema.max(resolveNumber(check.value, refs), params);

    case "mime":
      return schema.mime(
        resolveStrings(check.value, refs) as z.core.util.MimeTypes[],
        params,
      );

    default:
      return assertNever(check);
  }
}

function toBigInt(value: string): bigint {
  if (!/^-?\d+$/.test(value)) invalid(`bigint value "${value}"`);
  return BigInt(value);
}

function toDate(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) invalid(`date value "${value}"`);
  return date;
}

function fromArray(node: NodeOf<"array">, refs: Refs): z.ZodType {
  let schema = z.array(fromDefinition(node.element, refs));

  for (const check of node.checks) {
    schema = applySizeCheck(schema, check, refs);
  }

  return withNode(schema, node);
}

function applySizeCheck<T extends z.ZodType>(
  schema: z.ZodArray<T>,
  check: SizeCheck,
  refs: Refs,
): z.ZodArray<T> {
  const params = errorParams(check.message);

  switch (check.check) {
    case "min":
      return schema.min(resolveNumber(check.value, refs), params);

    case "max":
      return schema.max(resolveNumber(check.value, refs), params);

    case "length":
      return schema.length(resolveNumber(check.value, refs), params);

    default:
      return invalid(`array check "${String(check.check)}"`);
  }
}

function resolveRef(ref: Ref, refs: Refs): unknown {
  const name = ref.slice(2);
  if (!Object.hasOwn(refs, name)) invalid(`unresolved reference "${ref}"`);
  return refs[name];
}

function resolveValue(value: unknown, refs: Refs): unknown {
  return isRef(value) ? resolveRef(value, refs) : value;
}

function resolveAs<T>(
  value: unknown,
  refs: Refs,
  expected: string,
  guard: (resolved: unknown) => resolved is T,
): T {
  const resolved = resolveValue(value, refs);

  if (!guard(resolved)) {
    invalid(
      `${isRef(value) ? `reference "${value}"` : "value"} must be ${expected}`,
    );
  }

  return resolved;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isString = (value: unknown): value is string => typeof value === "string";

const isFunction = (value: unknown): value is TransformFn =>
  typeof value === "function";

function resolveNumber(value: number | Ref, refs: Refs): number {
  return resolveAs(value, refs, "a finite number", isFiniteNumber);
}

function resolveString(value: string, refs: Refs): string {
  return resolveAs(value, refs, "a string", isString);
}

function resolveRegex(value: RegexValue | Ref, refs: Refs): RegExp {
  if (!isRef(value)) return new RegExp(value.source, value.flags);

  const resolved = resolveRef(value, refs);
  if (!(resolved instanceof RegExp))
    invalid(`reference "${value}" must be a RegExp`);

  return resolved;
}

function resolveStrings(value: readonly string[] | Ref, refs: Refs): string[] {
  const resolved = resolveValue(value, refs);

  if (!Array.isArray(resolved) || !resolved.every(isString)) {
    invalid(
      `${isRef(value) ? `reference "${value}"` : "value"} must be an array of strings`,
    );
  }

  return resolved;
}

function resolveBigInt(value: string, refs: Refs): bigint {
  const resolved = resolveValue(value, refs);

  if (typeof resolved === "bigint") return resolved;
  if (typeof resolved === "string") return toBigInt(resolved);

  return invalid(
    `${isRef(value) ? `reference "${value}"` : "value"} must be a bigint or a decimal string`,
  );
}

function resolveDate(value: string, refs: Refs): Date {
  const resolved = resolveValue(value, refs);

  if (resolved instanceof Date && !Number.isNaN(resolved.getTime()))
    return resolved;
  if (typeof resolved === "string") return toDate(resolved);

  return invalid(
    `${isRef(value) ? `reference "${value}"` : "value"} must be a valid Date or an ISO string`,
  );
}

function withNode<T extends z.ZodType>(schema: T, node: Node): T {
  if (node.message !== undefined) {
    const holder = schema as unknown as {
      _zod: { def: MutableErrorDef };
    };
    const message = node.message;

    holder._zod.def.error = () => message;
  }

  return node.meta === undefined ? schema : schema.meta({ ...node.meta });
}

function errorParams(message: string | undefined): Params {
  return message === undefined ? {} : { error: message };
}

function assertFormatOptions(
  value: StringFormatValue,
  allowed: readonly string[],
): JsonObject {
  const options = value.options ?? {};

  for (const key of Object.keys(options)) {
    if (!allowed.includes(key)) {
      invalid(`option "${key}" for string format "${value.format}"`);
    }
  }

  return options;
}

function regexOption(options: JsonObject, key: string): RegExp | undefined {
  const value = options[key];

  if (value === undefined) return undefined;
  if (!isJsonObject(value)) invalid(`regex option "${key}"`);

  if (typeof value.source !== "string") {
    invalid(`regex option "${key}.source"`);
  }

  if (value.flags !== undefined && typeof value.flags !== "string") {
    invalid(`regex option "${key}.flags"`);
  }

  return new RegExp(value.source, value.flags);
}

function booleanOption(options: JsonObject, key: string): boolean | undefined {
  const value = options[key];

  if (value !== undefined && typeof value !== "boolean") {
    invalid(`boolean option "${key}"`);
  }

  return value;
}

function numberOption(options: JsonObject, key: string): number | undefined {
  const value = options[key];

  if (value !== undefined && typeof value !== "number") {
    invalid(`number option "${key}"`);
  }

  return value;
}

function stringOption(options: JsonObject, key: string): string | undefined {
  const value = options[key];

  if (value !== undefined && typeof value !== "string") {
    invalid(`string option "${key}"`);
  }

  return value;
}

function precisionOption(options: JsonObject): number | null | undefined {
  const value = options.precision;

  if (value !== undefined && value !== null && typeof value !== "number") {
    invalid('number or null option "precision"');
  }

  return value;
}

function uuidVersion(
  options: JsonObject,
): "v1" | "v2" | "v3" | "v4" | "v5" | "v6" | "v7" | "v8" | undefined {
  const value = stringOption(options, "version");

  switch (value) {
    case undefined:
    case "v1":
    case "v2":
    case "v3":
    case "v4":
    case "v5":
    case "v6":
    case "v7":
    case "v8":
      return value;

    default:
      return invalid(`UUID version "${value}"`);
  }
}

type Defined<T> = { [K in keyof T]?: Exclude<T[K], undefined> };

function defined<T extends Record<string, unknown>>(value: T): Defined<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Defined<T>;
}

function isJsonString(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(detail: string): never {
  throw new Error(`Invalid definition: ${detail}`);
}

function assertNever(value: never): never {
  const definition = value as {
    type?: unknown;
    check?: unknown;
  };
  const discriminator = definition.type ?? definition.check;

  invalid(`unsupported value "${String(discriminator)}"`);
}
