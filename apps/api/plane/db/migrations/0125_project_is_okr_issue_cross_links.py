# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import django.db.models.deletion
from django.db import migrations, models


def split_linked_project_and_flag_okrs(apps, schema_editor):
    """Move pole links out of linked_project into linked_teamspace; flag OKR26."""
    Project = apps.get_model("db", "Project")
    Issue = apps.get_model("db", "Issue")
    # Historical Issue may not expose ``objects`` (only ``issue_objects`` on the live model).
    issue_manager = getattr(Issue, "objects", None) or Issue._default_manager
    project_manager = Project.objects

    project_manager.filter(identifier="OKR26", deleted_at__isnull=True).update(is_okr=True)

    teamspace_ids = set(
        project_manager.filter(is_teamspace=True, deleted_at__isnull=True).values_list("id", flat=True)
    )
    for issue in issue_manager.filter(linked_project_id__isnull=False, deleted_at__isnull=True).iterator():
        if issue.linked_project_id in teamspace_ids:
            issue.linked_teamspace_id = issue.linked_project_id
            issue.linked_project_id = None
            issue.save(update_fields=["linked_teamspace_id", "linked_project_id", "updated_at"])


def merge_linked_teamspace_into_linked_project(apps, schema_editor):
    Issue = apps.get_model("db", "Issue")
    Project = apps.get_model("db", "Project")
    issue_manager = getattr(Issue, "objects", None) or Issue._default_manager
    for issue in issue_manager.filter(linked_teamspace_id__isnull=False, deleted_at__isnull=True).iterator():
        issue.linked_project_id = issue.linked_teamspace_id
        issue.linked_teamspace_id = None
        issue.save(update_fields=["linked_project_id", "linked_teamspace_id", "updated_at"])
    Project.objects.filter(is_okr=True).update(is_okr=False)


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0124_project_is_teamspace_issue_linked_project"),
    ]

    operations = [
        migrations.AddField(
            model_name="project",
            name="is_okr",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="issue",
            name="linked_teamspace",
            field=models.ForeignKey(
                blank=True,
                help_text="Optional teamspace / pôle link",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="teamspace_linked_issues",
                to="db.project",
            ),
        ),
        migrations.AddField(
            model_name="issue",
            name="linked_okr",
            field=models.ForeignKey(
                blank=True,
                help_text="Optional OKR link",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="okr_linked_issues",
                to="db.project",
            ),
        ),
        migrations.AlterField(
            model_name="issue",
            name="linked_project",
            field=models.ForeignKey(
                blank=True,
                help_text="Optional regular (client) project link",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="linked_issues",
                to="db.project",
            ),
        ),
        migrations.RunPython(split_linked_project_and_flag_okrs, merge_linked_teamspace_into_linked_project),
    ]
