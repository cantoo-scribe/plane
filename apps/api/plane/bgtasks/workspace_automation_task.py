# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import json
from typing import Any

# Third party imports
from celery import shared_task

# Django imports
from django.db import transaction
from django.utils import timezone

# Module imports
from plane.bgtasks.issue_activities_task import extract_ids, issue_activity
from plane.db.models import (
    Issue,
    IssueAssignee,
    IssueComment,
    State,
    WorkspaceAutomation,
    WorkspaceAutomationRun,
)
from plane.db.models.automation import (
    WorkspaceAutomationActionType,
    WorkspaceAutomationConditionField,
    WorkspaceAutomationConditionOperator,
    WorkspaceAutomationRunStatus,
    WorkspaceAutomationTriggerType,
)
from plane.utils.exception_logger import log_exception
from plane.utils.uuid import is_valid_uuid


def _parse_json(value: Any) -> dict | None:
    if value is None:
        return None
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else None
        except (TypeError, ValueError, json.JSONDecodeError):
            return None
    return None


def _normalize_values(value: Any) -> set[str]:
    if value is None:
        return set()
    if isinstance(value, list):
        return {str(item) for item in value if item is not None}
    if isinstance(value, dict):
        # Support {"value": "..."} or {"values": [...]}
        if "values" in value:
            return _normalize_values(value.get("values"))
        if "value" in value:
            return _normalize_values(value.get("value"))
        return set()
    return {str(value)}


def detect_trigger_types(
    activity_type: str,
    requested_data: dict | None,
    current_instance: dict | None,
) -> list[str]:
    """Return which MVP trigger types fired for this activity event."""
    triggers: list[str] = []
    requested_data = requested_data or {}
    current_instance = current_instance or {}

    if activity_type == "issue.activity.created":
        triggers.append(WorkspaceAutomationTriggerType.ISSUE_CREATED)

    if activity_type == "issue.activity.updated":
        current_state = current_instance.get("state_id") or current_instance.get("state")
        requested_state = requested_data.get("state_id") or requested_data.get("state")
        if "state_id" in requested_data or "state" in requested_data:
            if str(current_state or "") != str(requested_state or ""):
                triggers.append(WorkspaceAutomationTriggerType.STATE_CHANGED)

        if "assignee_ids" in requested_data or "assignees" in requested_data:
            requested_assignees = extract_ids(requested_data, "assignee_ids", "assignees")
            current_assignees = extract_ids(current_instance, "assignee_ids", "assignees")
            if requested_assignees != current_assignees:
                triggers.append(WorkspaceAutomationTriggerType.ASSIGNEE_CHANGED)

    return triggers


def matches_trigger_config(
    trigger_type: str,
    trigger_config: dict | None,
    requested_data: dict | None,
    current_instance: dict | None,
) -> bool:
    trigger_config = trigger_config or {}
    requested_data = requested_data or {}
    current_instance = current_instance or {}

    if trigger_type == WorkspaceAutomationTriggerType.STATE_CHANGED:
        to_state_id = trigger_config.get("to_state_id")
        from_state_id = trigger_config.get("from_state_id")
        current_state = str(current_instance.get("state_id") or current_instance.get("state") or "")
        requested_state = str(requested_data.get("state_id") or requested_data.get("state") or "")
        if to_state_id and requested_state != str(to_state_id):
            return False
        if from_state_id and current_state != str(from_state_id):
            return False
        return True

    if trigger_type == WorkspaceAutomationTriggerType.ASSIGNEE_CHANGED:
        assignee_id = trigger_config.get("assignee_id")
        if not assignee_id:
            return True
        requested_assignees = extract_ids(requested_data, "assignee_ids", "assignees")
        current_assignees = extract_ids(current_instance, "assignee_ids", "assignees")
        added = requested_assignees - current_assignees
        return str(assignee_id) in added

    return True


def evaluate_condition(condition, issue: Issue) -> bool:
    field = condition.field
    operator = condition.operator
    expected = _normalize_values(condition.value)

    if field == WorkspaceAutomationConditionField.STATE:
        actual = {str(issue.state_id)} if issue.state_id else set()
    elif field == WorkspaceAutomationConditionField.PRIORITY:
        actual = {str(issue.priority)} if issue.priority is not None else set()
    elif field == WorkspaceAutomationConditionField.LABEL:
        actual = {str(label_id) for label_id in issue.labels.values_list("id", flat=True)}
    else:
        return False

    if operator == WorkspaceAutomationConditionOperator.IS:
        if field == WorkspaceAutomationConditionField.LABEL:
            return bool(expected) and expected.issubset(actual)
        return bool(expected) and actual == expected
    if operator == WorkspaceAutomationConditionOperator.IS_ANY_OF:
        return bool(actual & expected)
    return False


def evaluate_conditions(automation: WorkspaceAutomation, issue: Issue) -> bool:
    conditions = list(automation.conditions.all())
    if not conditions:
        return True
    return all(evaluate_condition(condition, issue) for condition in conditions)


def _run_change_state(issue: Issue, config: dict, actor_id: str) -> None:
    state_id = config.get("state_id")
    if not state_id or not is_valid_uuid(str(state_id)):
        raise ValueError("Invalid state_id for change_state action")

    state = State.objects.filter(pk=state_id, project_id=issue.project_id).first()
    if not state:
        raise ValueError("State not found in project for change_state action")

    if str(issue.state_id) == str(state.id):
        return

    current_instance = json.dumps({"state_id": str(issue.state_id) if issue.state_id else None})
    issue.state = state
    issue.save(update_fields=["state", "updated_at"])

    issue_activity.delay(
        type="issue.activity.updated",
        requested_data=json.dumps({"state_id": str(state.id), "automation": True}),
        current_instance=current_instance,
        issue_id=str(issue.id),
        actor_id=str(actor_id),
        project_id=str(issue.project_id),
        epoch=int(timezone.now().timestamp()),
        subscriber=False,
        notification=True,
    )


