# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.db.models import IssueType, ProjectIssueType


class IssueTypeSerializer(BaseSerializer):
    is_default = serializers.SerializerMethodField()
    level = serializers.SerializerMethodField()
    project_ids = serializers.SerializerMethodField()

    class Meta:
        model = IssueType
        fields = [
            "id",
            "workspace_id",
            "name",
            "description",
            "logo_props",
            "is_epic",
            "is_default",
            "is_active",
            "level",
            "project_ids",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["workspace", "is_epic"]

    def _project_issue_type(self, obj):
        project_id = self.context.get("project_id")
        if not project_id:
            return None
        return next(
            (pit for pit in obj.project_issue_types.all() if str(pit.project_id) == str(project_id)),
            None,
        )

    def get_is_default(self, obj):
        pit = self._project_issue_type(obj)
        if pit is not None:
            return pit.is_default
        return obj.is_default

    def get_level(self, obj):
        pit = self._project_issue_type(obj)
        if pit is not None:
            return pit.level
        return obj.level

    def get_project_ids(self, obj):
        return [str(pit.project_id) for pit in obj.project_issue_types.all()]


class ProjectIssueTypeSerializer(BaseSerializer):
    issue_type = IssueTypeSerializer(read_only=True)
    issue_type_id = serializers.UUIDField(write_only=True, required=False)

    class Meta:
        model = ProjectIssueType
        fields = [
            "id",
            "project_id",
            "workspace_id",
            "issue_type",
            "issue_type_id",
            "level",
            "is_default",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["workspace", "project"]
