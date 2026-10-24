# ēpizod

**Dynamic, portable, Zod-compatible validation schemas.**

This library converts a Zod schema into a **JSON definition** (which you can store, version and transmit), then rebuilds a **real Zod schema** from that definition in any environment.

The definition is the persistent form of the schema. The rebuilt Zod schema is its executable form.

## Why?

- **Dynamic forms**: rules come from a database or a configuration, not from code.
- **Frontend and backend**: a single source of truth, rebuilt on both sides.
- **Custom fields** (SaaS): each organization defines its own rules.
- **Safe**: no function is ever serialized as a string, so there is no untrusted code execution. External functions and values go through [references](#references-).

## Installation

```bash
npm install epizod zod
```

Requirements: **Zod 4**. The `function` type requires **Zod 4.1 or later**.

## Quick start

```ts
import { z } from "zod";
import { toDefinition, parseDefinition, fromDefinition } from "epizod";

const tolower = (value: string) => value.toLowerCase();

// 1. Zod schema → JSON definition
const def = toDefinition(
  z
    .object(
      {
        name: z.string().min(1, { error: "Name is required" }),
        nickname: z.string().array().optional(),
        emails: z.string().transform(tolower).optional(),
        avatar: z
          .file()
          .min(10, "Too small")
          .mime(["image/png", "image/jpeg"])
          .optional(),
      },
      { error: "Invalid user" },
    )
    .describe("User form"),
);

// 2. Storage / transport: it is plain JSON
const json = JSON.stringify(def);

// 3. Validate an untrusted definition
const node = parseDefinition(JSON.parse(json));

// 4. Definition → Zod schema (providing the references)
const schema = fromDefinition(node, { tolower });

schema.parse({ name: "Ada", emails: "ADA@EXAMPLE.COM" });
```

## API

### `toDefinition(schema: z.ZodType): Node`

Converts a Zod schema into a definition. Throws if the schema contains an unsupported element (see [Limitations](#limitations)).

The error message (`error: "..."`) is kept in `message`, and metadata (`.describe()`, `.meta()`) in `meta`.

### `parseDefinition(value: unknown): Node`

Validates an unknown value and returns the canonical definition. The input is cloned, so you can safely mutate your original object afterwards. Throws a Zod error if the definition is invalid.

Validation is strict: unknown properties are rejected, and each type only accepts its own rules (an `email` rule on a `number` is rejected).

### `isDefinition(value: unknown): value is Node`

Like `parseDefinition`, but returns `true` or `false` instead of throwing.

### `fromDefinition(node: Node, refs?: Refs): z.ZodType`

Rebuilds a Zod schema. `refs` maps a name to a value (function, `RegExp`, number, etc.) to resolve [references](#references-).

## Definition format

A definition is a tree of nodes. Each node has a `type`, and may have:

| Field     | Purpose                                                  |
| --------- | -------------------------------------------------------- |
| `message` | Custom error message                                     |
| `meta`    | JSON metadata (description, label, etc.)                 |

Example:

```json
{
  "type": "object",
  "shape": {
    "name": {
      "type": "string",
      "checks": [{ "check": "min", "value": 1, "message": "Name is required" }]
    },
    "nickname": {
      "type": "optional",
      "inner": {
        "type": "array",
        "element": { "type": "string", "checks": [] },
        "checks": []
      }
    }
  },
  "message": "Invalid user",
  "meta": { "description": "User form" }
}
```

### Supported types

| Category    | Types                                                                                          |
| ----------- | ---------------------------------------------------------------------------------------------- |
| Primitives  | `string`, `number`, `boolean`, `bigint`, `date`, `file`, `symbol`, `nan`                       |
| Special     | `any`, `unknown`, `never`, `void`, `null`, `undefined`                                         |
| Wrappers    | `optional`, `nullable`, `readonly`, `default`, `catch`                                         |
| Collections | `array`, `object`, `tuple`, `record`, `map`                                                    |
| Values      | `enum`, `literal`                                                                              |
| Composition | `union`, `intersection`, `pipe`, `transform`                                                   |
| Other       | `function`                                                                                     |

The `string`, `number`, `boolean`, `bigint` and `date` types accept `"coerce": true`.

### Composition nodes

```jsonc
// intersection: left AND right
{ "type": "intersection", "left": { /* Node */ }, "right": { /* Node */ } }

// map: key -> value
{ "type": "map", "key": { /* Node */ }, "value": { /* Node */ } }

// function: input (array or tuple) and output, both optional
{ "type": "function", "input": { /* Node */ }, "output": { /* Node */ } }
```

For `function`, if `input` and `output` are omitted, Zod uses its defaults (`z.array(z.unknown())` and `z.unknown()`). The rebuilt schema checks that the value is a function. Arguments and return value are checked through `.implement()` or `.implementAsync()`.

For `map`, the definition only describes the schema: a `Map` value cannot be serialized to JSON as is.

### Validation rules (`checks`)

| Type     | Rules                                                                                               |
| -------- | --------------------------------------------------------------------------------------------------- |
| `string` | `min`, `max`, `length`, `regex`, `format`, `includes`, `starts_with`, `ends_with`                   |
| `number` | `min`, `max`, `gt`, `lt`, `multiple_of`, `int`, `int32`, `uint32`, `float32`, `float64`             |
| `bigint` | `min`, `max`, `gt`, `lt`, `multiple_of`, `int64`, `uint64` (values as decimal strings)              |
| `date`   | `min`, `max` (ISO 8601 values)                                                                      |
| `file`   | `min`, `max` (in bytes), `mime`                                                                     |
| `array`  | `min`, `max`, `length`                                                                              |

String formats (`{ "check": "format", "value": { "format": "email" } }`):
`email`, `url`, `emoji`, `uuid`, `guid`, `nanoid`, `cuid`, `cuid2`, `ulid`, `xid`, `ksuid`, `datetime`, `date`, `time`, `duration`, `ipv4`, `ipv6`, `mac`, `cidrv4`, `cidrv6`, `base64`, `base64url`, `json`, `e164`, `credit_card`, `iban`, `lowercase`, `uppercase`, `jwt`, `hex`, `hostname`, `currency_code`, plus hashes (`md5`, `sha1`, `sha256`, `sha384`, `sha512`) as `_hex`, `_base64` and `_base64url`.

## References (`#:`)

A string starting with `#:` designates a value provided at rebuild time, by name:

```ts
const def = toDefinition(z.string().transform(tolower));
// { type: "transform", transform: "#:tolower", inner: { type: "string", ... } }

const schema = fromDefinition(def, { tolower });
```

They are used for:

- **transform functions** (`transform`). They must be **named** functions so that `toDefinition` can generate the reference;
- rule **values** (numbers, `RegExp`, MIME lists, `bigint`, dates).

If a reference is missing from `refs`, `fromDefinition` throws an `unresolved reference` error. A literal string starting with `#:` cannot be used as a `default`, `catch` or `literal` value, because it would be read back as a reference.

## Limitations

Some Zod features cannot be represented in JSON. `toDefinition` then throws an explicit error:

- custom rules (`.refine()`, `.superRefine()`, custom `.check()`);
- custom string formats;
- objects in `strict` or `loose` mode, or with `catchall`;
- partial `record`, or `record` outside strict mode;
- anonymous transforms (functions without a name);
- `default` and `catch` values that are not JSON-serializable.

## Best practices

- **Always validate on the server.** A schema running in the browser does not guarantee security.
- **Pass any untrusted definition through `parseDefinition`** before rebuilding it.
- **Use compatible versions** of the library on both sides (frontend and backend) to guarantee identical validation.
- **Provide the same `refs`** everywhere you rebuild a schema.

## License

[MIT](./LICENSE)