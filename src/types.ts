import { z } from "zod";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };
export type JsonObject = Record<string, JsonValue>;

export type Msg = { message?: string };
export type Meta = { meta?: JsonObject };
export type ErrorMap = (issue: unknown) => unknown;

/** A string starting with "#:" is resolved by name from the `refs` object given to `fromDefinition`. */
export type Ref = `#:${string}`;
export type Refs = Readonly<Record<string, unknown>>;

export const isRef = (value: unknown): value is Ref =>
  typeof value === "string" && value.startsWith("#:");

export type ErrorSource = {
  error?: ErrorMap | undefined;
} & Record<string, unknown>;

export type CheckDef = {
  check: string;
  error?: ErrorMap | undefined;
  format?: unknown;
  pattern?: unknown;
} & Record<string, unknown>;

export type CheckLike = {
  _zod: {
    def: CheckDef;
  };
};

export type SchemaDef = {
  type: string;
  error?: ErrorMap | undefined;
  checks?: CheckLike[] | undefined;
  innerType?: z.ZodType | undefined;
  element?: z.ZodType | undefined;
  shape?: Record<string, z.ZodType> | undefined;
  options?: readonly z.ZodType[] | undefined;
  items?: readonly z.ZodType[] | undefined;
  rest?: z.ZodType | null | undefined;
  keyType?: z.ZodType | undefined;
  valueType?: z.ZodType | undefined;
  values?: readonly unknown[] | undefined;
  entries?: unknown;
  catchall?: z.ZodType | null | undefined;
  mode?: unknown;
  partial?: unknown;
  coerce?: unknown;
  check?: unknown;
  defaultValue?: unknown;
  catchValue?: unknown;
  in?: z.ZodType | undefined;
  out?: z.ZodType | undefined;
  left?: z.ZodType | undefined;
  right?: z.ZodType | undefined;
  input?: z.ZodType | undefined;
  output?: z.ZodType | undefined;
} & Record<string, unknown>;

export type RegexValue = {
  source: string;
  flags?: string;
};

export type StringFormatValue = {
  format: StringFormat;
  options?: JsonObject;
};

export type StringCheck = (
  | { check: "min" | "max" | "length"; value: number | Ref }
  | { check: "regex"; value: RegexValue | Ref }
  | { check: "format"; value: StringFormatValue }
  | { check: "includes"; value: { text: string; position?: number } }
  | { check: "starts_with" | "ends_with"; value: string }
) &
  Msg;

export type NumberCheck = (
  | { check: "min" | "max" | "gt" | "lt"; value: number | Ref }
  | { check: "int" | "int32" | "uint32" | "float32" | "float64" }
  | { check: "multiple_of"; value: number | Ref }
) &
  Msg;

export type SizeCheck = {
  check: "min" | "max" | "length";
  value: number | Ref;
} & Msg;

// JSON has neither bigint nor Date: values are a decimal string / an ISO 8601 string.
export type BigIntCheck = (
  | { check: "min" | "max" | "gt" | "lt" | "multiple_of"; value: string }
  | { check: "int64" | "uint64" }
) &
  Msg;

// File sizes are in bytes.
export type FileCheck = (
  | { check: "min" | "max"; value: number | Ref }
  | { check: "mime"; value: string[] | Ref }
) &
  Msg;

export type DateCheck = (
  | { check: "min"; value: string }
  | { check: "max"; value: string }
) &
  Msg;

type SimpleInternalStringFormat =
  | "email"
  | "url"
  | "emoji"
  | "uuid"
  | "guid"
  | "nanoid"
  | "cuid"
  | "cuid2"
  | "ulid"
  | "xid"
  | "ksuid"
  | "datetime"
  | "date"
  | "time"
  | "duration"
  | "ipv4"
  | "ipv6"
  | "mac"
  | "cidrv4"
  | "cidrv6"
  | "base64"
  | "base64url"
  | "json_string"
  | "e164"
  | "credit_card"
  | "iban"
  | "lowercase"
  | "uppercase"
  | "jwt";

export type HashFormat =
  | "md5_hex"
  | "md5_base64"
  | "md5_base64url"
  | "sha1_hex"
  | "sha1_base64"
  | "sha1_base64url"
  | "sha256_hex"
  | "sha256_base64"
  | "sha256_base64url"
  | "sha384_hex"
  | "sha384_base64"
  | "sha384_base64url"
  | "sha512_hex"
  | "sha512_base64"
  | "sha512_base64url";

export type InternalStringFormat =
  | SimpleInternalStringFormat
  | HashFormat
  | "hex"
  | "hostname"
  | "currency_code";

