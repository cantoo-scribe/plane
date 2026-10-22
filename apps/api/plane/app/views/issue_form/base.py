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
from plane.app.serializers import IssueFormFieldSerializer, IssueFormSerializer
from plane.app.views.base import BaseViewSet
from plane.db.models import (
    IssueCustomProperty,
    IssueForm,
    IssueFormCoreKey,
    IssueFormField,
    IssueFormFieldTargetKind,
    IssueType,
    Project,
    ProjectIssueType,
    State,
    Workspace,
    PUBLIC_FORM_CUSTOM_PROPERTY_TYPES,
)


def _project_can_access_type(slug, project_id, type_id) -> bool:
    """Match issue type list rules: workspace catalog vs project join table."""
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


class IssueFormViewSet(BaseViewSet):
    serializer_class = IssueFormSerializer
    model = IssueForm

    def get_queryset(self):
        return (
            IssueForm.objects.filter(
                workspace__slug=self.kwargs.get("slug"),
                project_id=self.kwargs.get("project_id"),
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
            )
            .select_related("issue_type", "target_state", "project")
            .prefetch_related("fields__custom_property__options")
            .distinct()
        )

    def _ensure_type_in_project(self, slug, project_id, type_id):
        return _project_can_access_type(slug, project_id, type_id)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id):
        # Builder needs inactive forms visible so they can be re-enabled.
        # Pass ?active_only=true to filter to published forms only.
        queryset = self.get_queryset()
        if request.GET.get("active_only", "false") == "true":
            queryset = queryset.filter(is_active=True)
        serializer = IssueFormSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def retrieve(self, request, slug, project_id, pk):
        form = self.get_queryset().filter(pk=pk).first()
        if not form:
            return Response({"error": "Form not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(IssueFormSerializer(form).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def create(self, request, slug, project_id):
        workspace = Workspace.objects.get(slug=slug)
        project = Project.objects.get(pk=project_id, workspace=workspace)
        issue_type_id = request.data.get("issue_type_id")
        if not issue_type_id:
            return Response({"issue_type_id": "Required"}, status=status.HTTP_400_BAD_REQUEST)
        if not self._ensure_type_in_project(slug, project_id, issue_type_id):
            return Response({"error": "Work item type not found"}, status=status.HTTP_404_NOT_FOUND)

        target_state_id = request.data.get("target_state_id")
        if target_state_id and not State.objects.filter(project_id=project_id, pk=target_state_id).exists():
            return Response({"target_state_id": "Invalid state"}, status=status.HTTP_400_BAD_REQUEST)

        serializer = IssueFormSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                form = IssueForm.objects.create(
                    workspace=workspace,
                    project=project,
                    issue_type_id=issue_type_id,
                    name=serializer.validated_data["name"],
                    description=serializer.validated_data.get("description", ""),
                    logo_props=serializer.validated_data.get("logo_props", {}),
                    is_active=serializer.validated_data.get("is_active", True),
                    target_state_id=target_state_id,
                )
                # Seed a required name field by default
                IssueFormField.objects.create(
                    workspace=workspace,
                    project=project,
                    form=form,
                    label="Title",
                    target_kind=IssueFormFieldTargetKind.CORE,
                    core_key=IssueFormCoreKey.NAME,
                    is_required=True,
                    sort_order=10000,
                )
            form = self.get_queryset().get(pk=form.id)
            return Response(IssueFormSerializer(form).data, status=status.HTTP_201_CREATED)
        except IntegrityError:
            return Response(
                {"name": "A form with this name already exists in this project"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @allow_permission([ROLE.ADMIN])
    def partial_update(self, request, slug, project_id, pk):
        form = self.get_queryset().filter(pk=pk).first()
        if not form:
            return Response({"error": "Form not found"}, status=status.HTTP_404_NOT_FOUND)

        if "issue_type_id" in request.data and str(request.data["issue_type_id"]) != str(form.issue_type_id):
            if not self._ensure_type_in_project(slug, project_id, request.data["issue_type_id"]):
                return Response({"error": "Work item type not found"}, status=status.HTTP_404_NOT_FOUND)

        if "target_state_id" in request.data and request.data["target_state_id"]:
            if not State.objects.filter(project_id=project_id, pk=request.data["target_state_id"]).exists():
                return Response({"target_state_id": "Invalid state"}, status=status.HTTP_400_BAD_REQUEST)

        serializer = IssueFormSerializer(form, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            serializer.save()
            form = self.get_queryset().get(pk=pk)
            return Response(IssueFormSerializer(form).data, status=status.HTTP_200_OK)
        except IntegrityError:
            return Response(
                {"name": "A form with this name already exists in this project"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @allow_permission([ROLE.ADMIN])
    def destroy(self, request, slug, project_id, pk):
        form = self.get_queryset().filter(pk=pk).first()
        if not form:
            return Response({"error": "Form not found"}, status=status.HTTP_404_NOT_FOUND)
        form.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN])
    def renew_anchor(self, request, slug, project_id, pk):
        form = self.get_queryset().filter(pk=pk).first()
        if not form:
            return Response({"error": "Form not found"}, status=status.HTTP_404_NOT_FOUND)
        form.renew_anchor()
        form = self.get_queryset().get(pk=pk)
        return Response(IssueFormSerializer(form).data, status=status.HTTP_200_OK)


class WorkspaceIssueFormViewSet(BaseViewSet):
    serializer_class = IssueFormSerializer
    model = IssueForm

    def get_queryset(self):
        return (
            IssueForm.objects.filter(
                workspace__slug=self.kwargs.get("slug"),
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
            )
            .select_related("issue_type", "target_state", "project")
            .prefetch_related("fields__custom_property__options")
            .order_by("-created_at")
            .distinct()
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug):
        queryset = self.get_queryset()
        project_id = request.GET.get("project_id")
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        if request.GET.get("active_only", "false") == "true":
            queryset = queryset.filter(is_active=True)
        serializer = IssueFormSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class IssueFormFieldViewSet(BaseViewSet):
    serializer_class = IssueFormFieldSerializer
    model = IssueFormField

    def get_queryset(self):
        return (
            IssueFormField.objects.filter(
                workspace__slug=self.kwargs.get("slug"),
                project_id=self.kwargs.get("project_id"),
                form_id=self.kwargs.get("form_id"),
                form__project__project_projectmember__member=self.request.user,
                form__project__project_projectmember__is_active=True,
            )
            .select_related("custom_property")
            .prefetch_related("custom_property__options")
            .distinct()
        )

    def _get_form(self, slug, project_id, form_id):
        return IssueForm.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            pk=form_id,
        ).first()

    def _validate_custom_property(self, form, property_id):
        prop = IssueCustomProperty.objects.filter(
            pk=property_id,
            issue_type_id=form.issue_type_id,
            is_active=True,
        ).first()
        if not prop:
            return None, Response({"custom_property_id": "Property not found for this form type"}, status=status.HTTP_400_BAD_REQUEST)
        if prop.property_type not in PUBLIC_FORM_CUSTOM_PROPERTY_TYPES:
            return None, Response(
                {"custom_property_id": f"Property type {prop.property_type} is not supported on forms"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return prop, None

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id, form_id):
        if not self._get_form(slug, project_id, form_id):
            return Response({"error": "Form not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = IssueFormFieldSerializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def create(self, request, slug, project_id, form_id):
        form = self._get_form(slug, project_id, form_id)
        if not form:
            return Response({"error": "Form not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = IssueFormFieldSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        custom_property_id = data.get("custom_property_id") or request.data.get("custom_property_id")
        if data.get("target_kind") == IssueFormFieldTargetKind.CUSTOM:
            _, err = self._validate_custom_property(form, custom_property_id)
            if err:
                return err

        field = IssueFormField.objects.create(
            workspace=form.workspace,
            project=form.project,
            form=form,
            label=data["label"],
            help_text=data.get("help_text", ""),
            is_required=data.get("is_required", False),
            is_visible=data.get("is_visible", True),
            sort_order=data.get("sort_order", 65535),
            target_kind=data["target_kind"],
            core_key=data.get("core_key"),
            custom_property_id=custom_property_id if data["target_kind"] == IssueFormFieldTargetKind.CUSTOM else None,
        )
        field = self.get_queryset().get(pk=field.id)
        return Response(IssueFormFieldSerializer(field).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN])
    def partial_update(self, request, slug, project_id, form_id, pk):
        form = self._get_form(slug, project_id, form_id)
        if not form:
            return Response({"error": "Form not found"}, status=status.HTTP_404_NOT_FOUND)
        field = self.get_queryset().filter(pk=pk).first()
        if not field:
            return Response({"error": "Field not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = IssueFormFieldSerializer(field, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        target_kind = data.get("target_kind", field.target_kind)
        custom_property_id = data.get("custom_property_id", field.custom_property_id)
        if target_kind == IssueFormFieldTargetKind.CUSTOM and custom_property_id:
            _, err = self._validate_custom_property(form, custom_property_id)
            if err:
                return err

        serializer.save()
        field = self.get_queryset().get(pk=pk)
        return Response(IssueFormFieldSerializer(field).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def destroy(self, request, slug, project_id, form_id, pk):
        field = self.get_queryset().filter(pk=pk).first()
        if not field:
            return Response({"error": "Field not found"}, status=status.HTTP_404_NOT_FOUND)
        field.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
