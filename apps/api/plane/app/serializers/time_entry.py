# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.db.models import TimeEntry
from plane.db.models.time_entry import compute_duration_minutes


class TimeEntrySerializer(BaseSerializer):
    is_running = serializers.BooleanField(read_only=True)
    issue_detail = serializers.SerializerMethodField()
    project_detail = serializers.SerializerMethodField()
    logged_by_detail = serializers.SerializerMethodField()

    class Meta:
        model = TimeEntry
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "project",
            "issue",
            "logged_by",
            "created_by",
            "updated_by",
        ]

    def get_issue_detail(self, obj):
        issue = getattr(obj, "issue", None)
        if not issue:
            return None
        return {
            "id": str(issue.id),
            "name": issue.name,
            "sequence_id": issue.sequence_id,
            "project_id": str(issue.project_id),
        }

    def get_project_detail(self, obj):
        project = getattr(obj, "project", None)
        if not project:
            return None
        return {
            "id": str(project.id),
            "name": project.name,
            "identifier": project.identifier,
        }

    def get_logged_by_detail(self, obj):
        user = getattr(obj, "logged_by", None)
        if not user:
            return None
        return {
            "id": str(user.id),
            "display_name": user.display_name,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "avatar_url": getattr(user, "avatar_url", None),
        }

    def validate(self, data):
        duration = data.get("duration", getattr(self.instance, "duration", None))
        started_at = data.get("started_at", getattr(self.instance, "started_at", None))
        stopped_at = data.get("stopped_at", getattr(self.instance, "stopped_at", None))

        if duration is not None and duration < 0:
            raise serializers.ValidationError({"duration": "Duration cannot be negative"})

        if started_at and stopped_at and stopped_at < started_at:
            raise serializers.ValidationError({"stopped_at": "stopped_at must be after started_at"})

        # Recompute duration when both timestamps are present and duration was not explicitly sent
        if (
            started_at
            and stopped_at
            and "duration" not in getattr(self, "initial_data", {})
            and self.instance is None
        ):
            data["duration"] = compute_duration_minutes(started_at, stopped_at)

        return data


class TimeEntryLiteSerializer(BaseSerializer):
    is_running = serializers.BooleanField(read_only=True)

    class Meta:
        model = TimeEntry
        fields = [
            "id",
            "issue_id",
            "project_id",
            "workspace_id",
            "logged_by_id",
            "description",
            "started_at",
            "stopped_at",
            "duration",
            "is_running",
            "created_at",
            "updated_at",
        ]
