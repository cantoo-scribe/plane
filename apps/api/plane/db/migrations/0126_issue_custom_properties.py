# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0125_project_is_okr_issue_cross_links"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="IssueCustomProperty",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                (
                    "id",
                    models.UUIDField(
                        db_index=True,
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                        unique=True,
                    ),
                ),
                ("name", models.CharField(max_length=255)),
                ("description", models.TextField(blank=True, default="")),
                (
                    "property_type",
                    models.CharField(
                        choices=[
                            ("TEXT", "Text"),
                            ("NUMBER", "Number"),
                            ("DROPDOWN", "Dropdown"),
                            ("BOOLEAN", "Boolean"),
                            ("DATE", "Date"),
                            ("MEMBER", "Member picker"),
                            ("FORMULA", "Formula"),
                        ],
                        default="TEXT",
                        max_length=20,
                    ),
                ),
                ("is_required", models.BooleanField(default=False)),
                ("is_active", models.BooleanField(default=True)),
                ("settings", models.JSONField(blank=True, default=dict)),
                ("default_value", models.JSONField(blank=True, default=None, null=True)),
                ("sort_order", models.FloatField(default=65535)),
                ("logo_props", models.JSONField(blank=True, default=dict)),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_created_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Created By",
                    ),
                ),
                (
                    "issue_type",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="custom_properties",
                        to="db.issuetype",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_updated_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Last Modified By",
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="issue_custom_properties",
                        to="db.workspace",
                    ),
                ),
            ],
            options={
                "verbose_name": "Issue Custom Property",
                "verbose_name_plural": "Issue Custom Properties",
                "db_table": "issue_custom_properties",
                "ordering": ("sort_order", "name"),
            },
        ),
        migrations.CreateModel(
            name="IssueCustomPropertyOption",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                (
                    "id",
                    models.UUIDField(
                        db_index=True,
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                        unique=True,
                    ),
                ),
                ("name", models.CharField(max_length=255)),
                ("description", models.TextField(blank=True, default="")),
                ("sort_order", models.FloatField(default=65535)),
                ("is_active", models.BooleanField(default=True)),
                ("logo_props", models.JSONField(blank=True, default=dict)),
                ("is_default", models.BooleanField(default=False)),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_created_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Created By",
                    ),
                ),
                (
                    "property",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="options",
                        to="db.issuecustomproperty",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_updated_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Last Modified By",
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="issue_custom_property_options",
                        to="db.workspace",
                    ),
                ),
            ],
            options={
                "verbose_name": "Issue Custom Property Option",
                "verbose_name_plural": "Issue Custom Property Options",
                "db_table": "issue_custom_property_options",
                "ordering": ("sort_order", "name"),
            },
        ),
        migrations.CreateModel(
            name="IssueCustomPropertyValue",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                (
                    "id",
                    models.UUIDField(
                        db_index=True,
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                        unique=True,
                    ),
                ),
                ("value_text", models.TextField(blank=True, null=True)),
                ("value_number", models.FloatField(blank=True, null=True)),
                ("value_boolean", models.BooleanField(blank=True, null=True)),
                ("value_datetime", models.DateTimeField(blank=True, null=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_created_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Created By",
                    ),
                ),
                (
                    "issue",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="custom_property_values",
                        to="db.issue",
                    ),
                ),
                (
                    "project",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="project_%(class)s",
                        to="db.project",
                    ),
                ),
                (
                    "property",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="values",
                        to="db.issuecustomproperty",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_updated_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Last Modified By",
                    ),
                ),
                (
                    "value_members",
                    models.ManyToManyField(
                        blank=True,
                        related_name="custom_property_member_values",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "value_options",
                    models.ManyToManyField(
                        blank=True,
                        related_name="selected_values",
                        to="db.issuecustompropertyoption",
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="workspace_%(class)s",
                        to="db.workspace",
                    ),
                ),
            ],
            options={
                "verbose_name": "Issue Custom Property Value",
                "verbose_name_plural": "Issue Custom Property Values",
                "db_table": "issue_custom_property_values",
                "ordering": ("-created_at",),
            },
        ),
        migrations.AddConstraint(
            model_name="issuecustomproperty",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("issue_type", "name"),
                name="icp_unique_type_name_when_deleted_at_null",
            ),
        ),
        migrations.AddConstraint(
            model_name="issuecustompropertyoption",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("property", "name"),
                name="icpo_unique_name_when_deleted_at_null",
            ),
        ),
        migrations.AddConstraint(
            model_name="issuecustompropertyvalue",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("issue", "property"),
                name="icpv_unique_issue_property_when_deleted_at_null",
            ),
        ),
        migrations.AddIndex(
            model_name="issuecustompropertyvalue",
            index=models.Index(fields=["issue", "property"], name="issue_custo_issue_i_prop_idx"),
        ),
        migrations.AddIndex(
            model_name="issuecustompropertyvalue",
            index=models.Index(fields=["property", "value_number"], name="issue_custo_prop_num_idx"),
        ),
        migrations.AddIndex(
            model_name="issuecustompropertyvalue",
            index=models.Index(fields=["property", "value_boolean"], name="issue_custo_prop_bool_idx"),
        ),
        migrations.AddIndex(
            model_name="issuecustompropertyvalue",
            index=models.Index(fields=["property", "value_datetime"], name="issue_custo_prop_dt_idx"),
        ),
    ]
