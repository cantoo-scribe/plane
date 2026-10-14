# Generated manually for time tracking MVP

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0122_alter_draftissue_assignees_alter_issue_assignees_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name="estimate",
            name="type",
            field=models.CharField(
                choices=[("categories", "Categories"), ("points", "Points"), ("time", "Time")],
                default="categories",
                max_length=255,
            ),
        ),
        migrations.CreateModel(
            name="TimeEntry",
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
                ("description", models.TextField(blank=True, default="")),
                ("started_at", models.DateTimeField()),
                ("stopped_at", models.DateTimeField(blank=True, null=True)),
                ("duration", models.PositiveIntegerField(default=0, help_text="Duration in minutes")),
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
                        related_name="time_entries",
                        to="db.issue",
                    ),
                ),
                (
                    "logged_by",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="time_entries",
                        to=settings.AUTH_USER_MODEL,
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
                        related_name="workspace_%(class)s",
                        to="db.workspace",
                    ),
                ),
            ],
            options={
                "verbose_name": "Time Entry",
                "verbose_name_plural": "Time Entries",
                "db_table": "time_entries",
                "ordering": ("-started_at",),
                "indexes": [
                    models.Index(fields=["logged_by", "stopped_at"], name="time_entrie_logged__b8c0e1_idx"),
                    models.Index(fields=["issue", "started_at"], name="time_entrie_issue_i_6a2f1c_idx"),
                    models.Index(fields=["project", "started_at"], name="time_entrie_project_9d4a2b_idx"),
                    models.Index(fields=["workspace", "started_at"], name="time_entrie_workspa_3e7c5d_idx"),
                ],
            },
        ),
        migrations.AddConstraint(
            model_name="timeentry",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True), ("stopped_at__isnull", True)),
                fields=("logged_by",),
                name="time_entry_one_running_per_user",
            ),
        ),
    ]
