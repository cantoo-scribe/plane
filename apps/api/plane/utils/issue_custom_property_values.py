# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Shared helpers for applying custom property values on issues."""

from __future__ import annotations

import re

from django.utils.dateparse import parse_datetime

from plane.db.models import (
    IssueCustomProperty,
    IssueCustomPropertyOption,
    IssueCustomPropertyType,
    IssueCustomPropertyValue,
)


def is_empty_value(prop, data):
    t = prop.property_type
    if t == IssueCustomPropertyType.TEXT:
        return not data.get("value_text")
    if t == IssueCustomPropertyType.NUMBER:
        return data.get("value_number") is None
    if t == IssueCustomPropertyType.BOOLEAN:
        return data.get("value_boolean") is None
    if t == IssueCustomPropertyType.DATE:
        return data.get("value_datetime") is None
    if t == IssueCustomPropertyType.DROPDOWN:
        return not data.get("value_option_ids")
    if t == IssueCustomPropertyType.MEMBER:
        return not data.get("value_member_ids")
    return False


def apply_value_payload(value_obj, prop, payload):
    """Apply typed fields from a write payload onto a value instance."""
    property_type = prop.property_type

    if property_type == IssueCustomPropertyType.TEXT:
        value_obj.value_text = payload.get("value_text")
        value_obj.value_number = None
        value_obj.value_boolean = None
        value_obj.value_datetime = None
    elif property_type == IssueCustomPropertyType.NUMBER:
        value_obj.value_number = payload.get("value_number")
        value_obj.value_text = None
        value_obj.value_boolean = None
        value_obj.value_datetime = None
    elif property_type == IssueCustomPropertyType.BOOLEAN:
        value_obj.value_boolean = payload.get("value_boolean")
        value_obj.value_text = None
        value_obj.value_number = None
        value_obj.value_datetime = None
    elif property_type == IssueCustomPropertyType.DATE:
        raw = payload.get("value_datetime")
        if isinstance(raw, str):
            raw = parse_datetime(raw)
        value_obj.value_datetime = raw
        value_obj.value_text = None
        value_obj.value_number = None
        value_obj.value_boolean = None
    elif property_type == IssueCustomPropertyType.FORMULA:
        value_obj.value_text = payload.get("value_text")
        value_obj.value_number = payload.get("value_number")
    elif property_type in (IssueCustomPropertyType.DROPDOWN, IssueCustomPropertyType.MEMBER):
        value_obj.value_text = None
        value_obj.value_number = None
        value_obj.value_boolean = None
        value_obj.value_datetime = None

    value_obj.save()

    if property_type == IssueCustomPropertyType.DROPDOWN:
        option_ids = payload.get("value_option_ids") or []
        options = IssueCustomPropertyOption.objects.filter(property=prop, id__in=option_ids)
        value_obj.value_options.set(options)
        value_obj.value_members.clear()
    elif property_type == IssueCustomPropertyType.MEMBER:
        member_ids = payload.get("value_member_ids") or []
        value_obj.value_members.set(member_ids)
        value_obj.value_options.clear()
    else:
        value_obj.value_options.clear()
        value_obj.value_members.clear()

    return value_obj


def evaluate_formula(expression, property_values_by_name):
    """
    Evaluate a simple formula referencing properties by {Name}.
    Supports +, -, *, /, and string concat via &.
    """
    if not expression or not isinstance(expression, str):
        raise ValueError("Formula expression is required")

    refs = re.findall(r"\{([^}]+)\}", expression)
    resolved = expression
    for ref in refs:
        if ref not in property_values_by_name:
            raise ValueError(f"Formula references non-existent property: {ref}")
        val = property_values_by_name[ref]
        if val is None:
            val = 0
        if isinstance(val, str):
            resolved = resolved.replace(f"{{{ref}}}", f'"{val}"')
        else:
            resolved = resolved.replace(f"{{{ref}}}", str(val))

    if not re.fullmatch(r'[\d\s\.\+\-\*/\(\)"&]+', resolved.replace("&", "+")):
        raise ValueError("Invalid formula")

    eval_expr = resolved.replace("&", "+")
    try:
        result = eval(eval_expr, {"__builtins__": {}}, {})  # noqa: S307 — restricted expr
    except Exception as exc:
        raise ValueError(f"Invalid formula: {exc}") from exc
    return result


