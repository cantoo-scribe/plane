# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    IssueTimeEntryEndpoint,
    TimeEntryDetailEndpoint,
    TimeEntryStopEndpoint,
    RunningTimeEntryEndpoint,
    WorkspaceTimeEntryReportEndpoint,
    IssueTimeEntrySummaryEndpoint,
)


urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/time-entries/",
        IssueTimeEntryEndpoint.as_view({"get": "list", "post": "create"}),
        name="issue-time-entries",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/time-entries/summary/",
        IssueTimeEntrySummaryEndpoint.as_view(),
        name="issue-time-entry-summary",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/time-entries/<uuid:pk>/",
        TimeEntryDetailEndpoint.as_view(),
        name="time-entry-detail",
    ),
    path(
        "workspaces/<str:slug>/time-entries/stop/",
        TimeEntryStopEndpoint.as_view(),
        name="time-entry-stop",
    ),
    path(
        "workspaces/<str:slug>/time-entries/running/",
        RunningTimeEntryEndpoint.as_view(),
        name="time-entry-running",
    ),
    path(
        "workspaces/<str:slug>/time-entries/report/",
        WorkspaceTimeEntryReportEndpoint.as_view(),
        name="time-entry-report",
    ),
]
