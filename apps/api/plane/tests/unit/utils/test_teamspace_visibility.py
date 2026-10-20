# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from uuid import uuid4

from plane.db.models import Issue, IssueAssignee, Project, ProjectMember, State, User
from plane.utils.teamspace_visibility import (
    issues_visible_in_project,
    validate_issue_cross_links,
    validate_linked_okr,
    validate_linked_project,
    validate_linked_teamspace,
)


@pytest.mark.unit
class TestTeamspaceVisibility:
    @pytest.mark.django_db
    def test_regular_project_sees_home_and_linked_issues(self, workspace, create_user):
        client = Project.objects.create(
            name="Client",
            identifier="CLIENT",
            workspace=workspace,
        )
        pole = Project.objects.create(
            name="Dev Pole",
            identifier="DEVPOLE",
            workspace=workspace,
            is_teamspace=True,
        )
        State.objects.create(name="Backlog", group="backlog", project=client, workspace=workspace, default=True)
        State.objects.create(name="Backlog", group="backlog", project=pole, workspace=workspace, default=True)

        home_in_client = Issue.objects.create(name="Client home", project=client, workspace=workspace)
        linked_from_pole = Issue.objects.create(
            name="Pole linked to client",
            project=pole,
            workspace=workspace,
            linked_project=client,
        )
        other = Issue.objects.create(name="Pole only", project=pole, workspace=workspace)

        visible = set(issues_visible_in_project(workspace.slug, client).values_list("id", flat=True))
        assert home_in_client.id in visible
        assert linked_from_pole.id in visible
        assert other.id not in visible

    @pytest.mark.django_db
    def test_teamspace_sees_linked_teamspace_and_assignee(self, workspace, create_user):
        suffix = uuid4().hex[:8]
        member = User.objects.create(
            email=f"member-{suffix}@example.com",
            username=f"member-{suffix}",
        )
        client = Project.objects.create(name="Client", identifier="CLI2", workspace=workspace)
        pole = Project.objects.create(
            name="Design",
            identifier="DES",
            workspace=workspace,
            is_teamspace=True,
        )
        ProjectMember.objects.create(project=pole, workspace=workspace, member=member, role=15)
        State.objects.create(name="Backlog", group="backlog", project=client, workspace=workspace, default=True)
        State.objects.create(name="Backlog", group="backlog", project=pole, workspace=workspace, default=True)

        assigned = Issue.objects.create(name="Assigned to pole member", project=client, workspace=workspace)
        IssueAssignee.objects.create(
            issue=assigned,
            assignee=member,
            project=client,
            workspace=workspace,
        )
        unassigned = Issue.objects.create(name="Unassigned client", project=client, workspace=workspace)
        pole_home = Issue.objects.create(name="Pole home", project=pole, workspace=workspace)
        from_client_linked = Issue.objects.create(
            name="Client linked to pole",
            project=client,
            workspace=workspace,
            linked_teamspace=pole,
        )

        visible = set(issues_visible_in_project(workspace.slug, pole).values_list("id", flat=True))
        assert assigned.id in visible
        assert pole_home.id in visible
        assert from_client_linked.id in visible
        assert unassigned.id not in visible

    @pytest.mark.django_db
    def test_okr_sees_home_and_linked_okr_issues(self, workspace, create_user):
        okr = Project.objects.create(
            name="OKR 2026",
            identifier="OKR26T",
            workspace=workspace,
            is_okr=True,
        )
        pole = Project.objects.create(
            name="Dev",
            identifier="DEVOKR",
            workspace=workspace,
            is_teamspace=True,
        )
        client = Project.objects.create(name="Client", identifier="CLIOKR", workspace=workspace)
        State.objects.create(name="Backlog", group="backlog", project=okr, workspace=workspace, default=True)
        State.objects.create(name="Backlog", group="backlog", project=pole, workspace=workspace, default=True)
        State.objects.create(name="Backlog", group="backlog", project=client, workspace=workspace, default=True)

        okr_home = Issue.objects.create(
            name="OKR objective",
            project=okr,
            workspace=workspace,
            linked_teamspace=pole,
            linked_project=client,
        )
        from_pole = Issue.objects.create(
            name="Pole work for OKR",
            project=pole,
            workspace=workspace,
            linked_okr=okr,
        )
        unrelated = Issue.objects.create(name="Other pole", project=pole, workspace=workspace)

        visible = set(issues_visible_in_project(workspace.slug, okr).values_list("id", flat=True))
        assert okr_home.id in visible
        assert from_pole.id in visible
        assert unrelated.id not in visible

        # Also appears in linked pole and client
        assert okr_home.id in set(issues_visible_in_project(workspace.slug, pole).values_list("id", flat=True))
        assert okr_home.id in set(issues_visible_in_project(workspace.slug, client).values_list("id", flat=True))

    @pytest.mark.django_db
    def test_validate_cross_link_rules(self, workspace, create_user):
        client = Project.objects.create(name="Client", identifier="CLI3", workspace=workspace)
        pole = Project.objects.create(
            name="Pole",
            identifier="POL",
            workspace=workspace,
            is_teamspace=True,
        )
        okr = Project.objects.create(
            name="OKR",
            identifier="OKR",
            workspace=workspace,
            is_okr=True,
        )
        other_pole = Project.objects.create(
            name="Other Pole",
            identifier="POL2",
            workspace=workspace,
            is_teamspace=True,
        )

        validate_linked_project(pole, client)
        validate_linked_teamspace(client, pole)
        validate_linked_okr(client, okr)
        validate_issue_cross_links(okr, linked_project=client, linked_teamspace=pole)
        validate_linked_project(pole, None)

        with pytest.raises(ValueError):
            validate_linked_project(pole, pole)
        with pytest.raises(ValueError):
            validate_linked_project(client, pole)
        with pytest.raises(ValueError):
            validate_linked_teamspace(pole, other_pole)
        with pytest.raises(ValueError):
            validate_linked_okr(okr, okr)
