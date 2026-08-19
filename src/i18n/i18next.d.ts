import type { resources } from "./index";

/**
 * Makes `t("...")` key-checked at compile time against the Spanish catalogue,
 * which is the reference language for the project.
 */
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: (typeof resources)["es"];
  }
}
