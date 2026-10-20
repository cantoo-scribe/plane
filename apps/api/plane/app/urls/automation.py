# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    WorkspaceAutomationEndpoint,
    WorkspaceAutomationRunEndpoint,
)


urlpatterns = [
    path(
        "workspaces/<str:slug>/automations/",
        WorkspaceAutomationEndpoint.as_view(),
        name="workspace-automations",
    ),
    path(
        "workspaces/<str:slug>/automations/<uuid:pk>/",
        WorkspaceAutomationEndpoint.as_view(),
        name="workspace-automations",
    ),
    path(
        "workspaces/<str:slug>/automations/<uuid:automation_id>/runs/",
        WorkspaceAutomationRunEndpoint.as_view(),
        name="workspace-automation-runs",
    ),
]
