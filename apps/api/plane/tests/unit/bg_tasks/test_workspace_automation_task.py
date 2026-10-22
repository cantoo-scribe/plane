# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json
from unittest.mock import patch

import pytest

from plane.bgtasks.workspace_automation_task import (
    detect_trigger_types,
    evaluate_conditions,
    evaluate_workspace_automations,
    matches_trigger_config,
)
from plane.db.models import (
    Issue,
    IssueLabel,
    Label,
    State,
    WorkspaceAutomation,
    WorkspaceAutomationAction,
    WorkspaceAutomationCondition,
    WorkspaceAutomationRun,
)
from plane.db.models.automation import (
    WorkspaceAutomationActionType,
    WorkspaceAutomationConditionField,
    WorkspaceAutomationConditionOperator,
    WorkspaceAutomationRunStatus,
    WorkspaceAutomationTriggerType,
)
from plane.tests.factories import ProjectFactory, UserFactory, WorkspaceFactory, WorkspaceMemberFactory


def _make_issue(workspace, project, user, state=None, priority="none"):
    if state is None:
        state = State.objects.create(
            name="Todo",
            group="unstarted",
            project=project,
            workspace=workspace,
            sequence=1,
            color="#000000",
        )
    return Issue.objects.create(
        name="Test issue",
        project=project,
        workspace=workspace,
        state=state,
        priority=priority,
        created_by=user,
        updated_by=user,
    )


@pytest.mark.unit
class TestDetectTriggerTypes:
    def test_issue_created(self):
        assert detect_trigger_types("issue.activity.created", {}, {}) == [
            WorkspaceAutomationTriggerType.ISSUE_CREATED
        ]

    def test_state_changed(self):
        triggers = detect_trigger_types(
            "issue.activity.updated",
            {"state_id": "b"},
            {"state_id": "a"},
        )
        assert WorkspaceAutomationTriggerType.STATE_CHANGED in triggers

    def test_assignee_changed(self):
        triggers = detect_trigger_types(
            "issue.activity.updated",
            {"assignee_ids": ["u1"]},
            {"assignee_ids": []},
        )
        assert WorkspaceAutomationTriggerType.ASSIGNEE_CHANGED in triggers

    def test_name_changed(self):
        triggers = detect_trigger_types(
            "issue.activity.updated",
            {"name": "x"},
            {"name": "y"},
        )
        assert WorkspaceAutomationTriggerType.NAME_CHANGED in triggers

    def test_priority_changed(self):
        triggers = detect_trigger_types(
            "issue.activity.updated",
            {"priority": "high"},
            {"priority": "low"},
        )
        assert WorkspaceAutomationTriggerType.PRIORITY_CHANGED in triggers

    def test_comment_added(self):
        triggers = detect_trigger_types("comment.activity.created", {}, {})
        assert WorkspaceAutomationTriggerType.COMMENT_ADDED in triggers

    def test_no_change_returns_empty(self):
        assert (
            detect_trigger_types(
                "issue.activity.updated",
                {"description_html": "<p>x</p>"},
                {"description_html": "<p>y</p>"},
            )
            == []
        )


@pytest.mark.unit
class TestMatchesTriggerConfig:
    def test_state_to_filter(self):
        assert matches_trigger_config(
            WorkspaceAutomationTriggerType.STATE_CHANGED,
            {"to_state_id": "b"},
            {"state_id": "b"},
            {"state_id": "a"},
        )
        assert not matches_trigger_config(
            WorkspaceAutomationTriggerType.STATE_CHANGED,
            {"to_state_id": "c"},
            {"state_id": "b"},
            {"state_id": "a"},
        )


@pytest.mark.unit
@pytest.mark.django_db
class TestEvaluateConditions:
    def test_priority_condition(self):
        user = UserFactory()
        workspace = WorkspaceFactory(owner=user)
        project = ProjectFactory(workspace=workspace, created_by=user)
        issue = _make_issue(workspace, project, user, priority="urgent")

        automation = WorkspaceAutomation.objects.create(
            workspace=workspace,
            name="Priority gate",
            trigger_type=WorkspaceAutomationTriggerType.ISSUE_CREATED,
        )
        WorkspaceAutomationCondition.objects.create(
            automation=automation,
            field=WorkspaceAutomationConditionField.PRIORITY,
            operator=WorkspaceAutomationConditionOperator.IS,
            value="urgent",
        )

        assert evaluate_conditions(automation, issue) is True

        issue.priority = "low"
        issue.save(update_fields=["priority"])
        assert evaluate_conditions(automation, issue) is False

    def test_label_is_any_of(self):
        user = UserFactory()
        workspace = WorkspaceFactory(owner=user)
        project = ProjectFactory(workspace=workspace, created_by=user)
        issue = _make_issue(workspace, project, user)
        label = Label.objects.create(name="bug", project=project, workspace=workspace, color="#ff0000")
        IssueLabel.objects.create(issue=issue, label=label, project=project, workspace=workspace)

        automation = WorkspaceAutomation.objects.create(
            workspace=workspace,
            name="Label gate",
            trigger_type=WorkspaceAutomationTriggerType.ISSUE_CREATED,
        )
        WorkspaceAutomationCondition.objects.create(
            automation=automation,
            field=WorkspaceAutomationConditionField.LABEL,
            operator=WorkspaceAutomationConditionOperator.IS_ANY_OF,
            value=[str(label.id)],
        )

        assert evaluate_conditions(automation, issue) is True


