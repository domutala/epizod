import { z } from "zod";
import {
  type JsonObject,
  type JsonPrimitive,
  type JsonValue,
  type SchemaDef,
  type CheckDef,
  type CheckLike,
  type ErrorSource,
  type StringCheck,
  type StringFormat,
  type StringFormatValue,
  type RegexValue,
  type NumberCheck,
  type SizeCheck,
  type BigIntCheck,
  type DateCheck,
  type FileCheck,
  type Msg,
  INTERNAL_STRING_FORMATS,
  type InternalStringFormat,
  type Ref,
  isRef,
} from "./types.js";

export function unsupported(detail: string): never {
  throw new Error(`Unsupported in definition: ${detail}`);
}

export function getSchemaDef(schema: z.ZodType): SchemaDef {
  if (
    (typeof schema !== "object" && typeof schema !== "function") ||
    schema === null
  ) {
    unsupported("missing Zod 4 schema");
  }

  const holder = schema as unknown as {
    _zod?: {
      def?: SchemaDef;
    };
  };

  const def = holder._zod?.def;
  if (def === undefined || typeof def.type !== "string") {
    unsupported("missing Zod 4 definition");
  }

  return def;
}

export function getCheckDef(
  check: CheckLike | undefined,
  owner: string,
): CheckDef {
  if (check === undefined) {
    unsupported(`${owner} check`);
  }

  const def = check._zod?.def;
  if (def === undefined || typeof def.check !== "string") {
    unsupported(`${owner} check definition`);
  }

  return def;
}

export function requiredSchema(
  value: z.ZodType | null | undefined,
  property: string,
): z.ZodType {
  if (value === undefined || value === null) {
    unsupported(`missing property "${property}"`);
  }
  return value;
}

export function requiredRecord<T>(
  value: Record<string, T> | undefined,
  property: string,
): Record<string, T> {
  if (value === undefined) {
    unsupported(`missing property "${property}"`);
  }
  return value;
}

export function requiredArray<T>(
  value: readonly T[] | undefined,
  property: string,
): readonly T[] {
  if (value === undefined || !Array.isArray(value)) {
    unsupported(`missing or invalid property "${property}"`);
  }
  return value;
}

export function requiredNumber(value: unknown, property: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    unsupported(`expected number property "${property}"`);
  }
  return value;
}

export function requiredString(value: unknown, property: string): string {
  if (typeof value !== "string") {
    unsupported(`expected string property "${property}"`);
  }
  return value;
}

export function requiredBoolean(value: unknown, property: string): boolean {
  if (typeof value !== "boolean") {
    unsupported(`expected boolean property "${property}"`);
  }
  return value;
}

export function withMessage<T extends object>(
  value: T,
  def: ErrorSource,
): T & Msg {
  const message = readMessage(def).message;
  return message === undefined ? value : { ...value, message };
}

export function readMessage(def: ErrorSource): Msg {
  const message = def.error?.({ ...def, input: undefined });
  return typeof message === "string" ? { message } : {};
}

export function coerceEnabled(def: SchemaDef, typeName: string): boolean {
  if (def.coerce === undefined || def.coerce === false) return false;
  if (def.coerce === true) return true;
  unsupported(`${typeName} coerce value`);
}

export function assertNoChecks(def: SchemaDef, owner: string): void {
  const first = def.checks?.[0];
  if (first === undefined) return;
  unsupported(`${owner} check "${getCheckDef(first, owner).check}"`);
}

export function assertPlainObjectMode(def: SchemaDef): void {
  if (def.mode !== undefined && def.mode !== "strip") {
    unsupported(`object mode "${String(def.mode)}"`);
  }
  if (def.catchall !== undefined && def.catchall !== null) {
    unsupported("object catchall");
  }
}

export function toStringChecks(def: SchemaDef): StringCheck[] {
  const checks: StringCheck[] = [];

  if (def.check !== undefined) {
    if (def.check !== "string_format" && def.check !== "regex") {
      unsupported(`string check "${String(def.check)}"`);
    }
    checks.push(toStringFormatCheck(def, "string"));
  }

  for (const check of def.checks ?? []) {
    checks.push(toStringCheck(getCheckDef(check, "string")));
  }

  return checks;
}

export function toStringCheck(def: CheckDef): StringCheck {
  switch (def.check) {
    case "min_length":
      return withMessage(
        {
          check: "min",
          value: requiredNumber(def.minimum, "minimum"),
        },
        def,
      );

    case "max_length":
      return withMessage(
        {
          check: "max",
          value: requiredNumber(def.maximum, "maximum"),
        },
        def,
      );

    case "length_equals":
      return withMessage(
        {
          check: "length",
          value: requiredNumber(def.length, "length"),
        },
        def,
      );

    case "string_format":
      return toStringFormatCheck(def, "string check");

    case "regex":
      return toRegexCheck(def);

    default:
      unsupported(`string check "${def.check}"`);
  }
}