def _run_assign(issue: Issue, config: dict, actor_id: str) -> None:
    assignee_ids = [str(assignee_id) for assignee_id in config.get("assignee_ids", []) if is_valid_uuid(str(assignee_id))]
    if not assignee_ids:
        raise ValueError("assignee_ids required for assign action")

    current_assignees = {str(assignee_id) for assignee_id in issue.assignees.values_list("id", flat=True)}
    to_add = [assignee_id for assignee_id in assignee_ids if assignee_id not in current_assignees]
    if not to_add:
        return

    IssueAssignee.objects.bulk_create(
        [
            IssueAssignee(
                issue=issue,
                assignee_id=assignee_id,
                project_id=issue.project_id,
                workspace_id=issue.workspace_id,
                created_by_id=actor_id,
                updated_by_id=actor_id,
            )
            for assignee_id in to_add
        ],
        batch_size=10,
        ignore_conflicts=True,
    )

    requested_assignees = list(current_assignees | set(to_add))
    issue_activity.delay(
        type="issue.activity.updated",
        requested_data=json.dumps({"assignee_ids": requested_assignees, "automation": True}),
        current_instance=json.dumps({"assignee_ids": list(current_assignees)}),
        issue_id=str(issue.id),
        actor_id=str(actor_id),
        project_id=str(issue.project_id),
        epoch=int(timezone.now().timestamp()),
        subscriber=False,
        notification=True,
    )


def _run_add_comment(issue: Issue, config: dict, actor_id: str) -> None:
    comment_html = config.get("comment_html") or ""
    if not comment_html:
        raise ValueError("comment_html required for add_comment action")

    comment = IssueComment.objects.create(
        issue=issue,
        project_id=issue.project_id,
        workspace_id=issue.workspace_id,
        actor_id=actor_id,
        comment_html=comment_html,
        comment_json=config.get("comment_json") or {},
        created_by_id=actor_id,
        updated_by_id=actor_id,
    )

    issue_activity.delay(
        type="comment.activity.created",
        requested_data=json.dumps(
            {
                "id": str(comment.id),
                "comment_html": comment_html,
                "automation": True,
            }
        ),
        current_instance=None,
        issue_id=str(issue.id),
        actor_id=str(actor_id),
        project_id=str(issue.project_id),
        epoch=int(timezone.now().timestamp()),
        subscriber=False,
        notification=True,
    )


ACTION_HANDLERS = {
    WorkspaceAutomationActionType.CHANGE_STATE: _run_change_state,
    WorkspaceAutomationActionType.ASSIGN: _run_assign,
    WorkspaceAutomationActionType.ADD_COMMENT: _run_add_comment,
}


def execute_automation(automation: WorkspaceAutomation, issue: Issue, actor_id: str) -> WorkspaceAutomationRun:
    run = WorkspaceAutomationRun(
        workspace_id=automation.workspace_id,
        automation=automation,
        issue=issue,
        actor_id=actor_id,
        status=WorkspaceAutomationRunStatus.SUCCESS,
    )

    try:
        with transaction.atomic():
            for action in automation.actions.all().order_by("sequence", "created_at"):
                handler = ACTION_HANDLERS.get(action.action_type)
                if not handler:
                    raise ValueError(f"Unknown action type: {action.action_type}")
                handler(issue, action.config or {}, actor_id)
        run.save()
    except Exception as exc:
        run.status = WorkspaceAutomationRunStatus.FAILED
        run.error = str(exc)
        run.save()
        log_exception(exc)

    return run


@shared_task
def evaluate_workspace_automations(
    activity_type: str,
    requested_data: str | None,
    current_instance: str | None,
    issue_id: str,
    actor_id: str,
    project_id: str,
    workspace_id: str,
):
    try:
        requested = _parse_json(requested_data) or {}
        current = _parse_json(current_instance) or {}

        # Anti-loop: do not re-enter for automation-driven mutations
        if requested.get("automation"):
            return

        issue = (
            Issue.issue_objects.filter(pk=issue_id, project_id=project_id)
            .prefetch_related("labels", "assignees")
            .select_related("state")
            .first()
        )
        if not issue or issue.archived_at is not None:
            return

        fired_triggers = detect_trigger_types(activity_type, requested, current)
        if not fired_triggers:
            return

        automations = (
            WorkspaceAutomation.objects.filter(
                workspace_id=workspace_id,
                is_active=True,
                trigger_type__in=fired_triggers,
            )
            .prefetch_related("conditions", "actions")
            .order_by("created_at")
        )

        project_id_str = str(project_id)
        for automation in automations:
            project_ids = [str(pid) for pid in (automation.project_ids or [])]
            if project_ids and project_id_str not in project_ids:
                continue

            if not matches_trigger_config(
                automation.trigger_type,
                automation.trigger_config,
                requested,
                current,
            ):
                continue

            # Refresh issue state before condition checks / next automation
            issue.refresh_from_db()
            if issue.archived_at is not None:
                return

            if not evaluate_conditions(automation, issue):
                WorkspaceAutomationRun.objects.create(
                    workspace_id=workspace_id,
                    automation=automation,
                    issue=issue,
                    actor_id=actor_id,
                    status=WorkspaceAutomationRunStatus.SKIPPED,
                    error="Conditions not met",
                )
                continue

            execute_automation(automation, issue, actor_id)

        return
    except Exception as exc:
        log_exception(exc)
        return
