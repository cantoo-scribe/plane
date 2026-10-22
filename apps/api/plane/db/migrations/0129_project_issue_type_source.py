# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import migrations, models


def backfill_issue_type_source(apps, schema_editor):
    Project = apps.get_model("db", "Project")
    ProjectIssueType = apps.get_model("db", "ProjectIssueType")
    project_ids_with_types = (
        ProjectIssueType.objects.filter(deleted_at__isnull=True)
        .values_list("project_id", flat=True)
        .distinct()
    )
    Project.objects.filter(id__in=project_ids_with_types).update(issue_type_source="CUSTOM")
    Project.objects.exclude(id__in=project_ids_with_types).update(issue_type_source="WORKSPACE")


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0128_workspace_automations"),
    ]

    operations = [
        migrations.AddField(
            model_name="project",
            name="issue_type_source",
            field=models.CharField(
                choices=[("WORKSPACE", "Workspace"), ("CUSTOM", "Custom")],
                default="WORKSPACE",
                max_length=20,
            ),
        ),
        migrations.RunPython(backfill_issue_type_source, noop_reverse),
    ]