export function toStringFormatCheck(
  def: SchemaDef | CheckDef,
  owner: string,
): StringCheck {
  const internalFormat = requiredString(def.format, `${owner} format`);

  if (internalFormat === "regex") return toRegexCheck(def);

  if (internalFormat === "includes") {
    const value: { text: string; position?: number } = {
      text: requiredString(def.includes, "includes"),
    };
    if (def.position !== undefined) {
      value.position = requiredNumber(def.position, "position");
    }
    return withMessage({ check: "includes", value }, def);
  }

  if (internalFormat === "starts_with") {
    return withMessage(
      {
        check: "starts_with",
        value: assertNotRef(requiredString(def.prefix, "prefix"), "prefix"),
      },
      def,
    );
  }

  if (internalFormat === "ends_with") {
    return withMessage(
      {
        check: "ends_with",
        value: assertNotRef(requiredString(def.suffix, "suffix"), "suffix"),
      },
      def,
    );
  }

  if (!isInternalStringFormat(internalFormat)) {
    unsupported(`string format "${internalFormat}"`);
  }
  if (def.fn !== undefined) {
    unsupported(`custom string format "${internalFormat}"`);
  }

  const format: StringFormat =
    internalFormat === "json_string" ? "json" : internalFormat;

  const value: StringFormatValue = { format };
  const options = stringFormatOptions(def, format);
  if (Object.keys(options).length > 0) value.options = options;

  return withMessage({ check: "format", value }, def);
}

export function isInternalStringFormat(
  value: string,
): value is InternalStringFormat {
  return (INTERNAL_STRING_FORMATS as readonly string[]).includes(value);
}

export function toRegexCheck(def: SchemaDef | CheckDef): StringCheck {
  if (!(def.pattern instanceof RegExp)) {
    unsupported("regex check without a RegExp pattern");
  }

  const value: RegexValue = { source: def.pattern.source };
  if (def.pattern.flags !== "") value.flags = def.pattern.flags;

  return withMessage({ check: "regex", value }, def);
}

export function stringFormatOptions(
  def: SchemaDef | CheckDef,
  format: StringFormat,
): JsonObject {
  const options: JsonObject = {};
  const path = `format "${format}"`;

  const add = (key: string): void => {
    if (def[key] !== undefined) {
      options[key] = cloneJson(def[key], `${path}.${key}`);
    }
  };

  const addRegex = (key: string): void => {
    const value = def[key];
    if (value === undefined) return;
    if (!(value instanceof RegExp)) {
      unsupported(`expected RegExp property "${key}" in ${path}`);
    }
    options[key] = regexToJson(value);
  };

  switch (format) {
    case "url":
      addRegex("hostname");
      addRegex("protocol");
      add("normalize");
      break;

    case "datetime":
      add("precision");
      add("offset");
      add("local");
      break;

    case "time":
      add("precision");
      break;

    case "uuid":
    case "ipv4":
    case "ipv6":
    case "cidrv4":
    case "cidrv6":
      add("version");
      break;

    case "nanoid":
      add("length");
      break;

    case "jwt":
      add("alg");
      break;

    case "mac":
      add("delimiter");
      break;
  }

  return options;
}

export function regexToJson(pattern: RegExp): JsonObject {
  const value: JsonObject = { source: pattern.source };
  if (pattern.flags !== "") value.flags = pattern.flags;
  return value;
}

export function toNumberChecks(def: SchemaDef): NumberCheck[] {
  const checks: NumberCheck[] = [];

  if (def.check !== undefined) {
    if (def.check !== "number_format") {
      unsupported(`number check "${String(def.check)}"`);
    }
    checks.push(toNumberFormatCheck(def));
  }

  for (const check of def.checks ?? []) {
    checks.push(toNumberCheck(getCheckDef(check, "number")));
  }

  return checks;
}

export function toNumberCheck(def: CheckDef): NumberCheck {
  switch (def.check) {
    case "greater_than": {
      const inclusive = requiredBoolean(def.inclusive, "inclusive");
      return withMessage(
        {
          check: inclusive ? "min" : "gt",
          value: requiredNumber(def.value, "value"),
        },
        def,
      );
    }

    case "less_than": {
      const inclusive = requiredBoolean(def.inclusive, "inclusive");
      return withMessage(
        {
          check: inclusive ? "max" : "lt",
          value: requiredNumber(def.value, "value"),
        },
        def,
      );
    }

    case "multiple_of":
      return withMessage(
        {
          check: "multiple_of",
          value: requiredNumber(def.value, "value"),
        },
        def,
      );

    case "number_format":
      return toNumberFormatCheck(def);

    default:
      unsupported(`number check "${def.check}"`);
  }
}

