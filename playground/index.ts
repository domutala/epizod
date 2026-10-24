import z from "zod";
import { toDefinition, fromDefinition } from "../src/index.js";

function tolower(val: string) {
  return val.toLowerCase();
}

const base = z.object({
  name: z.string().min(1, { error: "Name is required" }),
  nickname: z.string().array().optional(),
  emails: z.string().transform(tolower).optional(),
  avatar: z
    .file()
    .min(10, "Trop petit")
    .mime(["image/png", "image/jpeg"])
    .optional(),
});

const admin = z.object({
  role: z.literal("admin"),
  permissions: z.array(z.string()).min(1),
});

const userSchema = z
  .object(
    {
      // intersection : un utilisateur de base ET les champs admin
      account: z.intersection(base, admin),
      // même chose avec la syntaxe fluide : base.and(admin)

      // map : clé string -> valeur number (ex. quotas par service)
      quotas: z.map(z.string(), z.number().int().min(0)).optional(),

      // function : (string) => boolean
      onValidate: z
        .function({
          input: z.tuple([z.string()]),
          output: z.boolean(),
        })
        .optional(),
    },
    { error: "Invalid user" },
  )
  .describe("User form");

const def = toDefinition(userSchema);

// Aller-retour : la définition JSON redonne un schéma Zod équivalent.
// `tolower` est référencé par nom ("#:tolower"), il doit donc être fourni ici.
const rebuilt = fromDefinition(def, { tolower });

console.log(def);
