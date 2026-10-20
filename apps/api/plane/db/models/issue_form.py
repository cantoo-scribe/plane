# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
from uuid import uuid4

# Django imports
from django.db import models
from django.db.models import Q

# Module imports
from .project import ProjectBaseModel


def get_form_anchor():
    return uuid4().hex


class IssueFormFieldTargetKind(models.TextChoices):
    CORE = "CORE", "Core"
    CUSTOM = "CUSTOM", "Custom"


class IssueFormCoreKey(models.TextChoices):
    NAME = "name", "Name"
    DESCRIPTION_HTML = "description_html", "Description"
    PRIORITY = "priority", "Priority"
    LABEL_IDS = "label_ids", "Labels"


# Custom property types allowed on public form submissions
PUBLIC_FORM_CUSTOM_PROPERTY_TYPES = ("TEXT", "NUMBER", "DROPDOWN", "BOOLEAN", "DATE")


class IssueForm(ProjectBaseModel):
    """Configurable public form that creates a work item on submit."""

    issue_type = models.ForeignKey(
        "db.IssueType",
        on_delete=models.CASCADE,
        related_name="issue_forms",
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    logo_props = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)
    anchor = models.CharField(max_length=255, default=get_form_anchor, unique=True, db_index=True)
    target_state = models.ForeignKey(
        "db.State",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="issue_forms",
    )

    class Meta:
        verbose_name = "Issue Form"
        verbose_name_plural = "Issue Forms"
        db_table = "issue_forms"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["project", "name"],
                condition=Q(deleted_at__isnull=True),
                name="issue_form_unique_project_name_when_deleted_at_null",
            )
        ]

    def __str__(self):
        return f"{self.project_id} - {self.name}"

    def renew_anchor(self):
        self.anchor = get_form_anchor()
        self.save(update_fields=["anchor", "updated_at"])
        return self.anchor


class IssueFormField(ProjectBaseModel):
    """A single question on an IssueForm, mapped to a core or custom property."""

    form = models.ForeignKey(
        IssueForm,
        on_delete=models.CASCADE,
        related_name="fields",
    )
    sort_order = models.FloatField(default=65535)
    label = models.CharField(max_length=255)
    help_text = models.TextField(blank=True, default="")
    is_required = models.BooleanField(default=False)
    is_visible = models.BooleanField(default=True)
    target_kind = models.CharField(
        max_length=20,
        choices=IssueFormFieldTargetKind.choices,
        default=IssueFormFieldTargetKind.CORE,
    )
    core_key = models.CharField(
        max_length=50,
        choices=IssueFormCoreKey.choices,
        blank=True,
        null=True,
    )
    custom_property = models.ForeignKey(
        "db.IssueCustomProperty",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="form_fields",
    )

    class Meta:
        verbose_name = "Issue Form Field"
        verbose_name_plural = "Issue Form Fields"
        db_table = "issue_form_fields"
        ordering = ("sort_order", "created_at")

    def __str__(self):
        return f"{self.form_id} - {self.label}"

    def clean(self):
        from django.core.exceptions import ValidationError

        errors = {}
        if self.target_kind == IssueFormFieldTargetKind.CORE:
            if not self.core_key:
                errors["core_key"] = "core_key is required for CORE fields"
            if self.custom_property_id:
                errors["custom_property"] = "custom_property must be empty for CORE fields"
        elif self.target_kind == IssueFormFieldTargetKind.CUSTOM:
            if not self.custom_property_id:
                errors["custom_property"] = "custom_property is required for CUSTOM fields"
            if self.core_key:
                errors["core_key"] = "core_key must be empty for CUSTOM fields"
        if errors:
            raise ValidationError(errors)
