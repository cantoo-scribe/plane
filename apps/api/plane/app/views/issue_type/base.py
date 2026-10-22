# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import IntegrityError, transaction
from django.db.models import Count, Prefetch, Q

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import IssueTypeSerializer
from plane.app.views.base import BaseViewSet
from plane.db.models import Issue, IssueType, Project, ProjectIssueType, Workspace


def _project_uses_workspace_types(project: Project) -> bool:
    return project.issue_type_source == Project.ISSUE_TYPE_SOURCE_WORKSPACE


def _workspace_global_types_queryset(slug):
    """Types with no project binding — the shared workspace catalog."""
    return (
        IssueType.objects.filter(workspace__slug=slug)
        .annotate(
            project_link_count=Count(
                "project_issue_types",
                filter=Q(project_issue_types__deleted_at__isnull=True),
            )
        )
        .filter(project_link_count=0)
    )


class IssueTypeViewSet(BaseViewSet):
    serializer_class = IssueTypeSerializer
    model = IssueType

    def _get_project(self, slug, project_id):
        return Project.objects.filter(pk=project_id, workspace__slug=slug).first()

    def get_queryset(self):
        project_id = self.kwargs.get("project_id")
        project = self._get_project(self.kwargs.get("slug"), project_id)
        slug = self.kwargs.get("slug")

        if project and _project_uses_workspace_types(project):
            return _workspace_global_types_queryset(slug).prefetch_related(
                Prefetch(
                    "project_issue_types",
                    queryset=ProjectIssueType.objects.filter(project_id=project_id),
                )
            ).distinct()

        return (
            IssueType.objects.filter(workspace__slug=slug)
            .filter(project_issue_types__project_id=project_id)
            .filter(
                project_issue_types__project__project_projectmember__member=self.request.user,
                project_issue_types__project__project_projectmember__is_active=True,
            )
            .prefetch_related(
                Prefetch(
                    "project_issue_types",
                    queryset=ProjectIssueType.objects.filter(project_id=project_id),
                )
            )
            .distinct()
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["project_id"] = self.kwargs.get("project_id")
        return context

    def _reject_if_workspace_mode(self, project):
        if project and _project_uses_workspace_types(project):
            return Response(
                {
                    "error": "This project uses the workspace work item type configuration. "
                    "Edit types in workspace settings, or switch the project to a custom configuration."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return None

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id):
        queryset = self.get_queryset()
        show_inactive = request.GET.get("show_inactive", "false") == "true"
        if not show_inactive:
            queryset = queryset.filter(is_active=True)
        serializer = IssueTypeSerializer(queryset, many=True, context=self.get_serializer_context())
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def retrieve(self, request, slug, project_id, pk):
        issue_type = self.get_queryset().filter(pk=pk).first()
        if not issue_type:
            return Response({"error": "Work item type not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = IssueTypeSerializer(issue_type, context=self.get_serializer_context())
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def create(self, request, slug, project_id):
        try:
            workspace = Workspace.objects.get(slug=slug)
            project = Project.objects.get(pk=project_id, workspace=workspace)
            blocked = self._reject_if_workspace_mode(project)
            if blocked:
                return blocked

            with transaction.atomic():
                name = (request.data.get("name") or "").strip()
                if not name:
                    return Response({"name": "Name is required"}, status=status.HTTP_400_BAD_REQUEST)

                is_first_type = not ProjectIssueType.objects.filter(project_id=project_id).exists()
                issue_type = IssueType.objects.create(
                    workspace=workspace,
                    name=name,
                    description=request.data.get("description", ""),
                    logo_props=request.data.get("logo_props", {}),
                    is_active=request.data.get("is_active", True),
                    is_default=is_first_type,
                )
                ProjectIssueType.objects.create(
                    workspace=workspace,
                    project=project,
                    issue_type=issue_type,
                    is_default=is_first_type,
                    level=request.data.get("level", 0),
                )
                update_fields = []
                if not project.is_issue_type_enabled:
                    project.is_issue_type_enabled = True
                    update_fields.append("is_issue_type_enabled")
                if project.issue_type_source != Project.ISSUE_TYPE_SOURCE_CUSTOM:
                    project.issue_type_source = Project.ISSUE_TYPE_SOURCE_CUSTOM
                    update_fields.append("issue_type_source")
                if update_fields:
                    update_fields.append("updated_at")
                    project.save(update_fields=update_fields)

            issue_type = self.get_queryset().get(pk=issue_type.id)
            serializer = IssueTypeSerializer(issue_type, context=self.get_serializer_context())
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except IntegrityError:
            return Response(
                {"name": "A work item type with this name already exists"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @allow_permission([ROLE.ADMIN])
    def partial_update(self, request, slug, project_id, pk):
        try:
            project = self._get_project(slug, project_id)
            blocked = self._reject_if_workspace_mode(project)
            if blocked:
                return blocked

            issue_type = self.get_queryset().get(pk=pk)
            updatable = ["name", "description", "logo_props", "is_active"]
            for field in updatable:
                if field in request.data:
                    setattr(issue_type, field, request.data[field])
            if "name" in request.data and not (request.data.get("name") or "").strip():
                return Response({"name": "Name is required"}, status=status.HTTP_400_BAD_REQUEST)
            if "name" in request.data:
                issue_type.name = request.data["name"].strip()
            issue_type.save()

            if "level" in request.data:
                ProjectIssueType.objects.filter(project_id=project_id, issue_type_id=pk).update(
                    level=request.data["level"]
                )

            issue_type = self.get_queryset().get(pk=pk)
            serializer = IssueTypeSerializer(issue_type, context=self.get_serializer_context())
            return Response(serializer.data, status=status.HTTP_200_OK)
        except IssueType.DoesNotExist:
            return Response({"error": "Work item type not found"}, status=status.HTTP_404_NOT_FOUND)
        except IntegrityError:
            return Response(
                {"name": "A work item type with this name already exists"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @allow_permission([ROLE.ADMIN])
    def mark_as_default(self, request, slug, project_id, pk):
        project = self._get_project(slug, project_id)
        blocked = self._reject_if_workspace_mode(project)
        if blocked:
            return blocked

        issue_type = self.get_queryset().filter(pk=pk).first()
        if not issue_type:
            return Response({"error": "Work item type not found"}, status=status.HTTP_404_NOT_FOUND)
        if not issue_type.is_active:
            return Response(
                {"error": "Activate this type before setting it as default"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            ProjectIssueType.objects.filter(project_id=project_id, is_default=True).update(is_default=False)
            ProjectIssueType.objects.filter(project_id=project_id, issue_type_id=pk).update(is_default=True)
            IssueType.objects.filter(
                project_issue_types__project_id=project_id,
                is_default=True,
            ).update(is_default=False)
            issue_type.is_default = True
            issue_type.save(update_fields=["is_default", "updated_at"])

        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN])
    def destroy(self, request, slug, project_id, pk):
        project = self._get_project(slug, project_id)
        blocked = self._reject_if_workspace_mode(project)
        if blocked:
            return blocked

        pit = ProjectIssueType.objects.filter(
            project_id=project_id,
            issue_type_id=pk,
            workspace__slug=slug,
        ).select_related("issue_type").first()
        if not pit:
            return Response({"error": "Work item type not found"}, status=status.HTTP_404_NOT_FOUND)

        if pit.is_default:
            return Response(
                {"error": "Cannot delete default work item type"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if Issue.objects.filter(project_id=project_id, type_id=pk).exists():
            return Response(
                {"error": "Cannot delete work item type with associated work items"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        issue_type = pit.issue_type
        pit.delete()
        if not ProjectIssueType.objects.filter(issue_type_id=pk).exists():
            issue_type.delete()

        return Response(status=status.HTTP_204_NO_CONTENT)
