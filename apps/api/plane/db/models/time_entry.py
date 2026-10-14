# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone

# Module imports
from .project import ProjectBaseModel


def compute_duration_minutes(started_at, stopped_at):
    """Return elapsed minutes between two datetimes (minimum 1 when both set)."""
    if not started_at or not stopped_at:
        return 0
    seconds = (stopped_at - started_at).total_seconds()
    if seconds <= 0:
        return 0
    return max(1, int(round(seconds / 60)))


class TimeEntry(ProjectBaseModel):
    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="time_entries")
    logged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="time_entries",
    )
    description = models.TextField(blank=True, default="")
    started_at = models.DateTimeField()
    stopped_at = models.DateTimeField(null=True, blank=True)
    duration = models.PositiveIntegerField(default=0, help_text="Duration in minutes")

    class Meta:
        verbose_name = "Time Entry"
        verbose_name_plural = "Time Entries"
        db_table = "time_entries"
        ordering = ("-started_at",)
        indexes = [
            models.Index(fields=["logged_by", "stopped_at"]),
            models.Index(fields=["issue", "started_at"]),
            models.Index(fields=["project", "started_at"]),
            models.Index(fields=["workspace", "started_at"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["logged_by"],
                condition=Q(stopped_at__isnull=True, deleted_at__isnull=True),
                name="time_entry_one_running_per_user",
            )
        ]

    def __str__(self):
        return f"{self.logged_by_id} → {self.issue_id} ({self.duration}m)"

    @property
    def is_running(self):
        return self.stopped_at is None

    def stop(self, stopped_at=None):
        """Stop a running timer and persist duration."""
        if self.stopped_at is not None:
            return self
        self.stopped_at = stopped_at or timezone.now()
        self.duration = compute_duration_minutes(self.started_at, self.stopped_at)
        self.save(update_fields=["stopped_at", "duration", "updated_at"])
        return self

    @classmethod
    def stop_running_for_user(cls, user_id, stopped_at=None):
        """Stop any running timer for the user. Returns the stopped entry or None."""
        running = cls.objects.filter(logged_by_id=user_id, stopped_at__isnull=True).first()
        if running:
            return running.stop(stopped_at=stopped_at)
        return None