export function toNumberFormatCheck(def: SchemaDef | CheckDef): NumberCheck {
  const format = requiredString(def.format, "number format");

  switch (format) {
    case "safeint":
      return withMessage({ check: "int" }, def);
    case "int32":
      return withMessage({ check: "int32" }, def);
    case "uint32":
      return withMessage({ check: "uint32" }, def);
    case "float32":
      return withMessage({ check: "float32" }, def);
    case "float64":
      return withMessage({ check: "float64" }, def);
    default:
      unsupported(`number format "${format}"`);
  }
}

export function toSizeChecks(def: SchemaDef): SizeCheck[] {
  const checks: SizeCheck[] = [];

  for (const check of def.checks ?? []) {
    const checkDef = getCheckDef(check, "array");

    switch (checkDef.check) {
      case "min_length":
        checks.push(
          withMessage(
            {
              check: "min",
              value: requiredNumber(checkDef.minimum, "minimum"),
            },
            checkDef,
          ),
        );
        break;

      case "max_length":
        checks.push(
          withMessage(
            {
              check: "max",
              value: requiredNumber(checkDef.maximum, "maximum"),
            },
            checkDef,
          ),
        );
        break;

      case "length_equals":
        checks.push(
          withMessage(
            {
              check: "length",
              value: requiredNumber(checkDef.length, "length"),
            },
            checkDef,
          ),
        );
        break;

      default:
        unsupported(`array check "${checkDef.check}"`);
    }
  }

  return checks;
}

export function toEnumValues(entries: unknown): JsonPrimitive[] {
  let values: readonly unknown[];

  if (Array.isArray(entries)) {
    values = entries;
  } else if (isRecord(entries)) {
    values = Object.keys(entries)
      .filter((key) => !isEnumReverseMapping(entries, key))
      .map((key) => entries[key]);
  } else {
    unsupported('missing or invalid property "entries"');
  }

  if (values.length === 0) unsupported("empty enum");

  return values.map((value, index) =>
    toJsonPrimitive(value, `enum value at index ${index}`),
  );
}

export function isEnumReverseMapping(
  entries: Record<string, unknown>,
  key: string,
): boolean {
  if (!/^\d+$/.test(key)) return false;
  const value = entries[key];
  return typeof value === "string" && entries[value] === Number(key);
}

export function toLiteralValues(
  values: readonly unknown[] | undefined,
): JsonPrimitive[] {
  const literals = requiredArray(values, "values");
  if (literals.length === 0) unsupported("empty literal");

  return literals.map((value, index) =>
    toJsonPrimitive(value, `literal value at index ${index}`),
  );
}

export function toJsonPrimitive(value: unknown, path: string): JsonPrimitive {
  const cloned = cloneJson(value, path);
  if (
    cloned !== null &&
    typeof cloned !== "string" &&
    typeof cloned !== "number" &&
    typeof cloned !== "boolean"
  ) {
    unsupported(`non-primitive value at ${path}`);
  }
  return cloned;
}

export function cloneMetadata(schema: z.ZodType): JsonObject | undefined {
  const meta = schema.meta();
  if (meta === undefined) return undefined;

  const cloned = cloneJson(meta, "metadata");
  if (!isJsonObject(cloned)) {
    unsupported("metadata must be a JSON object");
  }
  return cloned;
}

export function cloneJson(
  value: unknown,
  path: string,
  seen: Set<object> = new Set(),
): JsonValue {
  switch (typeof value) {
    case "string":
    case "boolean":
      return value;

    case "number":
      if (!Number.isFinite(value)) {
        unsupported(`non-JSON number at ${path}`);
      }
      return value;

    case "object": {
      if (value === null) return null;
      if (seen.has(value)) {
        unsupported(`circular reference at ${path}`);
      }
      if (Object.getOwnPropertySymbols(value).length > 0) {
        unsupported(`symbol key at ${path}`);
      }

      seen.add(value);
      try {
        if (Array.isArray(value)) {
          return value.map((item, index) =>
            cloneJson(item, `${path}[${index}]`, seen),
          );
        }

        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) {
          unsupported(`non-plain object at ${path}`);
        }

        const record = value as Record<string, unknown>;
        const output: Record<string, JsonValue> = {};
        for (const key of Object.keys(record)) {
          output[key] = cloneJson(record[key], `${path}.${key}`, seen);
        }
        return output;
      } finally {
        seen.delete(value);
      }
    }

    default:
      unsupported(`non-JSON value at ${path}`);
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requiredBigInt(value: unknown, property: string): bigint {
  if (typeof value !== "bigint") {
    unsupported(`expected bigint property "${property}"`);
  }
  return value;
}

export function requiredDate(value: unknown, property: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    unsupported(`expected valid Date property "${property}"`);
  }
  return value;
}

