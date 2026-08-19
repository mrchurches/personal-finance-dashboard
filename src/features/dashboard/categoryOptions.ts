import type { TFunction } from "i18next";
import type { Category, CategoryKind } from "@shared/types";
import { categoryLabel } from "./labels";

interface LeafOption {
  label: string;
  value: string;
}

interface GroupOption {
  label: string;
  options: LeafOption[];
}

export type CategoryOption = LeafOption | GroupOption;

/**
 * Categories as a select's options, with groups rendered as option groups.
 *
 * A group is visible so it can be navigated but never selectable, because a
 * transaction attaches to a leaf: allowing a group would let a total be recorded
 * at two levels at once and stop the children from adding up to the parent.
 */
export function buildCategoryOptions(
  t: TFunction,
  categories: Category[],
  kind: CategoryKind,
): CategoryOption[] {
  const available = categories.filter((category) => category.kind === kind);
  const groupIds = new Set(
    available.map((category) => category.parentId).filter((id): id is string => id !== null),
  );

  const standalone: CategoryOption[] = available
    .filter((category) => category.parentId === null && !groupIds.has(category.id))
    .map((category) => ({ label: categoryLabel(t, category.id, category.name), value: category.id }));

  const groups: CategoryOption[] = available
    .filter((category) => groupIds.has(category.id))
    .map((group) => ({
      label: categoryLabel(t, group.id, group.name),
      options: available
        .filter((category) => category.parentId === group.id)
        .map((child) => ({ label: categoryLabel(t, child.id, child.name), value: child.id })),
    }));

  return [...standalone, ...groups];
}
