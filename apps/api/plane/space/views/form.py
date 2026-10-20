# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import json

# Django imports
from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction
from django.utils import timezone

# Third party imports
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

# Module imports
from plane.app.serializers.issue_form import IssueFormSubmitSerializer
from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import (
    Issue,
    IssueForm,
    IssueFormCoreKey,
    IssueFormFieldTargetKind,
    IssueLabel,
    Label,
    State,
    PUBLIC_FORM_CUSTOM_PROPERTY_TYPES,
)
from plane.space.views.base import BaseAPIView
from plane.utils.issue_custom_property_values import is_empty_value, upsert_property_values
from plane.utils.content_validator import validate_html_content


class IssueFormPublicEndpoint(BaseAPIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def _get_active_form(self, anchor):
        return (
            IssueForm.objects.filter(anchor=anchor, is_active=True)
            .select_related("project", "issue_type", "target_state", "workspace")
            .prefetch_related("fields__custom_property__options")
            .first()
        )

    def _public_fields(self, form):
        fields = []
        for field in form.fields.filter(is_visible=True).order_by("sort_order", "created_at"):
            prop = field.custom_property
            if field.target_kind == IssueFormFieldTargetKind.CUSTOM:
                if not prop or not prop.is_active:
                    continue
                if prop.property_type not in PUBLIC_FORM_CUSTOM_PROPERTY_TYPES:
                    continue
            entry = {
                "id": field.id,
                "sort_order": field.sort_order,
                "label": field.label,
                "help_text": field.help_text,
                "is_required": field.is_required or (prop.is_required if prop else False),
                "target_kind": field.target_kind,
                "core_key": field.core_key,
                "custom_property_id": field.custom_property_id,
                "property_type": prop.property_type if prop else None,
                "settings": prop.settings if prop else None,
                "options": [],
            }
            if prop and prop.property_type == "DROPDOWN":
                entry["options"] = [
                    {
                        "id": opt.id,
                        "workspace_id": opt.workspace_id,
                        "property_id": opt.property_id,
                        "name": opt.name,
                        "description": opt.description,
                        "sort_order": opt.sort_order,
                        "is_active": opt.is_active,
                        "logo_props": opt.logo_props,
                        "is_default": opt.is_default,
                    }
                    for opt in prop.options.filter(is_active=True).order_by("sort_order")
                ]
            fields.append(entry)
        return fields

    def get(self, request, anchor):
        form = self._get_active_form(anchor)
        if not form:
            return Response({"error": "Form not found"}, status=status.HTTP_404_NOT_FOUND)

        return Response(
            {
                "id": form.id,
                "name": form.name,
                "description": form.description,
                "logo_props": form.logo_props,
                "issue_type_id": form.issue_type_id,
                "fields": self._public_fields(form),
            },
            status=status.HTTP_200_OK,
        )

    def post(self, request, anchor):
        form = self._get_active_form(anchor)
        if not form:
            return Response({"error": "Form not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = IssueFormSubmitSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        answers = serializer.validated_data["answers"]
        visible_fields = list(form.fields.filter(is_visible=True).select_related("custom_property"))
        field_by_id = {str(f.id): f for f in visible_fields}

        core_values = {}
        custom_payloads = []
        errors = {}

        for field in visible_fields:
            field_id = str(field.id)
            raw = answers.get(field_id)
            required = field.is_required or (
                field.custom_property.is_required if field.custom_property_id else False
            )

            if field.target_kind == IssueFormFieldTargetKind.CORE:
                if required and (raw is None or raw == "" or raw == []):
                    errors[field_id] = "This field is required"
                    continue
                if raw is None or raw == "":
                    continue
                if field.core_key == IssueFormCoreKey.NAME:
                    core_values["name"] = str(raw).strip()
                elif field.core_key == IssueFormCoreKey.DESCRIPTION_HTML:
                    _, _, sanitized = validate_html_content(str(raw) if raw else "<p></p>")
                    core_values["description_html"] = sanitized if sanitized is not None else "<p></p>"
                elif field.core_key == IssueFormCoreKey.PRIORITY:
                    if str(raw) not in ("none", "low", "medium", "high", "urgent"):
                        errors[field_id] = "Invalid priority"
                    else:
                        core_values["priority"] = str(raw)
                elif field.core_key == IssueFormCoreKey.LABEL_IDS:
                    if not isinstance(raw, list):
                        errors[field_id] = "Labels must be a list of ids"
                    else:
                        core_values["label_ids"] = raw
            else:
                prop = field.custom_property
                if not prop or prop.property_type not in PUBLIC_FORM_CUSTOM_PROPERTY_TYPES:
                    continue
                payload = {"property_id": prop.id}
                if isinstance(raw, dict):
                    payload.update(raw)
                else:
                    # Accept shorthand scalars
                    if prop.property_type == "TEXT":
                        payload["value_text"] = raw
                    elif prop.property_type == "NUMBER":
                        payload["value_number"] = raw
                    elif prop.property_type == "BOOLEAN":
                        payload["value_boolean"] = raw
                    elif prop.property_type == "DATE":
                        payload["value_datetime"] = raw
                    elif prop.property_type == "DROPDOWN":
                        payload["value_option_ids"] = raw if isinstance(raw, list) else ([raw] if raw else [])

                if required and is_empty_value(prop, payload):
                    errors[field_id] = "This field is required"
                    continue
                if not is_empty_value(prop, payload):
                    custom_payloads.append(payload)

        # Unknown field ids in answers are ignored
        _ = field_by_id

        if "name" not in core_values or not core_values["name"]:
            # Prefer an explicit name field error; otherwise require a title
            name_field = next(
                (f for f in visible_fields if f.core_key == IssueFormCoreKey.NAME),
                None,
            )
            key = str(name_field.id) if name_field else "name"
            errors[key] = errors.get(key) or "Title is required"

        if errors:
            return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)

        project = form.project
        target_state = form.target_state
        if not target_state:
            target_state = State.objects.filter(project=project, default=True).first()
        if not target_state:
            target_state = State.objects.filter(project=project).exclude(group="triage").first()
        if not target_state:
            return Response({"error": "Project has no usable state"}, status=status.HTTP_400_BAD_REQUEST)

        label_ids = core_values.pop("label_ids", [])
        if label_ids:
            valid_label_ids = {
                str(lid)
                for lid in Label.objects.filter(project=project, id__in=label_ids).values_list("id", flat=True)
            }
            label_ids = [lid for lid in label_ids if str(lid) in valid_label_ids]

        try:
            with transaction.atomic():
                issue = Issue.objects.create(
                    name=core_values["name"],
                    description_html=core_values.get("description_html", "<p></p>"),
                    priority=core_values.get("priority", "none"),
                    project=project,
                    workspace=form.workspace,
                    state=target_state,
                    type_id=form.issue_type_id,
                )
                for label_id in label_ids:
                    IssueLabel.objects.create(
                        issue=issue,
                        label_id=label_id,
                        project=project,
                        workspace=form.workspace,
                    )

                _results, value_errors = upsert_property_values(
                    issue,
                    project,
                    custom_payloads,
                    issue_type_id=form.issue_type_id,
                )
                if value_errors:
                    # Roll back the whole transaction
                    raise ValueError(value_errors)
        except ValueError as exc:
            return Response({"errors": exc.args[0]}, status=status.HTTP_400_BAD_REQUEST)

        # Activity — actor may be anonymous
        actor_id = str(request.user.id) if request.user and request.user.is_authenticated else None
        if actor_id:
            issue_activity.delay(
                type="issue.activity.created",
                requested_data=json.dumps(request.data, cls=DjangoJSONEncoder),
                actor_id=actor_id,
                issue_id=str(issue.id),
                project_id=str(project.id),
                current_instance=None,
                epoch=int(timezone.now().timestamp()),
            )

        return Response(
            {
                "id": issue.id,
                "sequence_id": issue.sequence_id,
                "name": issue.name,
                "project_identifier": project.identifier,
            },
            status=status.HTTP_201_CREATED,
        )