export function toBigIntChecks(def: SchemaDef): BigIntCheck[] {
  const checks: BigIntCheck[] = [];

  if (def.check !== undefined) {
    if (def.check !== "bigint_format") {
      unsupported(`bigint check "${String(def.check)}"`);
    }
    checks.push(toBigIntFormatCheck(def));
  }

  for (const check of def.checks ?? []) {
    checks.push(toBigIntCheck(getCheckDef(check, "bigint")));
  }

  return checks;
}

export function toBigIntCheck(def: CheckDef): BigIntCheck {
  switch (def.check) {
    case "greater_than": {
      const inclusive = requiredBoolean(def.inclusive, "inclusive");
      return withMessage(
        {
          check: inclusive ? "min" : "gt",
          value: requiredBigInt(def.value, "value").toString(),
        },
        def,
      );
    }

    case "less_than": {
      const inclusive = requiredBoolean(def.inclusive, "inclusive");
      return withMessage(
        {
          check: inclusive ? "max" : "lt",
          value: requiredBigInt(def.value, "value").toString(),
        },
        def,
      );
    }

    case "multiple_of":
      return withMessage(
        {
          check: "multiple_of",
          value: requiredBigInt(def.value, "value").toString(),
        },
        def,
      );

    case "bigint_format":
      return toBigIntFormatCheck(def);

    default:
      unsupported(`bigint check "${def.check}"`);
  }
}

export function toBigIntFormatCheck(def: SchemaDef | CheckDef): BigIntCheck {
  const format = requiredString(def.format, "bigint format");

  switch (format) {
    case "int64":
      return withMessage({ check: "int64" }, def);
    case "uint64":
      return withMessage({ check: "uint64" }, def);
    default:
      unsupported(`bigint format "${format}"`);
  }
}

export function toDateChecks(def: SchemaDef): DateCheck[] {
  if (def.check !== undefined) {
    unsupported(`date check "${String(def.check)}"`);
  }

  return (def.checks ?? []).map((check) =>
    toDateCheck(getCheckDef(check, "date")),
  );
}

export function toDateCheck(def: CheckDef): DateCheck {
  switch (def.check) {
    case "greater_than":
    case "less_than": {
      if (!requiredBoolean(def.inclusive, "inclusive")) {
        unsupported(`exclusive date bound "${def.check}"`);
      }
      return withMessage(
        {
          check: def.check === "greater_than" ? "min" : "max",
          value: toIsoDate(def.value),
        },
        def,
      );
    }

    default:
      unsupported(`date check "${def.check}"`);
  }
}

function toIsoDate(value: unknown): string {
  const iso = requiredDate(value, "value").toISOString();
  if (!/^\d{4}-/.test(iso))
    unsupported(`date outside years 0000-9999 "${iso}"`);
  return iso;
}

export function toTransformRef(fn: unknown): Ref {
  if (typeof fn !== "function") unsupported('missing property "transform"');
  if (!/^[A-Za-z_$][\w$]*$/.test(fn.name)) {
    unsupported(`transform must be a named function (got "${fn.name}")`);
  }
  return `#:${fn.name}`;
}

// A literal string starting with "#:" would be read back as a reference.
export function assertNotRef<T>(value: T, path: string): T {
  if (isRef(value)) {
    unsupported(`literal string starting with "#:" at ${path}`);
  }
  return value;
}

export function toFileChecks(def: SchemaDef): FileCheck[] {
  if (def.check !== undefined) unsupported(`file check "${String(def.check)}"`);

  return (def.checks ?? []).map((check) =>
    toFileCheck(getCheckDef(check, "file")),
  );
}

export function toFileCheck(def: CheckDef): FileCheck {
  switch (def.check) {
    case "min_size":
      return withMessage(
        { check: "min", value: requiredNumber(def.minimum, "minimum") },
        def,
      );

    case "max_size":
      return withMessage(
        { check: "max", value: requiredNumber(def.maximum, "maximum") },
        def,
      );

    case "mime_type": {
      const mime = requiredArray(
        def.mime as readonly unknown[] | undefined,
        "mime",
      );
      return withMessage(
        {
          check: "mime",
          value: mime.map((type) => requiredString(type, "mime")),
        },
        def,
      );
    }

    default:
      unsupported(`file check "${def.check}"`);
  }
}
