# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import json
from datetime import date, datetime, timedelta
from typing import Any

# Third party imports
from celery import shared_task
from dateutil.relativedelta import relativedelta

# Django imports
from django.db import transaction
from django.utils import timezone

# Module imports
from plane.bgtasks.issue_activities_task import extract_ids, issue_activity
from plane.db.models import (
    Issue,
    IssueAssignee,
    IssueComment,
    IssueLabel,
    Project,
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
    triggers: list[str] = []
    requested_data = requested_data or {}
    current_instance = current_instance or {}

    if activity_type == "issue.activity.created":
        triggers.append(WorkspaceAutomationTriggerType.ISSUE_CREATED)

    if activity_type == "comment.activity.created":
        triggers.append(WorkspaceAutomationTriggerType.COMMENT_ADDED)

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

        if "priority" in requested_data:
            if str(current_instance.get("priority") or "") != str(requested_data.get("priority") or ""):
                triggers.append(WorkspaceAutomationTriggerType.PRIORITY_CHANGED)

        if "label_ids" in requested_data or "labels" in requested_data:
            requested_labels = extract_ids(requested_data, "label_ids", "labels")
            current_labels = extract_ids(current_instance, "label_ids", "labels")
            if requested_labels != current_labels:
                triggers.append(WorkspaceAutomationTriggerType.LABEL_CHANGED)

        if "name" in requested_data:
            if str(current_instance.get("name") or "") != str(requested_data.get("name") or ""):
                triggers.append(WorkspaceAutomationTriggerType.NAME_CHANGED)

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

    if trigger_type == WorkspaceAutomationTriggerType.PRIORITY_CHANGED:
        to_priority = trigger_config.get("to_priority")
        from_priority = trigger_config.get("from_priority")
        if to_priority and str(requested_data.get("priority") or "") != str(to_priority):
            return False
        if from_priority and str(current_instance.get("priority") or "") != str(from_priority):
            return False
        return True

    if trigger_type == WorkspaceAutomationTriggerType.LABEL_CHANGED:
        label_id = trigger_config.get("label_id")
        if not label_id:
            return True
        requested_labels = extract_ids(requested_data, "label_ids", "labels")
        current_labels = extract_ids(current_instance, "label_ids", "labels")
        added = requested_labels - current_labels
        return str(label_id) in added

    return True


def evaluate_condition(condition, issue: Issue) -> bool:
    field = condition.field
    operator = condition.operator
    expected = _normalize_values(condition.value)
    expected_text = next(iter(expected), "") if expected else ""

    if field == WorkspaceAutomationConditionField.STATE:
        actual = {str(issue.state_id)} if issue.state_id else set()
    elif field == WorkspaceAutomationConditionField.PRIORITY:
        actual = {str(issue.priority)} if issue.priority is not None else set()
    elif field == WorkspaceAutomationConditionField.LABEL:
        actual = {str(label_id) for label_id in issue.labels.values_list("id", flat=True)}
    elif field == WorkspaceAutomationConditionField.ASSIGNEE:
        actual = {str(assignee_id) for assignee_id in issue.assignees.values_list("id", flat=True)}
    elif field == WorkspaceAutomationConditionField.NAME_CONTAINS:
        name = (issue.name or "").lower()
        return bool(expected_text) and expected_text.lower() in name
    elif field == WorkspaceAutomationConditionField.ISSUE_TYPE:
        actual = {str(issue.type_id)} if issue.type_id else set()
    else:
        return False

    if operator == WorkspaceAutomationConditionOperator.CONTAINS:
        if field == WorkspaceAutomationConditionField.NAME_CONTAINS:
            return bool(expected_text) and expected_text.lower() in (issue.name or "").lower()
        return bool(actual & expected)

    if operator == WorkspaceAutomationConditionOperator.IS:
        if field in (
            WorkspaceAutomationConditionField.LABEL,
            WorkspaceAutomationConditionField.ASSIGNEE,
        ):
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
    assignee_ids = [
        str(assignee_id) for assignee_id in config.get("assignee_ids", []) if is_valid_uuid(str(assignee_id))
    ]
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


SOURCE_FIELDS = {
    "name",
    "priority",
    "state_id",
    "assignee_ids",
    "label_ids",
    "start_date",
    "target_date",
}
CREATE_WORK_ITEM_FIELD_KEYS = {
    "priority",
    "state_id",
    "assignee_ids",
    "label_ids",
    "start_date",
    "target_date",
}
DATE_FIELD_KEYS = {"start_date", "target_date"}
RELATIVE_DATE_UNITS = {"days", "weeks", "months"}
RELATIVE_DATE_BASES = {"now", "source.start_date", "source.target_date"}


def _as_date(value: Any) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None
    return None


def _read_source_field(issue: Issue, field: str) -> Any:
    if field == "name":
        return issue.name
    if field == "priority":
        return issue.priority
    if field == "state_id":
        return str(issue.state_id) if issue.state_id else None
    if field == "assignee_ids":
        return [str(assignee_id) for assignee_id in issue.assignees.values_list("id", flat=True)]
    if field == "label_ids":
        return [str(label_id) for label_id in issue.labels.values_list("id", flat=True)]
    if field == "start_date":
        return str(issue.start_date) if issue.start_date else None
    if field == "target_date":
        return str(issue.target_date) if issue.target_date else None
    raise ValueError(f"Unsupported source field: {field}")


def _resolve_relative_date(spec: dict, issue: Issue) -> str | None:
    base = spec.get("base") or "now"
    offset = spec.get("offset") or {}
    if base not in RELATIVE_DATE_BASES:
        raise ValueError(f"Invalid relative_date base: {base}")

    unit = offset.get("unit") or "days"
    if unit not in RELATIVE_DATE_UNITS:
        raise ValueError(f"Invalid relative_date unit: {unit}")

    try:
        amount = int(offset.get("amount", 0))
    except (TypeError, ValueError) as exc:
        raise ValueError("relative_date offset.amount must be an integer") from exc

    if base == "now":
        base_date = timezone.now().date()
    elif base == "source.start_date":
        base_date = _as_date(issue.start_date)
    else:
        base_date = _as_date(issue.target_date)

    if base_date is None:
        return None

    if unit == "days":
        resolved = base_date + timedelta(days=amount)
    elif unit == "weeks":
        resolved = base_date + timedelta(weeks=amount)
    else:
        resolved = base_date + relativedelta(months=amount)

    return resolved.isoformat()


def resolve_field_value(spec: Any, issue: Issue, *, expect_date: bool = False) -> Any:
    """Resolve a FieldValue spec against the source issue.

    Accepts legacy plain strings/lists as static values for backward compatibility.
    """
    if spec is None:
        return None

    if not isinstance(spec, dict) or "mode" not in spec:
        return spec

    mode = spec.get("mode")
    if mode == "static":
        return spec.get("value")

    if mode == "from_source":
        field = spec.get("field")
        if field not in SOURCE_FIELDS:
            raise ValueError(f"Invalid from_source field: {field}")
        return _read_source_field(issue, field)

    if mode == "relative_date":
        if not expect_date:
            raise ValueError("relative_date mode is only valid for date fields")
        return _resolve_relative_date(spec, issue)

    raise ValueError(f"Unsupported field value mode: {mode}")


def _normalize_name_spec(config: dict) -> dict:
    name_spec = config.get("name")
    if isinstance(name_spec, str):
        return {"mode": "static", "value": name_spec}
    if isinstance(name_spec, dict) and name_spec.get("mode"):
        return name_spec
    return {"mode": "static", "value": ""}


def _run_create_work_item(issue: Issue, config: dict, actor_id: str) -> None:
    project_id = config.get("project_id") or str(issue.project_id)
    if not is_valid_uuid(str(project_id)):
        raise ValueError("Invalid project_id for create_work_item action")

    project = Project.objects.filter(pk=project_id, workspace_id=issue.workspace_id).first()
    if not project:
        raise ValueError("Project not found for create_work_item action")

    name_spec = _normalize_name_spec(config)
    name = resolve_field_value(name_spec, issue)
    name = (str(name).strip() if name is not None else "")
    if not name:
        raise ValueError("name is required for create_work_item action")

    issue_type_id = config.get("issue_type_id")
    if issue_type_id and not is_valid_uuid(str(issue_type_id)):
        issue_type_id = None

    fields = config.get("fields") or {}
    if not isinstance(fields, dict):
        raise ValueError("fields must be an object for create_work_item")

    resolved: dict[str, Any] = {}
    for field_key, field_spec in fields.items():
        if field_key not in CREATE_WORK_ITEM_FIELD_KEYS:
            continue
        resolved[field_key] = resolve_field_value(
            field_spec,
            issue,
            expect_date=field_key in DATE_FIELD_KEYS,
        )

    priority = resolved.get("priority")
    if priority is None:
        priority = "none"

    state_id = resolved.get("state_id")
    if state_id and not is_valid_uuid(str(state_id)):
        state_id = None
    if state_id:
        state = State.objects.filter(pk=state_id, project_id=project.id).first()
        if not state:
            raise ValueError("State not found in target project for create_work_item")
        state_id = state.id

    start_date = _as_date(resolved.get("start_date"))
    target_date = _as_date(resolved.get("target_date"))

    new_issue = Issue(
        name=name[:255],
        project_id=project.id,
        workspace_id=project.workspace_id,
        created_by_id=actor_id,
        updated_by_id=actor_id,
        priority=priority or "none",
        state_id=state_id,
        start_date=start_date,
        target_date=target_date,
    )
    if issue_type_id:
        new_issue.type_id = issue_type_id
    new_issue.save()

    assignee_ids = resolved.get("assignee_ids") or []
    if isinstance(assignee_ids, str):
        assignee_ids = [assignee_ids]
    assignee_ids = [str(aid) for aid in assignee_ids if is_valid_uuid(str(aid))]
    if assignee_ids:
        IssueAssignee.objects.bulk_create(
            [
                IssueAssignee(
                    issue=new_issue,
                    assignee_id=assignee_id,
                    project_id=project.id,
                    workspace_id=project.workspace_id,
                    created_by_id=actor_id,
                    updated_by_id=actor_id,
                )
                for assignee_id in assignee_ids
            ],
            batch_size=10,
            ignore_conflicts=True,
        )

    label_ids = resolved.get("label_ids") or []
    if isinstance(label_ids, str):
        label_ids = [label_ids]
    label_ids = [str(lid) for lid in label_ids if is_valid_uuid(str(lid))]
    if label_ids:
        IssueLabel.objects.bulk_create(
            [
                IssueLabel(
                    issue=new_issue,
                    label_id=label_id,
                    project_id=project.id,
                    workspace_id=project.workspace_id,
                    created_by_id=actor_id,
                    updated_by_id=actor_id,
                )
                for label_id in label_ids
            ],
            batch_size=10,
            ignore_conflicts=True,
        )

    issue_activity.delay(
        type="issue.activity.created",
        requested_data=json.dumps(
            {
                "name": new_issue.name,
                "automation": True,
                "source_issue_id": str(issue.id),
            }
        ),
        current_instance=None,
        issue_id=str(new_issue.id),
        actor_id=str(actor_id),
        project_id=str(project.id),
        epoch=int(timezone.now().timestamp()),
        subscriber=False,
        notification=True,
    )


def _run_change_property(issue: Issue, config: dict, actor_id: str) -> None:
    property_key = config.get("property")
    value = config.get("value")
    if not property_key:
        raise ValueError("property is required for change_property action")

    if property_key == "priority":
        current = {"priority": issue.priority}
        issue.priority = value or "none"
        issue.save(update_fields=["priority", "updated_at"])
        requested = {"priority": issue.priority, "automation": True}
    elif property_key == "state_id":
        if not value or not is_valid_uuid(str(value)):
            raise ValueError("Invalid state_id value for change_property")
        return _run_change_state(issue, {"state_id": value}, actor_id)
    elif property_key == "name":
        current = {"name": issue.name}
        issue.name = str(value or "")[:255]
        issue.save(update_fields=["name", "updated_at"])
        requested = {"name": issue.name, "automation": True}
    elif property_key == "target_date":
        current = {"target_date": str(issue.target_date) if issue.target_date else None}
        issue.target_date = value or None
        issue.save(update_fields=["target_date", "updated_at"])
        requested = {"target_date": str(issue.target_date) if issue.target_date else None, "automation": True}
    elif property_key == "assignee_ids":
        assignee_ids = value if isinstance(value, list) else ([value] if value else [])
        return _run_assign(issue, {"assignee_ids": assignee_ids}, actor_id)
    else:
        raise ValueError(f"Unsupported property for change_property: {property_key}")

    issue_activity.delay(
        type="issue.activity.updated",
        requested_data=json.dumps(requested),
        current_instance=json.dumps(current),
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
    WorkspaceAutomationActionType.CREATE_WORK_ITEM: _run_create_work_item,
    WorkspaceAutomationActionType.CHANGE_PROPERTY: _run_change_property,
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

        if requested.get("automation"):
            return

        issue = (
            Issue.issue_objects.filter(pk=issue_id, project_id=project_id)
            .prefetch_related("labels", "assignees")
            .select_related("state", "type")
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
