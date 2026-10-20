# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.db import models
from django.db.models import Q

# Module imports
from .base import BaseModel
from .project import ProjectBaseModel


class IssueCustomPropertyType(models.TextChoices):
    TEXT = "TEXT", "Text"
    NUMBER = "NUMBER", "Number"
    DROPDOWN = "DROPDOWN", "Dropdown"
    BOOLEAN = "BOOLEAN", "Boolean"
    DATE = "DATE", "Date"
    MEMBER = "MEMBER", "Member picker"
    FORMULA = "FORMULA", "Formula"


class IssueCustomProperty(BaseModel):
    """Definition of a custom property attached to a work item type."""

    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="issue_custom_properties",
    )
    issue_type = models.ForeignKey(
        "db.IssueType",
        on_delete=models.CASCADE,
        related_name="custom_properties",
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    property_type = models.CharField(
        max_length=20,
        choices=IssueCustomPropertyType.choices,
        default=IssueCustomPropertyType.TEXT,
    )
    is_required = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    settings = models.JSONField(default=dict, blank=True)
    default_value = models.JSONField(default=None, null=True, blank=True)
    sort_order = models.FloatField(default=65535)
    logo_props = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = "Issue Custom Property"
        verbose_name_plural = "Issue Custom Properties"
        db_table = "issue_custom_properties"
        ordering = ("sort_order", "name")
        constraints = [
            models.UniqueConstraint(
                fields=["issue_type", "name"],
                condition=Q(deleted_at__isnull=True),
                name="icp_unique_type_name_when_deleted_at_null",
            )
        ]

    def __str__(self):
        return f"{self.issue_type_id} - {self.name}"


class IssueCustomPropertyOption(BaseModel):
    """Option for dropdown custom properties."""

    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="issue_custom_property_options",
    )
    property = models.ForeignKey(
        IssueCustomProperty,
        on_delete=models.CASCADE,
        related_name="options",
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    sort_order = models.FloatField(default=65535)
    is_active = models.BooleanField(default=True)
    logo_props = models.JSONField(default=dict, blank=True)
    is_default = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Issue Custom Property Option"
        verbose_name_plural = "Issue Custom Property Options"
        db_table = "issue_custom_property_options"
        ordering = ("sort_order", "name")
        constraints = [
            models.UniqueConstraint(
                fields=["property", "name"],
                condition=Q(deleted_at__isnull=True),
                name="icpo_unique_name_when_deleted_at_null",
            )
        ]

    def __str__(self):
        return f"{self.property_id} - {self.name}"


class IssueCustomPropertyValue(ProjectBaseModel):
    """Stored value of a custom property for a work item."""

    issue = models.ForeignKey(
        "db.Issue",
        on_delete=models.CASCADE,
        related_name="custom_property_values",
    )
    property = models.ForeignKey(
        IssueCustomProperty,
        on_delete=models.CASCADE,
        related_name="values",
    )
    value_text = models.TextField(blank=True, null=True)
    value_number = models.FloatField(blank=True, null=True)
    value_boolean = models.BooleanField(blank=True, null=True)
    value_datetime = models.DateTimeField(blank=True, null=True)
    value_options = models.ManyToManyField(
        IssueCustomPropertyOption,
        blank=True,
        related_name="selected_values",
    )
    value_members = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name="custom_property_member_values",
    )

    class Meta:
        verbose_name = "Issue Custom Property Value"
        verbose_name_plural = "Issue Custom Property Values"
        db_table = "issue_custom_property_values"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["issue", "property"],
                condition=Q(deleted_at__isnull=True),
                name="icpv_unique_issue_property_when_deleted_at_null",
            )
        ]
        indexes = [
            models.Index(fields=["issue", "property"]),
            models.Index(fields=["property", "value_number"]),
            models.Index(fields=["property", "value_boolean"]),
            models.Index(fields=["property", "value_datetime"]),
        ]

    def __str__(self):
        return f"{self.issue_id} - {self.property_id}"
