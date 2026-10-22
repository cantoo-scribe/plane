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
from plane.app.serializers import IssueCustomPropertySerializer
from plane.app.views.base import BaseViewSet
from plane.db.models import (
    IssueCustomProperty,
    IssueCustomPropertyOption,
    IssueCustomPropertyType,
    IssueType,
    Workspace,
)


class WorkspaceIssueCustomPropertyViewSet(BaseViewSet):
    """CRUD for custom properties on workspace-level work item types."""

    serializer_class = IssueCustomPropertySerializer
    model = IssueCustomProperty

    def get_queryset(self):
        return (
            IssueCustomProperty.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .filter(issue_type_id=self.kwargs.get("type_id"))
            .prefetch_related("options")
            .distinct()
        )

    def _get_issue_type(self, slug, type_id):
        return IssueType.objects.filter(workspace__slug=slug, pk=type_id).first()

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug, type_id):
        if not self._get_issue_type(slug, type_id):
            return Response({"error": "Work item type not found"}, status=status.HTTP_404_NOT_FOUND)
        queryset = self.get_queryset()
        if request.GET.get("show_inactive", "false") != "true":
            queryset = queryset.filter(is_active=True)
        return Response(IssueCustomPropertySerializer(queryset, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def retrieve(self, request, slug, type_id, pk):
        prop = self.get_queryset().filter(pk=pk).first()
        if not prop:
            return Response({"error": "Property not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(IssueCustomPropertySerializer(prop).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def create(self, request, slug, type_id):
        issue_type = self._get_issue_type(slug, type_id)
        if not issue_type:
            return Response({"error": "Work item type not found"}, status=status.HTTP_404_NOT_FOUND)

        workspace = Workspace.objects.get(slug=slug)
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

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def partial_update(self, request, slug, type_id, pk):
        prop = self.get_queryset().filter(pk=pk).first()
        if not prop:
            return Response({"error": "Property not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = IssueCustomPropertySerializer(prop, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
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

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def destroy(self, request, slug, type_id, pk):
        prop = self.get_queryset().filter(pk=pk).first()
        if not prop:
            return Response({"error": "Property not found"}, status=status.HTTP_404_NOT_FOUND)
        prop.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
