import z from "zod";

const Player = z.object({
  username: z
    .string({ error: "Username" })
    .min(3, "yes")

    .catch("145")
    .meta({ label: "" })
    .transform(trs),
  xp: z.number(),
});

function trs(v: string) {
  return v;
}

// console.log(Player.def.shape.username.def);
console.log(Player.type);
console.log(Player.def.shape.username.def.out.def.transform.name);

// .type est présent sur tous les object

/**
 * quand on on met .default, .optional, .catch et .array à
 * un schema (string par exemple), ils deviennent le schéma princiaple
 */

// nullable -> innerType
// default -> innerType
// default -> def : si c'est le type de départ

// optional -> innerType

// array -> element

// object -> def
// string -> def

/**
 * .transform ajoute un pipe
 * le type pipe expose deux objets:
 * in: l'objet à transformer.
 * out: l'objet qui transforme de type tranform avec def.transform un fonction
 */

// avec .record  et .map on a def.keyType et def.valueType

// avec .union on .def.options

function readMessage(def: any): { message?: string } {
  const message = def.error?.({ ...def, input: undefined });
  return typeof message === "string" ? { message } : {};
}

function getMeta(schema: z.ZodType): z.GlobalMeta {
  return schema.meta() ?? {};
}
