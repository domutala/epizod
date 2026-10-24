---
"epizod": minor
---

Initial release.

- `toDefinition`: convert a Zod 4 schema into a portable JSON definition.
- `parseDefinition` / `isDefinition`: validate an untrusted definition.
- `fromDefinition`: rebuild a Zod schema from a definition, resolving `#:` references.
- Supported types: `string`, `number`, `boolean`, `bigint`, `date`, `file`, `symbol`, `nan`, `any`, `unknown`, `never`, `void`, `null`, `undefined`, `optional`, `nullable`, `readonly`, `default`, `catch`, `array`, `object`, `tuple`, `record`, `map`, `enum`, `literal`, `union`, `intersection`, `pipe`, `transform` and `function`.
- ESM and CommonJS builds with type declarations.