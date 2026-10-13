# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from datetime import timedelta
from uuid import uuid4

import pytest
from django.utils import timezone

from plane.db.models import (
    Issue,
    Project,
    ProjectMember,
    State,
    TimeEntry,
    Workspace,
    WorkspaceMember,
)
from plane.db.models.time_entry import compute_duration_minutes


@pytest.mark.unit
class TestTimeEntryHelpers:
    def test_compute_duration_minutes_rounds(self):
        start = timezone.now()
        end = start + timedelta(minutes=5, seconds=20)
        assert compute_duration_minutes(start, end) == 5

    def test_compute_duration_minutes_minimum_one(self):
        start = timezone.now()
        end = start + timedelta(seconds=10)
        assert compute_duration_minutes(start, end) == 1

    def test_compute_duration_minutes_missing(self):
        assert compute_duration_minutes(None, timezone.now()) == 0
        assert compute_duration_minutes(timezone.now(), None) == 0


@pytest.mark.unit
@pytest.mark.django_db
class TestTimeEntryModel:
    @pytest.fixture
    def project_issue(self, create_user):
        workspace = Workspace.objects.create(
            name="TT Workspace", slug=f"tt-{uuid4().hex[:8]}", owner=create_user
        )
        WorkspaceMember.objects.create(workspace=workspace, member=create_user, role=20)
        project = Project.objects.create(
            name="TT Project",
            identifier="TT",
            workspace=workspace,
            created_by=create_user,
            is_time_tracking_enabled=True,
        )
        ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
        state = State.objects.create(
            name="Todo", project=project, workspace=workspace, group="backlog", default=True
        )
        issue = Issue.objects.create(
            name="Timed issue",
            project=project,
            workspace=workspace,
            state=state,
            created_by=create_user,
        )
        return workspace, project, issue, create_user

    def test_stop_running_timer(self, project_issue):
        workspace, project, issue, user = project_issue
        entry = TimeEntry.objects.create(
            workspace=workspace,
            project=project,
            issue=issue,
            logged_by=user,
            started_at=timezone.now() - timedelta(minutes=30),
            stopped_at=None,
            duration=0,
        )
        stopped = TimeEntry.stop_running_for_user(user.id)
        assert stopped is not None
        assert stopped.id == entry.id
        assert stopped.stopped_at is not None
        assert stopped.duration >= 1

    def test_only_one_running_timer_per_user(self, project_issue):
        workspace, project, issue, user = project_issue
        TimeEntry.objects.create(
            workspace=workspace,
            project=project,
            issue=issue,
            logged_by=user,
            started_at=timezone.now(),
            stopped_at=None,
            duration=0,
        )
        # Starting another should go through stop_running first in the API;
        # the DB constraint rejects a second running entry.
        with pytest.raises(Exception):
            TimeEntry.objects.create(
                workspace=workspace,
                project=project,
                issue=issue,
                logged_by=user,
                started_at=timezone.now(),
                stopped_at=None,
                duration=0,
            )
