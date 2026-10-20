/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssueCustomProperty } from "@plane/types";

/**
 * Build a rich-filter property key for a custom property definition.
 * Matches the backend convention: customproperty_<uuid>
 */
export const toCustomPropertyFilterKey = (propertyId: string, lookup?: string) =>
  lookup ? `customproperty_${propertyId}__${lookup}` : `customproperty_${propertyId}`;

/**
 * Returns a minimal filter config descriptor for a custom property.
 * Consumers wire this into the work-item filter UI alongside native properties.
 */
export const getCustomPropertyFilterMeta = (property: TIssueCustomProperty) => {
  const baseKey = toCustomPropertyFilterKey(property.id);
  switch (property.property_type) {
    case "TEXT":
      return { key: toCustomPropertyFilterKey(property.id, "icontains"), label: property.name, type: "text" as const };
    case "NUMBER":
    case "FORMULA":
      return { key: baseKey, label: property.name, type: "number" as const };
    case "BOOLEAN":
      return { key: baseKey, label: property.name, type: "boolean" as const };
    case "DATE":
      return { key: toCustomPropertyFilterKey(property.id, "range"), label: property.name, type: "date" as const };
    case "DROPDOWN":
      return {
        key: toCustomPropertyFilterKey(property.id, "in"),
        label: property.name,
        type: "dropdown" as const,
        options: (property.options ?? []).map((o) => ({ id: o.id, label: o.name })),
      };
    case "MEMBER":
      return { key: toCustomPropertyFilterKey(property.id, "in"), label: property.name, type: "member" as const };
    default:
      return { key: baseKey, label: property.name, type: "text" as const };
  }
};
