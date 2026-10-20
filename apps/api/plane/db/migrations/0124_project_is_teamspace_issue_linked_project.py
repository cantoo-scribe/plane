# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import django.db.models.deletion
from django.db import migrations, models


def flag_pole_projects_as_teamspaces(apps, schema_editor):
    """Mark existing 'Pôle *' projects as teamspaces and strip the prefix."""
    Project = apps.get_model("db", "Project")
    for project in Project.objects.filter(name__startswith="Pôle ", deleted_at__isnull=True):
        new_name = project.name.replace("Pôle ", "", 1).strip()
        project.is_teamspace = True
        if new_name:
            project.name = new_name
        project.save(update_fields=["is_teamspace", "name", "updated_at"])


def unflag_teamspaces(apps, schema_editor):
    Project = apps.get_model("db", "Project")
    Project.objects.filter(is_teamspace=True).update(is_teamspace=False)


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0123_timeentry_alter_estimate_type"),
    ]

    operations = [
        migrations.AddField(
            model_name="project",
            name="is_teamspace",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="issue",
            name="linked_project",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="linked_issues",
                to="db.project",
            ),
        ),
        migrations.RunPython(flag_pole_projects_as_teamspaces, unflag_teamspaces),
    ]