export const INTERNAL_STRING_FORMATS: readonly InternalStringFormat[] = [
  "email",
  "url",
  "emoji",
  "uuid",
  "guid",
  "nanoid",
  "cuid",
  "cuid2",
  "ulid",
  "xid",
  "ksuid",
  "datetime",
  "date",
  "time",
  "duration",
  "ipv4",
  "ipv6",
  "mac",
  "cidrv4",
  "cidrv6",
  "base64",
  "base64url",
  "json_string",
  "e164",
  "credit_card",
  "iban",
  "lowercase",
  "uppercase",
  "jwt",
  "md5_hex",
  "md5_base64",
  "md5_base64url",
  "sha1_hex",
  "sha1_base64",
  "sha1_base64url",
  "sha256_hex",
  "sha256_base64",
  "sha256_base64url",
  "sha384_hex",
  "sha384_base64",
  "sha384_base64url",
  "sha512_hex",
  "sha512_base64",
  "sha512_base64url",
  "hex",
  "hostname",
  "currency_code",
];

export type StringFormat =
  | Exclude<InternalStringFormat, "json_string">
  | "json";

export type StringNode = {
  type: "string";
  checks: StringCheck[];
  coerce?: true;
} & Msg;

export type NumberNode = {
  type: "number";
  checks: NumberCheck[];
  coerce?: true;
} & Msg;

export type BooleanNode = {
  type: "boolean";
  coerce?: true;
} & Msg;

type AnyNode = { type: "any" } & Msg;
type UnknownNode = { type: "unknown" } & Msg;
type NeverNode = { type: "never" } & Msg;
type VoidNode = { type: "void" } & Msg;
type NullNode = { type: "null" } & Msg;
type UndefinedNode = { type: "undefined" } & Msg;
type NanNode = { type: "nan" } & Msg;
type SymbolNode = { type: "symbol" } & Msg;

export type BigIntNode = {
  type: "bigint";
  checks: BigIntCheck[];
  coerce?: true;
} & Msg;

export type DateNode = {
  type: "date";
  checks: DateCheck[];
  coerce?: true;
} & Msg;

export type FileNode = {
  type: "file";
  checks: FileCheck[];
} & Msg;

type TransformNode = {
  type: "transform";
  transform: Ref;
  inner?: Node;
} & Msg;

type PipeNode = {
  type: "pipe";
  in: Node;
  out: Node;
} & Msg;

type OptionalNode = {
  type: "optional";
  inner: Node;
} & Msg;

type NullableNode = {
  type: "nullable";
  inner: Node;
} & Msg;

type ReadonlyNode = {
  type: "readonly";
  inner: Node;
} & Msg;

type DefaultNode = {
  type: "default";
  inner: Node;
  defaultValue: JsonValue;
} & Msg;

type CatchNode = {
  type: "catch";
  inner: Node;
  catchValue: JsonValue;
} & Msg;

type ArrayNode = {
  type: "array";
  element: Node;
  checks: SizeCheck[];
} & Msg;

type ObjectNode = {
  type: "object";
  shape: Record<string, Node>;
} & Msg;

type EnumNode = {
  type: "enum";
  values: JsonPrimitive[];
} & Msg;

type LiteralNode = {
  type: "literal";
  values: JsonPrimitive[];
} & Msg;

type UnionNode = {
  type: "union";
  options: Node[];
} & Msg;

type RecordNode = {
  type: "record";
  key: Node;
  value: Node;
} & Msg;

type IntersectionNode = {
  type: "intersection";
  left: Node;
  right: Node;
} & Msg;

type MapNode = {
  type: "map";
  key: Node;
  value: Node;
} & Msg;

/**
 * A function schema. `input` is an array/tuple node describing the arguments,
 * `output` describes the return value. Both are optional: when omitted, Zod's
 * defaults are used (`z.array(z.unknown())` and `z.unknown()`).
 */
export type FunctionNode = {
  type: "function";
  input?: Node;
  output?: Node;
} & Msg;

export type TupleNode = {
  type: "tuple";
  items: Node[];
  rest?: Node;
} & Msg;

export type Node = (
  | StringNode
  | NumberNode
  | BooleanNode
  | AnyNode
  | UnknownNode
  | NeverNode
  | VoidNode
  | NullNode
  | UndefinedNode
  | NanNode
  | SymbolNode
  | BigIntNode
  | DateNode
  | FileNode
  | TransformNode
  | PipeNode
  | OptionalNode
  | NullableNode
  | ReadonlyNode
  | DefaultNode
  | CatchNode
  | ArrayNode
  | ObjectNode
  | EnumNode
  | LiteralNode
  | UnionNode
  | RecordNode
  | TupleNode
  | IntersectionNode
  | MapNode
  | FunctionNode
) &
  Meta;
