import { z } from "zod";
import type {
  Node,
  StringNode,
  NumberNode,
  BooleanNode,
  BigIntNode,
  DateNode,
  FileNode,
  TupleNode,
  FunctionNode,
} from "./types.js";
import {
  unsupported,
  getSchemaDef,
  requiredSchema,
  requiredRecord,
  requiredArray,
  withMessage,
  coerceEnabled,
  assertNoChecks,
  assertPlainObjectMode,
  toStringChecks,
  toNumberChecks,
  toBigIntChecks,
  toDateChecks,
  toFileChecks,
  toSizeChecks,
  toTransformRef,
  assertNotRef,
  toEnumValues,
  toLiteralValues,
  cloneMetadata,
  cloneJson,
} from "./helpers.js";

export function toDefinition(schema: z.ZodType): Node {
  const meta = cloneMetadata(schema);
  const node = toNode(schema);
  return meta === undefined ? node : { ...node, meta };
}

function toNode(schema: z.ZodType): Node {
  const def = getSchemaDef(schema);

  switch (def.type) {
    case "string": {
      const node: StringNode = {
        type: "string",
        checks: toStringChecks(def),
      };
      if (coerceEnabled(def, "string")) node.coerce = true;
      return withMessage(node, def);
    }

    case "number": {
      const node: NumberNode = {
        type: "number",
        checks: toNumberChecks(def),
      };
      if (coerceEnabled(def, "number")) node.coerce = true;
      return withMessage(node, def);
    }

    case "boolean": {
      assertNoChecks(def, "boolean");
      const node: BooleanNode = { type: "boolean" };
      if (coerceEnabled(def, "boolean")) node.coerce = true;
      return withMessage(node, def);
    }

    case "any":
    case "unknown":
    case "never":
    case "void":
    case "null":
    case "undefined":
    case "nan":
    case "symbol":
      assertNoChecks(def, def.type);
      return withMessage({ type: def.type }, def);

    case "bigint": {
      const node: BigIntNode = {
        type: "bigint",
        checks: toBigIntChecks(def),
      };
      if (coerceEnabled(def, "bigint")) node.coerce = true;
      return withMessage(node, def);
    }

    case "date": {
      const node: DateNode = {
        type: "date",
        checks: toDateChecks(def),
      };
      if (coerceEnabled(def, "date")) node.coerce = true;
      return withMessage(node, def);
    }

    case "optional":
      assertNoChecks(def, "optional");
      return withMessage(
        {
          type: "optional",
          inner: toDefinition(requiredSchema(def.innerType, "innerType")),
        },
        def,
      );

    case "nullable":
      assertNoChecks(def, "nullable");
      return withMessage(
        {
          type: "nullable",
          inner: toDefinition(requiredSchema(def.innerType, "innerType")),
        },
        def,
      );

    case "readonly":
      assertNoChecks(def, "readonly");
      return withMessage(
        {
          type: "readonly",
          inner: toDefinition(requiredSchema(def.innerType, "innerType")),
        },
        def,
      );

    case "default": {
      assertNoChecks(def, "default");
      if (!("defaultValue" in def)) {
        unsupported('missing property "defaultValue"');
      }

      const rawValue =
        typeof def.defaultValue === "function"
          ? (def.defaultValue as () => unknown)()
          : def.defaultValue;
      assertNotRef(rawValue, "defaultValue");

      return withMessage(
        {
          type: "default",
          inner: toDefinition(requiredSchema(def.innerType, "innerType")),
          defaultValue: cloneJson(rawValue, "defaultValue"),
        },
        def,
      );
    }

    case "catch": {
      assertNoChecks(def, "catch");
      if (typeof def.catchValue !== "function") {
        unsupported('missing or invalid property "catchValue"');
      }

      const catchValue = def.catchValue as (ctx: object) => unknown;
      let caught: unknown;
      try {
        caught = catchValue({});
      } catch {
        unsupported("catch value getter threw");
      }

      assertNotRef(caught, "catchValue");

      return withMessage(
        {
          type: "catch",
          inner: toDefinition(requiredSchema(def.innerType, "innerType")),
          catchValue: cloneJson(caught, "catchValue"),
        },
        def,
      );
    }

    case "array":
      return withMessage(
        {
          type: "array",
          element: toDefinition(requiredSchema(def.element, "element")),
          checks: toSizeChecks(def),
        },
        def,
      );

    case "object": {
      assertNoChecks(def, "object");
      assertPlainObjectMode(def);

      const shape = requiredRecord(def.shape, "shape");
      const nodes: Record<string, Node> = {};
      for (const [key, child] of Object.entries(shape)) {
        nodes[key] = toDefinition(child);
      }

      return withMessage({ type: "object", shape: nodes }, def);
    }

    case "enum":
      assertNoChecks(def, "enum");
      return withMessage(
        { type: "enum", values: toEnumValues(def.entries) },
        def,
      );

    case "literal":
      assertNoChecks(def, "literal");
      return withMessage(
        { type: "literal", values: toLiteralValues(def.values) },
        def,
      );

    case "union": {
      assertNoChecks(def, "union");
      const options = requiredArray(def.options, "options");
      if (options.length === 0) unsupported("empty union");

      return withMessage(
        {
          type: "union",
          options: options.map((option) => toDefinition(option)),
        },
        def,
      );
    }

    case "record": {
      assertNoChecks(def, "record");

      if (def.mode !== undefined && def.mode !== "strict") {
        unsupported(`record mode "${String(def.mode)}"`);
      }
      if (def.partial !== undefined && def.partial !== false) {
        unsupported("partial record");
      }

      return withMessage(
        {
          type: "record",
          key: toDefinition(requiredSchema(def.keyType, "keyType")),
          value: toDefinition(requiredSchema(def.valueType, "valueType")),
        },
        def,
      );
    }

    case "tuple": {
      assertNoChecks(def, "tuple");
      const items = requiredArray(def.items, "items");

      const node: TupleNode = {
        type: "tuple",
        items: items.map((item) => toDefinition(item)),
      };
      if (def.rest !== undefined && def.rest !== null) {
        node.rest = toDefinition(def.rest);
      }

      return withMessage(node, def);
    }

    case "intersection":
      assertNoChecks(def, "intersection");
      return withMessage(
        {
          type: "intersection",
          left: toDefinition(requiredSchema(def.left, "left")),
          right: toDefinition(requiredSchema(def.right, "right")),
        },
        def,
      );

    case "map":
      assertNoChecks(def, "map");
      return withMessage(
        {
          type: "map",
          key: toDefinition(requiredSchema(def.keyType, "keyType")),
          value: toDefinition(requiredSchema(def.valueType, "valueType")),
        },
        def,
      );

    case "function": {
      assertNoChecks(def, "function");

      const node: FunctionNode = { type: "function" };
      if (def.input !== undefined) node.input = toDefinition(def.input);
      if (def.output !== undefined) node.output = toDefinition(def.output);

      return withMessage(node, def);
    }

    case "pipe": {
      assertNoChecks(def, "pipe");
      const input = requiredSchema(def.in, "in");
      const out = requiredSchema(def.out, "out");
      const outDef = getSchemaDef(out);

      if (outDef.type === "transform") {
        return withMessage(
          {
            type: "transform",
            transform: toTransformRef(outDef.transform),
            inner: toDefinition(input),
          },
          def,
        );
      }

      return withMessage(
        { type: "pipe", in: toDefinition(input), out: toDefinition(out) },
        def,
      );
    }

    case "file":
      return withMessage(
        { type: "file", checks: toFileChecks(def) } satisfies FileNode,
        def,
      );

    case "transform":
      assertNoChecks(def, "transform");
      return withMessage(
        { type: "transform", transform: toTransformRef(def.transform) },
        def,
      );

    default:
      unsupported(`type "${def.type}"`);
  }
}
