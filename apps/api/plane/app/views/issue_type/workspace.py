# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import IntegrityError, transaction
from django.db.models import Prefetch

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import IssueTypeSerializer
from plane.app.views.base import BaseViewSet
from plane.db.models import Issue, IssueType, ProjectIssueType, Workspace


class WorkspaceIssueTypeViewSet(BaseViewSet):
    """CRUD for the workspace-level work item type catalog."""

    serializer_class = IssueTypeSerializer
    model = IssueType

    def get_queryset(self):
        return (
            IssueType.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .prefetch_related(
                Prefetch("project_issue_types", queryset=ProjectIssueType.objects.all())
            )
            .distinct()
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug):
        queryset = self.get_queryset()
        if request.GET.get("show_inactive", "false") != "true":
            queryset = queryset.filter(is_active=True)
        serializer = IssueTypeSerializer(queryset, many=True, context=self.get_serializer_context())
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        issue_type = self.get_queryset().filter(pk=pk).first()
        if not issue_type:
            return Response({"error": "Work item type not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = IssueTypeSerializer(issue_type, context=self.get_serializer_context())
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def create(self, request, slug):
        try:
            workspace = Workspace.objects.get(slug=slug)
            name = (request.data.get("name") or "").strip()
            if not name:
                return Response({"name": "Name is required"}, status=status.HTTP_400_BAD_REQUEST)

            is_first = not IssueType.objects.filter(workspace=workspace).exists()
            issue_type = IssueType.objects.create(
                workspace=workspace,
                name=name,
                description=request.data.get("description", ""),
                logo_props=request.data.get("logo_props", {}),
                is_active=request.data.get("is_active", True),
                is_default=is_first or bool(request.data.get("is_default", False)),
                level=request.data.get("level", 0),
            )
            if issue_type.is_default and not is_first:
                IssueType.objects.filter(workspace=workspace, is_default=True).exclude(pk=issue_type.pk).update(
                    is_default=False
                )

            issue_type = self.get_queryset().get(pk=issue_type.id)
            serializer = IssueTypeSerializer(issue_type, context=self.get_serializer_context())
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except IntegrityError:
            return Response(
                {"name": "A work item type with this name already exists"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        try:
            issue_type = self.get_queryset().filter(pk=pk).first()
            if not issue_type:
                return Response({"error": "Work item type not found"}, status=status.HTTP_404_NOT_FOUND)

            updatable = ["name", "description", "logo_props", "is_active", "level"]
            for field in updatable:
                if field in request.data:
                    setattr(issue_type, field, request.data[field])
            if "name" in request.data:
                name = (request.data.get("name") or "").strip()
                if not name:
                    return Response({"name": "Name is required"}, status=status.HTTP_400_BAD_REQUEST)
                issue_type.name = name
            issue_type.save()

            issue_type = self.get_queryset().get(pk=pk)
            serializer = IssueTypeSerializer(issue_type, context=self.get_serializer_context())
            return Response(serializer.data, status=status.HTTP_200_OK)
        except IntegrityError:
            return Response(
                {"name": "A work item type with this name already exists"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def mark_as_default(self, request, slug, pk):
        issue_type = self.get_queryset().filter(pk=pk).first()
        if not issue_type:
            return Response({"error": "Work item type not found"}, status=status.HTTP_404_NOT_FOUND)
        if not issue_type.is_active:
            return Response(
                {"error": "Activate this type before setting it as default"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if ProjectIssueType.objects.filter(issue_type_id=pk).exists():
            return Response(
                {
                    "error": "Only workspace-wide types can be the workspace default. "
                    "Make this type global first."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            IssueType.objects.filter(workspace_id=issue_type.workspace_id, is_default=True).update(is_default=False)
            issue_type.is_default = True
            issue_type.save(update_fields=["is_default", "updated_at"])

        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def make_global(self, request, slug, pk):
        """Detach a project-specific type so it becomes part of the workspace catalog."""
        issue_type = self.get_queryset().filter(pk=pk).first()
        if not issue_type:
            return Response({"error": "Work item type not found"}, status=status.HTTP_404_NOT_FOUND)

        links = ProjectIssueType.objects.filter(issue_type_id=pk)
        if not links.exists():
            serializer = IssueTypeSerializer(issue_type, context=self.get_serializer_context())
            return Response(serializer.data, status=status.HTTP_200_OK)

        links.delete()
        issue_type = self.get_queryset().get(pk=pk)
        serializer = IssueTypeSerializer(issue_type, context=self.get_serializer_context())
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def destroy(self, request, slug, pk):
        issue_type = self.get_queryset().filter(pk=pk).first()
        if not issue_type:
            return Response({"error": "Work item type not found"}, status=status.HTTP_404_NOT_FOUND)

        if issue_type.is_default:
            return Response(
                {"error": "Cannot delete default work item type"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if Issue.objects.filter(type_id=pk).exists():
            return Response(
                {"error": "Cannot delete work item type with associated work items"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ProjectIssueType.objects.filter(issue_type_id=pk).delete()
        issue_type.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
