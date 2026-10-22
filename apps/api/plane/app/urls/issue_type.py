# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    IssueCustomPropertyOptionViewSet,
    IssueCustomPropertyValueEndpoint,
    IssueCustomPropertyViewSet,
    IssueTypeViewSet,
    WorkspaceIssueCustomPropertyViewSet,
    WorkspaceIssueTypeViewSet,
)


urlpatterns = [
    path(
        "workspaces/<str:slug>/issue-types/",
        WorkspaceIssueTypeViewSet.as_view({"get": "list", "post": "create"}),
        name="workspace-issue-types",
    ),
    path(
        "workspaces/<str:slug>/issue-types/<uuid:pk>/",
        WorkspaceIssueTypeViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="workspace-issue-type",
    ),
    path(
        "workspaces/<str:slug>/issue-types/<uuid:pk>/mark-default/",
        WorkspaceIssueTypeViewSet.as_view({"post": "mark_as_default"}),
        name="workspace-issue-type-mark-default",
    ),
    path(
        "workspaces/<str:slug>/issue-types/<uuid:pk>/make-global/",
        WorkspaceIssueTypeViewSet.as_view({"post": "make_global"}),
        name="workspace-issue-type-make-global",
    ),
    path(
        "workspaces/<str:slug>/issue-types/<uuid:type_id>/properties/",
        WorkspaceIssueCustomPropertyViewSet.as_view({"get": "list", "post": "create"}),
        name="workspace-issue-type-properties",
    ),
    path(
        "workspaces/<str:slug>/issue-types/<uuid:type_id>/properties/<uuid:pk>/",
        WorkspaceIssueCustomPropertyViewSet.as_view(
            {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
        ),
        name="workspace-issue-type-property",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-types/",
        IssueTypeViewSet.as_view({"get": "list", "post": "create"}),
        name="project-issue-types",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-types/<uuid:pk>/",
        IssueTypeViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="project-issue-type",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-types/<uuid:pk>/mark-default/",
        IssueTypeViewSet.as_view({"post": "mark_as_default"}),
        name="project-issue-type-mark-default",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-types/<uuid:type_id>/properties/",
        IssueCustomPropertyViewSet.as_view({"get": "list", "post": "create"}),
        name="project-issue-type-properties",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-types/<uuid:type_id>/properties/<uuid:pk>/",
        IssueCustomPropertyViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="project-issue-type-property",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-types/<uuid:type_id>/properties/<uuid:property_id>/options/",
        IssueCustomPropertyOptionViewSet.as_view({"get": "list", "post": "create"}),
        name="project-issue-type-property-options",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-types/<uuid:type_id>/properties/<uuid:property_id>/options/<uuid:pk>/",
        IssueCustomPropertyOptionViewSet.as_view({"patch": "partial_update", "delete": "destroy"}),
        name="project-issue-type-property-option",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/custom-properties/",
        IssueCustomPropertyValueEndpoint.as_view(),
        name="issue-custom-property-values",
    ),
]