def recompute_formulas(issue, project, issue_type_id):
    formula_props = IssueCustomProperty.objects.filter(
        issue_type_id=issue_type_id,
        property_type=IssueCustomPropertyType.FORMULA,
        is_active=True,
    )
    if not formula_props.exists():
        return

    all_props = IssueCustomProperty.objects.filter(issue_type_id=issue_type_id, is_active=True)
    values = {
        str(v.property_id): v
        for v in IssueCustomPropertyValue.objects.filter(issue=issue, property__issue_type_id=issue_type_id)
        .prefetch_related("value_options")
        .select_related("property")
    }
    by_name = {}
    for prop in all_props:
        v = values.get(str(prop.id))
        if not v:
            by_name[prop.name] = None
            continue
        if prop.property_type == IssueCustomPropertyType.NUMBER:
            by_name[prop.name] = v.value_number
        elif prop.property_type == IssueCustomPropertyType.TEXT:
            by_name[prop.name] = v.value_text or ""
        elif prop.property_type == IssueCustomPropertyType.BOOLEAN:
            by_name[prop.name] = 1 if v.value_boolean else 0
        elif prop.property_type == IssueCustomPropertyType.FORMULA:
            by_name[prop.name] = v.value_number if v.value_number is not None else v.value_text
        else:
            by_name[prop.name] = v.value_text

    for fprop in formula_props:
        expression = (fprop.settings or {}).get("formula") or (
            fprop.default_value if isinstance(fprop.default_value, str) else None
        )
        if not expression:
            continue
        try:
            result = evaluate_formula(expression, by_name)
        except ValueError:
            continue
        value_obj, _ = IssueCustomPropertyValue.objects.get_or_create(
            issue=issue,
            property=fprop,
            defaults={"workspace": project.workspace, "project": project},
        )
        if isinstance(result, (int, float)) and not isinstance(result, bool):
            value_obj.value_number = float(result)
            value_obj.value_text = str(result)
        else:
            value_obj.value_text = str(result)
            value_obj.value_number = None
        value_obj.save()
        by_name[fprop.name] = result


def upsert_property_values(issue, project, payloads, *, issue_type_id=None, skip_inactive=True):
    """
    Upsert a list of property value write payloads onto an issue.

    Returns (results, errors) where results are value model instances and
    errors is a dict keyed by property_id string.
    """
    results = []
    errors = {}
    type_id = issue_type_id or issue.type_id

    for payload in payloads:
        property_id = payload.get("property_id")
        if not property_id:
            errors["unknown"] = "property_id is required"
            continue

        prop_qs = IssueCustomProperty.objects.filter(pk=property_id, workspace_id=project.workspace_id)
        if skip_inactive:
            prop_qs = prop_qs.filter(is_active=True)
        prop = prop_qs.first()
        if not prop:
            errors[str(property_id)] = "Property not found"
            continue

        if type_id and prop.issue_type_id != type_id:
            errors[str(prop.id)] = "Property does not belong to this work item type"
            continue

        if prop.is_required and is_empty_value(prop, payload):
            errors[str(prop.id)] = "This property is required"
            continue

        value_obj, _ = IssueCustomPropertyValue.objects.get_or_create(
            issue=issue,
            property=prop,
            defaults={
                "workspace": project.workspace,
                "project": project,
            },
        )
        apply_value_payload(value_obj, prop, payload)

        if type_id:
            recompute_formulas(issue, project, type_id)

        value_obj.refresh_from_db()
        results.append(value_obj)

    return results, errors
