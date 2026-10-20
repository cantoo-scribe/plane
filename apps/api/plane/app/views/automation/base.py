# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.db.models import Workspace, WorkspaceAutomation, WorkspaceAutomationRun
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import (
    WorkspaceAutomationRunSerializer,
    WorkspaceAutomationSerializer,
)
from ..base import BaseAPIView


class WorkspaceAutomationEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        serializer = WorkspaceAutomationSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(workspace_id=workspace.id)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug, pk=None):
        if pk is None:
            automations = (
                WorkspaceAutomation.objects.filter(workspace__slug=slug)
                .prefetch_related("conditions", "actions")
                .order_by("-created_at")
            )
            serializer = WorkspaceAutomationSerializer(automations, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)

        automation = WorkspaceAutomation.objects.prefetch_related("conditions", "actions").get(
            workspace__slug=slug, pk=pk
        )
        serializer = WorkspaceAutomationSerializer(automation)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def patch(self, request, slug, pk):
        automation = WorkspaceAutomation.objects.prefetch_related("conditions", "actions").get(
            workspace__slug=slug, pk=pk
        )
        serializer = WorkspaceAutomationSerializer(automation, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug, pk):
        automation = WorkspaceAutomation.objects.get(workspace__slug=slug, pk=pk)
        automation.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkspaceAutomationRunEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug, automation_id):
        runs = WorkspaceAutomationRun.objects.filter(
            workspace__slug=slug,
            automation_id=automation_id,
        ).order_by("-created_at")[:100]
        serializer = WorkspaceAutomationRunSerializer(runs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
