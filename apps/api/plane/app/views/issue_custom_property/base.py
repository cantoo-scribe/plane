# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import IntegrityError, transaction
from django.utils.dateparse import parse_datetime

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import (
    IssueCustomPropertyOptionSerializer,
    IssueCustomPropertySerializer,
    IssueCustomPropertyValueSerializer,
    IssueCustomPropertyValueWriteSerializer,
)
from plane.app.views.base import BaseAPIView, BaseViewSet
from plane.db.models import (
    Issue,
    IssueCustomProperty,
    IssueCustomPropertyOption,
    IssueCustomPropertyType,
    IssueCustomPropertyValue,
    IssueType,
    Project,
    ProjectIssueType,
    Workspace,
)


class IssueCustomPropertyViewSet(BaseViewSet):
    serializer_class = IssueCustomPropertySerializer
    model = IssueCustomProperty

    def get_queryset(self):
        return (
            IssueCustomProperty.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .filter(issue_type_id=self.kwargs.get("type_id"))
            .filter(
                issue_type__project_issue_types__project_id=self.kwargs.get("project_id"),
                issue_type__project_issue_types__project__project_projectmember__member=self.request.user,
                issue_type__project_issue_types__project__project_projectmember__is_active=True,
            )
            .prefetch_related("options")
            .distinct()
        )

    def _ensure_type_in_project(self, slug, project_id, type_id):
        return ProjectIssueType.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            issue_type_id=type_id,
        ).exists()

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id, type_id):
        if not self._ensure_type_in_project(slug, project_id, type_id):
            return Response({"error": "Work item type not found"}, status=status.HTTP_404_NOT_FOUND)
        queryset = self.get_queryset()
        if request.GET.get("show_inactive", "false") != "true":
            queryset = queryset.filter(is_active=True)
        serializer = IssueCustomPropertySerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def retrieve(self, request, slug, project_id, type_id, pk):
        prop = self.get_queryset().filter(pk=pk).first()
        if not prop:
            return Response({"error": "Property not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(IssueCustomPropertySerializer(prop).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def create(self, request, slug, project_id, type_id):
        if not self._ensure_type_in_project(slug, project_id, type_id):
            return Response({"error": "Work item type not found"}, status=status.HTTP_404_NOT_FOUND)

        workspace = Workspace.objects.get(slug=slug)
        issue_type = IssueType.objects.get(pk=type_id, workspace=workspace)

        property_type = request.data.get("property_type", IssueCustomPropertyType.TEXT)
        if property_type == IssueCustomPropertyType.DROPDOWN and not request.data.get("options"):
            # Options can be added later; allow empty on create
            pass

        serializer = IssueCustomPropertySerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                prop = IssueCustomProperty.objects.create(
                    workspace=workspace,
                    issue_type=issue_type,
                    name=serializer.validated_data["name"],
                    description=serializer.validated_data.get("description", ""),
                    property_type=serializer.validated_data.get("property_type", IssueCustomPropertyType.TEXT),
                    is_required=serializer.validated_data.get("is_required", False),
                    is_active=serializer.validated_data.get("is_active", True),
                    settings=serializer.validated_data.get("settings", {}),
                    default_value=serializer.validated_data.get("default_value"),
                    sort_order=serializer.validated_data.get("sort_order", 65535),
                    logo_props=serializer.validated_data.get("logo_props", {}),
                )
                options_data = request.data.get("options") or []
                for index, option in enumerate(options_data):
                    IssueCustomPropertyOption.objects.create(
                        workspace=workspace,
                        property=prop,
                        name=option.get("name", "").strip(),
                        description=option.get("description", ""),
                        sort_order=option.get("sort_order", index * 10000),
                        is_active=option.get("is_active", True),
                        logo_props=option.get("logo_props", {}),
                        is_default=option.get("is_default", False),
                    )
            prop = self.get_queryset().get(pk=prop.id)
            return Response(IssueCustomPropertySerializer(prop).data, status=status.HTTP_201_CREATED)
        except IntegrityError:
            return Response(
                {"name": "A property with this name already exists for this type"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @allow_permission([ROLE.ADMIN])
    def partial_update(self, request, slug, project_id, type_id, pk):
        prop = self.get_queryset().filter(pk=pk).first()
        if not prop:
            return Response({"error": "Property not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = IssueCustomPropertySerializer(prop, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            # Disallow changing property_type after creation to avoid orphaned values
            if "property_type" in request.data and request.data["property_type"] != prop.property_type:
                return Response(
                    {"property_type": "Property type cannot be changed after creation"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            serializer.save()
            prop = self.get_queryset().get(pk=pk)
            return Response(IssueCustomPropertySerializer(prop).data, status=status.HTTP_200_OK)
        except IntegrityError:
            return Response(
                {"name": "A property with this name already exists for this type"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @allow_permission([ROLE.ADMIN])
    def destroy(self, request, slug, project_id, type_id, pk):
        prop = self.get_queryset().filter(pk=pk).first()
        if not prop:
            return Response({"error": "Property not found"}, status=status.HTTP_404_NOT_FOUND)
        prop.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class IssueCustomPropertyOptionViewSet(BaseViewSet):
    serializer_class = IssueCustomPropertyOptionSerializer
    model = IssueCustomPropertyOption

    def get_queryset(self):
        return (
            IssueCustomPropertyOption.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .filter(property_id=self.kwargs.get("property_id"))
            .filter(
                property__issue_type__project_issue_types__project_id=self.kwargs.get("project_id"),
                property__issue_type__project_issue_types__project__project_projectmember__member=self.request.user,
                property__issue_type__project_issue_types__project__project_projectmember__is_active=True,
            )
            .distinct()
        )

    def _get_property(self, slug, project_id, type_id, property_id):
        return (
            IssueCustomProperty.objects.filter(
                workspace__slug=slug,
                issue_type_id=type_id,
                pk=property_id,
                issue_type__project_issue_types__project_id=project_id,
            )
            .distinct()
            .first()
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id, type_id, property_id):
        if not self._get_property(slug, project_id, type_id, property_id):
            return Response({"error": "Property not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = IssueCustomPropertyOptionSerializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def create(self, request, slug, project_id, type_id, property_id):
        prop = self._get_property(slug, project_id, type_id, property_id)
        if not prop:
            return Response({"error": "Property not found"}, status=status.HTTP_404_NOT_FOUND)
        if prop.property_type != IssueCustomPropertyType.DROPDOWN:
            return Response(
                {"error": "Options can only be added to dropdown properties"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        name = (request.data.get("name") or "").strip()
        if not name:
            return Response({"name": "Option name is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            option = IssueCustomPropertyOption.objects.create(
                workspace=prop.workspace,
                property=prop,
                name=name,
                description=request.data.get("description", ""),
                sort_order=request.data.get("sort_order", 65535),
                is_active=request.data.get("is_active", True),
                logo_props=request.data.get("logo_props", {}),
                is_default=request.data.get("is_default", False),
            )
            return Response(
                IssueCustomPropertyOptionSerializer(option).data,
                status=status.HTTP_201_CREATED,
            )
        except IntegrityError:
            return Response(
                {"name": "Option with same name already exists."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @allow_permission([ROLE.ADMIN])
    def partial_update(self, request, slug, project_id, type_id, property_id, pk):
        option = self.get_queryset().filter(pk=pk).first()
        if not option:
            return Response({"error": "Option not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = IssueCustomPropertyOptionSerializer(option, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        try:
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        except IntegrityError:
            return Response(
                {"name": "Option with same name already exists."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @allow_permission([ROLE.ADMIN])
    def destroy(self, request, slug, project_id, type_id, property_id, pk):
        option = self.get_queryset().filter(pk=pk).first()
        if not option:
            return Response({"error": "Option not found"}, status=status.HTTP_404_NOT_FOUND)
        option.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def _apply_value_payload(value_obj, prop, payload):
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
        # Formula values are computed server-side; store as text/number preview
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

    import re

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

    # Replace & concat with Python + for strings — keep numeric ops
    # Only allow safe characters after substitution
    if not re.fullmatch(r'[\d\s\.\+\-\*/\(\)"&]+', resolved.replace("&", "+")):
        raise ValueError("Invalid formula")

    # Convert & to + for evaluation (string concat / numeric add)
    eval_expr = resolved.replace("&", "+")
    try:
        result = eval(eval_expr, {"__builtins__": {}}, {})  # noqa: S307 — restricted expr
    except Exception as exc:
        raise ValueError(f"Invalid formula: {exc}") from exc
    return result


class IssueCustomPropertyValueEndpoint(BaseAPIView):
    """List and bulk upsert custom property values for an issue."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id):
        issue = Issue.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            pk=issue_id,
        ).first()
        if not issue:
            return Response({"error": "Work item not found"}, status=status.HTTP_404_NOT_FOUND)

        values = (
            IssueCustomPropertyValue.objects.filter(issue=issue)
            .select_related("property")
            .prefetch_related("value_options", "value_members")
        )
        serializer = IssueCustomPropertyValueSerializer(values, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id):
        issue = Issue.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            pk=issue_id,
        ).first()
        if not issue:
            return Response({"error": "Work item not found"}, status=status.HTTP_404_NOT_FOUND)

        project = Project.objects.get(pk=project_id)
        payloads = request.data if isinstance(request.data, list) else [request.data]
        results = []
        errors = {}

        with transaction.atomic():
            for payload in payloads:
                write = IssueCustomPropertyValueWriteSerializer(data=payload)
                if not write.is_valid():
                    errors[str(payload.get("property_id"))] = write.errors
                    continue

                prop = IssueCustomProperty.objects.filter(
                    pk=write.validated_data["property_id"],
                    workspace__slug=slug,
                    is_active=True,
                ).first()
                if not prop:
                    errors[str(write.validated_data["property_id"])] = "Property not found"
                    continue

                if issue.type_id and prop.issue_type_id != issue.type_id:
                    errors[str(prop.id)] = "Property does not belong to this work item type"
                    continue

                if prop.is_required:
                    empty = self._is_empty_value(prop, write.validated_data)
                    if empty:
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
                _apply_value_payload(value_obj, prop, write.validated_data)

                # Recompute formula properties on the same type
                self._recompute_formulas(issue, project, prop.issue_type_id)

                value_obj.refresh_from_db()
                results.append(IssueCustomPropertyValueSerializer(value_obj).data)

        if errors and not results:
            return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"values": results, "errors": errors}, status=status.HTTP_200_OK)

    def _is_empty_value(self, prop, data):
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

    def _recompute_formulas(self, issue, project, issue_type_id):
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
            expression = (fprop.settings or {}).get("formula") or (fprop.default_value if isinstance(fprop.default_value, str) else None)
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
