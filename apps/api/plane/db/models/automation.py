# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.db import models

# Module imports
from .base import BaseModel


class WorkspaceAutomationTriggerType(models.TextChoices):
    ISSUE_CREATED = "issue_created", "Issue created"
    STATE_CHANGED = "state_changed", "State changed"
    ASSIGNEE_CHANGED = "assignee_changed", "Assignee changed"


class WorkspaceAutomationConditionField(models.TextChoices):
    STATE = "state", "State"
    PRIORITY = "priority", "Priority"
    LABEL = "label", "Label"


class WorkspaceAutomationConditionOperator(models.TextChoices):
    IS = "is", "Is"
    IS_ANY_OF = "is_any_of", "Is any of"


class WorkspaceAutomationActionType(models.TextChoices):
    CHANGE_STATE = "change_state", "Change state"
    ASSIGN = "assign", "Assign"
    ADD_COMMENT = "add_comment", "Add comment"


class WorkspaceAutomationRunStatus(models.TextChoices):
    SUCCESS = "success", "Success"
    FAILED = "failed", "Failed"
    SKIPPED = "skipped", "Skipped"


class WorkspaceAutomation(BaseModel):
    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="workspace_automations",
    )
    name = models.CharField(max_length=255)
    is_active = models.BooleanField(default=True)
    trigger_type = models.CharField(
        max_length=50,
        choices=WorkspaceAutomationTriggerType.choices,
    )
    # Optional trigger filters, e.g. {"to_state_id": "...", "from_state_id": "..."}
    trigger_config = models.JSONField(default=dict, blank=True)
    # Empty list means all projects in the workspace
    project_ids = models.JSONField(default=list, blank=True)

    class Meta:
        verbose_name = "Workspace Automation"
        verbose_name_plural = "Workspace Automations"
        db_table = "workspace_automations"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.workspace_id} {self.name}"


class WorkspaceAutomationCondition(BaseModel):
    automation = models.ForeignKey(
        WorkspaceAutomation,
        on_delete=models.CASCADE,
        related_name="conditions",
    )
    field = models.CharField(
        max_length=50,
        choices=WorkspaceAutomationConditionField.choices,
    )
    operator = models.CharField(
        max_length=50,
        choices=WorkspaceAutomationConditionOperator.choices,
        default=WorkspaceAutomationConditionOperator.IS,
    )
    # Single value or list depending on operator, e.g. "uuid" or ["uuid1", "uuid2"]
    value = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = "Workspace Automation Condition"
        verbose_name_plural = "Workspace Automation Conditions"
        db_table = "workspace_automation_conditions"
        ordering = ("created_at",)

    def __str__(self):
        return f"{self.automation_id} {self.field} {self.operator}"


class WorkspaceAutomationAction(BaseModel):
    automation = models.ForeignKey(
        WorkspaceAutomation,
        on_delete=models.CASCADE,
        related_name="actions",
    )
    action_type = models.CharField(
        max_length=50,
        choices=WorkspaceAutomationActionType.choices,
    )
    config = models.JSONField(default=dict, blank=True)
    sequence = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "Workspace Automation Action"
        verbose_name_plural = "Workspace Automation Actions"
        db_table = "workspace_automation_actions"
        ordering = ("sequence", "created_at")

    def __str__(self):
        return f"{self.automation_id} {self.action_type}"


class WorkspaceAutomationRun(BaseModel):
    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="workspace_automation_runs",
    )
    automation = models.ForeignKey(
        WorkspaceAutomation,
        on_delete=models.CASCADE,
        related_name="runs",
    )
    issue = models.ForeignKey(
        "db.Issue",
        on_delete=models.CASCADE,
        related_name="automation_runs",
        null=True,
        blank=True,
    )
    status = models.CharField(
        max_length=20,
        choices=WorkspaceAutomationRunStatus.choices,
        default=WorkspaceAutomationRunStatus.SUCCESS,
    )
    error = models.TextField(blank=True, default="")
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="automation_runs",
        null=True,
        blank=True,
    )

    class Meta:
        verbose_name = "Workspace Automation Run"
        verbose_name_plural = "Workspace Automation Runs"
        db_table = "workspace_automation_runs"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.automation_id} {self.status}"
