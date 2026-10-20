# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.space.views import IssueFormPublicEndpoint


urlpatterns = [
    path(
        "forms/<str:anchor>/",
        IssueFormPublicEndpoint.as_view(),
        name="public-issue-form",
    ),
    path(
        "forms/<str:anchor>/submit/",
        IssueFormPublicEndpoint.as_view(),
        name="public-issue-form-submit",
    ),
]
