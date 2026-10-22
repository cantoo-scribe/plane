# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import IntegrityError, transaction

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
from plane.utils.issue_custom_property_values import (
    apply_value_payload as _apply_value_payload,
    evaluate_formula,  # noqa: F401 — re-export for backwards compatibility
    upsert_property_values,
)


def _project_can_access_type(slug, project_id, type_id) -> bool:
    project = Project.objects.filter(pk=project_id, workspace__slug=slug).first()
    if not project:
        return False
    if project.issue_type_source == Project.ISSUE_TYPE_SOURCE_WORKSPACE:
        return IssueType.objects.filter(workspace_id=project.workspace_id, pk=type_id).exists()
    return ProjectIssueType.objects.filter(
        workspace__slug=slug,
        project_id=project_id,
        issue_type_id=type_id,
    ).exists()


class IssueCustomPropertyViewSet(BaseViewSet):
    serializer_class = IssueCustomPropertySerializer
    model = IssueCustomProperty

    def get_queryset(self):
        slug = self.kwargs.get("slug")
        project_id = self.kwargs.get("project_id")
        type_id = self.kwargs.get("type_id")
        base = (
            IssueCustomProperty.objects.filter(workspace__slug=slug)
            .filter(issue_type_id=type_id)
            .prefetch_related("options")
        )
        project = Project.objects.filter(pk=project_id, workspace__slug=slug).first()
        if project and project.issue_type_source == Project.ISSUE_TYPE_SOURCE_WORKSPACE:
            return base.filter(issue_type__workspace_id=project.workspace_id).distinct()
        return base.filter(
            issue_type__project_issue_types__project_id=project_id,
            issue_type__project_issue_types__project__project_projectmember__member=self.request.user,
            issue_type__project_issue_types__project__project_projectmember__is_active=True,
        ).distinct()

    def _ensure_type_in_project(self, slug, project_id, type_id):
        return _project_can_access_type(slug, project_id, type_id)

    def _reject_workspace_mode_mutation(self, slug, project_id):
        project = Project.objects.filter(pk=project_id, workspace__slug=slug).first()
        if project and project.issue_type_source == Project.ISSUE_TYPE_SOURCE_WORKSPACE:
            return Response(
                {
                    "error": "This project uses the workspace work item type configuration. "
                    "Edit properties in workspace settings, or switch the project to a custom configuration."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return None

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
        blocked = self._reject_workspace_mode_mutation(slug, project_id)
        if blocked:
            return blocked
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
        blocked = self._reject_workspace_mode_mutation(slug, project_id)
        if blocked:
            return blocked
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
        blocked = self._reject_workspace_mode_mutation(slug, project_id)
        if blocked:
            return blocked
        prop = self.get_queryset().filter(pk=pk).first()
        if not prop:
            return Response({"error": "Property not found"}, status=status.HTTP_404_NOT_FOUND)
        prop.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class IssueCustomPropertyOptionViewSet(BaseViewSet):
    serializer_class = IssueCustomPropertyOptionSerializer
    model = IssueCustomPropertyOption

    def get_queryset(self):
        slug = self.kwargs.get("slug")
        project_id = self.kwargs.get("project_id")
        property_id = self.kwargs.get("property_id")
        base = IssueCustomPropertyOption.objects.filter(workspace__slug=slug).filter(property_id=property_id)
        project = Project.objects.filter(pk=project_id, workspace__slug=slug).first()
        if project and project.issue_type_source == Project.ISSUE_TYPE_SOURCE_WORKSPACE:
            return base.filter(property__issue_type__workspace_id=project.workspace_id).distinct()
        return base.filter(
            property__issue_type__project_issue_types__project_id=project_id,
            property__issue_type__project_issue_types__project__project_projectmember__member=self.request.user,
            property__issue_type__project_issue_types__project__project_projectmember__is_active=True,
        ).distinct()

    def _get_property(self, slug, project_id, type_id, property_id):
        if not _project_can_access_type(slug, project_id, type_id):
            return None
        return (
            IssueCustomProperty.objects.filter(
                workspace__slug=slug,
                issue_type_id=type_id,
                pk=property_id,
            )
            .distinct()
            .first()
        )

    def _reject_workspace_mode_mutation(self, slug, project_id):
        project = Project.objects.filter(pk=project_id, workspace__slug=slug).first()
        if project and project.issue_type_source == Project.ISSUE_TYPE_SOURCE_WORKSPACE:
            return Response(
                {
                    "error": "This project uses the workspace work item type configuration. "
                    "Edit properties in workspace settings, or switch the project to a custom configuration."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return None

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id, type_id, property_id):
        if not self._get_property(slug, project_id, type_id, property_id):
            return Response({"error": "Property not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = IssueCustomPropertyOptionSerializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def create(self, request, slug, project_id, type_id, property_id):
        blocked = self._reject_workspace_mode_mutation(slug, project_id)
        if blocked:
            return blocked
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
        blocked = self._reject_workspace_mode_mutation(slug, project_id)
        if blocked:
            return blocked
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
        blocked = self._reject_workspace_mode_mutation(slug, project_id)
        if blocked:
            return blocked
        option = self.get_queryset().filter(pk=pk).first()
        if not option:
            return Response({"error": "Option not found"}, status=status.HTTP_404_NOT_FOUND)
        option.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


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
        validated_payloads = []
        errors = {}

        for payload in payloads:
            write = IssueCustomPropertyValueWriteSerializer(data=payload)
            if not write.is_valid():
                errors[str(payload.get("property_id"))] = write.errors
                continue
            validated_payloads.append(write.validated_data)

        with transaction.atomic():
            results, upsert_errors = upsert_property_values(issue, project, validated_payloads)
            errors.update(upsert_errors)
            serialized = IssueCustomPropertyValueSerializer(results, many=True).data

        if errors and not serialized:
            return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"values": serialized, "errors": errors}, status=status.HTTP_200_OK)