@pytest.mark.unit
@pytest.mark.django_db
class TestEvaluateWorkspaceAutomations:
    @patch("plane.bgtasks.workspace_automation_task.issue_activity.delay")
    def test_runs_change_state_action(self, mock_activity):
        user = UserFactory()
        workspace = WorkspaceFactory(owner=user)
        WorkspaceMemberFactory(workspace=workspace, member=user, role=20)
        project = ProjectFactory(workspace=workspace, created_by=user)
        todo = State.objects.create(
            name="Todo",
            group="unstarted",
            project=project,
            workspace=workspace,
            sequence=1,
            color="#000000",
        )
        done = State.objects.create(
            name="Done",
            group="completed",
            project=project,
            workspace=workspace,
            sequence=2,
            color="#00ff00",
        )
        issue = _make_issue(workspace, project, user, state=todo, priority="urgent")

        automation = WorkspaceAutomation.objects.create(
            workspace=workspace,
            name="Move urgent",
            trigger_type=WorkspaceAutomationTriggerType.ISSUE_CREATED,
            is_active=True,
        )
        WorkspaceAutomationCondition.objects.create(
            automation=automation,
            field=WorkspaceAutomationConditionField.PRIORITY,
            operator=WorkspaceAutomationConditionOperator.IS,
            value="urgent",
        )
        WorkspaceAutomationAction.objects.create(
            automation=automation,
            action_type=WorkspaceAutomationActionType.CHANGE_STATE,
            config={"state_id": str(done.id)},
            sequence=0,
        )

        evaluate_workspace_automations(
            activity_type="issue.activity.created",
            requested_data=json.dumps({"name": "Test issue"}),
            current_instance=None,
            issue_id=str(issue.id),
            actor_id=str(user.id),
            project_id=str(project.id),
            workspace_id=str(workspace.id),
        )

        issue.refresh_from_db()
        assert str(issue.state_id) == str(done.id)
        run = WorkspaceAutomationRun.objects.get(automation=automation)
        assert run.status == WorkspaceAutomationRunStatus.SUCCESS
        mock_activity.assert_called()
        # automation flag must be present to prevent re-entry
        kwargs = mock_activity.call_args.kwargs
        payload = json.loads(kwargs["requested_data"])
        assert payload.get("automation") is True

    @patch("plane.bgtasks.workspace_automation_task.issue_activity.delay")
    def test_skips_when_automation_flag_set(self, mock_activity):
        user = UserFactory()
        workspace = WorkspaceFactory(owner=user)
        project = ProjectFactory(workspace=workspace, created_by=user)
        issue = _make_issue(workspace, project, user)

        automation = WorkspaceAutomation.objects.create(
            workspace=workspace,
            name="Should not run",
            trigger_type=WorkspaceAutomationTriggerType.STATE_CHANGED,
            is_active=True,
        )
        WorkspaceAutomationAction.objects.create(
            automation=automation,
            action_type=WorkspaceAutomationActionType.ADD_COMMENT,
            config={"comment_html": "<p>hi</p>"},
            sequence=0,
        )

        evaluate_workspace_automations(
            activity_type="issue.activity.updated",
            requested_data=json.dumps({"state_id": str(issue.state_id), "automation": True}),
            current_instance=json.dumps({"state_id": None}),
            issue_id=str(issue.id),
            actor_id=str(user.id),
            project_id=str(project.id),
            workspace_id=str(workspace.id),
        )

        assert WorkspaceAutomationRun.objects.count() == 0
        mock_activity.assert_not_called()

    @patch("plane.bgtasks.workspace_automation_task.issue_activity.delay")
    def test_project_filter_excludes_other_projects(self, mock_activity):
        user = UserFactory()
        workspace = WorkspaceFactory(owner=user)
        project_a = ProjectFactory(workspace=workspace, created_by=user, name="A")
        project_b = ProjectFactory(workspace=workspace, created_by=user, name="B")
        issue = _make_issue(workspace, project_a, user)

        automation = WorkspaceAutomation.objects.create(
            workspace=workspace,
            name="Only B",
            trigger_type=WorkspaceAutomationTriggerType.ISSUE_CREATED,
            project_ids=[str(project_b.id)],
            is_active=True,
        )
        WorkspaceAutomationAction.objects.create(
            automation=automation,
            action_type=WorkspaceAutomationActionType.ADD_COMMENT,
            config={"comment_html": "<p>hi</p>"},
            sequence=0,
        )

        evaluate_workspace_automations(
            activity_type="issue.activity.created",
            requested_data=json.dumps({"name": "Test"}),
            current_instance=None,
            issue_id=str(issue.id),
            actor_id=str(user.id),
            project_id=str(project_a.id),
            workspace_id=str(workspace.id),
        )

        assert WorkspaceAutomationRun.objects.count() == 0
        mock_activity.assert_not_called()
