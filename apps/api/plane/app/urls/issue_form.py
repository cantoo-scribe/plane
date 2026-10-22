# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import IssueFormFieldViewSet, IssueFormViewSet, WorkspaceIssueFormViewSet


urlpatterns = [
    path(
        "workspaces/<str:slug>/forms/",
        WorkspaceIssueFormViewSet.as_view({"get": "list"}),
        name="workspace-issue-forms",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/forms/",
        IssueFormViewSet.as_view({"get": "list", "post": "create"}),
        name="project-issue-forms",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/forms/<uuid:pk>/",
        IssueFormViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="project-issue-form",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/forms/<uuid:pk>/renew-anchor/",
        IssueFormViewSet.as_view({"post": "renew_anchor"}),
        name="project-issue-form-renew-anchor",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/forms/<uuid:form_id>/fields/",
        IssueFormFieldViewSet.as_view({"get": "list", "post": "create"}),
        name="project-issue-form-fields",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/forms/<uuid:form_id>/fields/<uuid:pk>/",
        IssueFormFieldViewSet.as_view({"patch": "partial_update", "delete": "destroy"}),
        name="project-issue-form-field",
    ),
]
