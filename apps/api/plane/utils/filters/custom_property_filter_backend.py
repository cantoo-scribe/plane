# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import re
from uuid import UUID

from django.db.models import Q

from plane.db.models import IssueCustomProperty, IssueCustomPropertyType
from plane.utils.filters.filter_backend import ComplexFilterBackend

CUSTOM_PROPERTY_KEY_RE = re.compile(
    r"^customproperty_(?P<property_id>[0-9a-fA-F-]{36})(?:__(?P<lookup>\w+))?$"
)


class IssueFilterBackend(ComplexFilterBackend):
    """Filter backend that understands customproperty_<uuid> filter keys."""

    def _transform_field_name_for_validation(self, field_name):
        if CUSTOM_PROPERTY_KEY_RE.match(field_name):
            # Bypass FilterSet allow-list; custom properties are validated in leaf build
            return "project_id"
        return field_name

    def _build_leaf_q(self, leaf_conditions, view, queryset):
        custom_conditions = {}
        standard_conditions = {}
        for key, value in leaf_conditions.items():
            if CUSTOM_PROPERTY_KEY_RE.match(key):
                custom_conditions[key] = value
            else:
                standard_conditions[key] = value

        combined_q = Q()
        if standard_conditions:
            combined_q &= super()._build_leaf_q(standard_conditions, view, queryset)
        if custom_conditions:
            combined_q &= self._build_custom_property_q(custom_conditions)
        return combined_q

    def _build_custom_property_q(self, conditions):
        combined = Q()
        for key, value in conditions.items():
            match = CUSTOM_PROPERTY_KEY_RE.match(key)
            if not match:
                continue
            try:
                property_id = UUID(match.group("property_id"))
            except ValueError:
                continue
            lookup = match.group("lookup") or "exact"
            prop = IssueCustomProperty.objects.filter(pk=property_id, is_active=True).first()
            if not prop:
                continue
            combined &= self._q_for_property(prop, lookup, value)
        return combined

    def _q_for_property(self, prop, lookup, value):
        base = Q(
            custom_property_values__property_id=prop.id,
            custom_property_values__deleted_at__isnull=True,
        )
        t = prop.property_type

        if t == IssueCustomPropertyType.TEXT:
            field = "custom_property_values__value_text"
            if lookup in ("icontains", "contains"):
                return base & Q(**{f"{field}__{lookup}": value})
            return base & Q(**{field: value})

        if t == IssueCustomPropertyType.NUMBER:
            field = "custom_property_values__value_number"
            if lookup in ("gt", "gte", "lt", "lte", "exact"):
                return base & Q(**{f"{field}__{lookup}" if lookup != "exact" else field: value})
            if lookup == "range" and isinstance(value, (list, tuple)) and len(value) == 2:
                return base & Q(**{f"{field}__range": value})
            return base & Q(**{field: value})

        if t == IssueCustomPropertyType.BOOLEAN:
            truthy = value in (True, "true", "True", 1, "1")
            return base & Q(custom_property_values__value_boolean=truthy)

        if t == IssueCustomPropertyType.DATE:
            field = "custom_property_values__value_datetime"
            if lookup == "range" and isinstance(value, str) and "," in value:
                start, end = value.split(",", 1)
                return base & Q(**{f"{field}__date__range": (start, end)})
            return base & Q(**{f"{field}__date": value})

        if t == IssueCustomPropertyType.DROPDOWN:
            ids = value if isinstance(value, list) else [value]
            if lookup == "in":
                return base & Q(custom_property_values__value_options__id__in=ids)
            return base & Q(custom_property_values__value_options__id=value)

        if t == IssueCustomPropertyType.MEMBER:
            ids = value if isinstance(value, list) else [value]
            if lookup == "in":
                return base & Q(custom_property_values__value_members__id__in=ids)
            return base & Q(custom_property_values__value_members__id=value)

        if t == IssueCustomPropertyType.FORMULA:
            field = "custom_property_values__value_number"
            return base & Q(**{field: value})

        return Q()
